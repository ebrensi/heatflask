/*
 * HeatflaskLayer -- activity paths and animated dots, drawn with WebGL inside
 * MapLibre GL as a custom style layer.
 *
 * This replaces DotLayer, which drew with Canvas 2D onto two canvases laid
 * over Leaflet's map pane and had to chase the map's CSS transforms through
 * every pan, zoom and pinch. Here the dots and paths are part of the map's
 * own frame: MapLibre hands us its camera matrix and we draw into its
 * framebuffer, so they cannot fall out of step with the basemap, and pitch,
 * rotation and terrain come for free.
 *
 * The dots are computed entirely on the GPU. Each stream is uploaded once, as
 * a texture, and a frame sends nothing but the animation phase; the vertex
 * shader works out where every dot is. See DOT_VS in shaders.ts for the model.
 *
 * The paths stay on the CPU, where the per-zoom simplified index sets and
 * in-view segment masks from ActivityCollection already are. They only change
 * when the view does, so they are rebuilt when it moves, not every frame.
 *
 * Coordinates: activities store their tracks in zoom-0 world pixels (a 256px
 * square world). MapLibre's matrix wants Mercator units (the same square
 * scaled to 1). Vertices are uploaded relative to an origin near the viewport
 * and the model matrix adds the origin back in float64 -- see shaders.ts.
 *
 * Height: with terrain on, each vertex's z is its recorded altitude, shifted
 * by a per-activity offset measured against the terrain model (GPS and
 * barometric altitude are routinely tens of metres off), and multiplied by the
 * terrain's exaggeration. With terrain off, z is ignored and the map is flat.
 */

import type {
  Map as MLMap,
  CustomLayerInterface,
  CustomRenderMethodInput,
} from "maplibre-gl"

import * as ActivityCollection from "../DotLayer/ActivityCollection"
import { options as defaultOptions } from "../DotLayer/Defaults"
import { makePT, px2lngLat, WORLD_PX } from "../DotLayer/CRS"
import { Bounds } from "../Bounds"
import { ADMIN } from "../Env"
import {
  PATH_VS,
  PATH_FS,
  DOT_VS,
  DOT_FS,
  SHADOW_VS,
  SHADOW_FS,
} from "./shaders"
import {
  compileProgram,
  uniformLocations,
  multiply,
  packColor,
  VertexArray,
} from "./glUtil"

import type { VisualParameters } from "../Model"
import type { Activity } from "../DotLayer/Activity"

/* Dot size grows with zoom, so dots read as objects sitting in space rather
 * than decoration painted on the screen -- but only partly. Map scale is
 * already exponential in zoom (level z = scale 2**z), so a real object would
 * scale as 2**z, doubling every level. K is the fraction of that to apply:
 * 0 keeps a fixed pixel size, 1 is fully physical. */
const DOT_ZOOM_SCALING = 0.15
const DOT_ZOOM_REF = 4
const MIN_DOT_SIZE = 0.25

function dotSizeForZoom(dotScale: number, zoomLevel: number): number {
  const zoomFactor = 2 ** (DOT_ZOOM_SCALING * (zoomLevel - DOT_ZOOM_REF))
  return Math.max(MIN_DOT_SIZE, dotScale * zoomFactor)
}

/** How often, at most, to re-cull and rebuild the path buffer mid-gesture */
const REBUILD_INTERVAL_MS = 120

/** How far past the viewport to keep geometry, as a fraction of its size, so
 * a short pan does not uncover a gap before the next rebuild lands. */
const VIEWPORT_PAD = 0.25

/* Terrain anchoring. Each activity's altitude is shifted by the median
 * difference between the terrain model and its recorded altitude, sampled at
 * up to ALT_SAMPLES points, then lifted a little so the track is not half
 * buried in the terrain mesh. Re-measured when the view has zoomed in by
 * ALT_RECALIBRATE_ZOOM levels, since finer DEM tiles give a better answer. */
const ALT_SAMPLES = 24
const ALT_MIN_SAMPLES = 4
const ALT_LIFT_M = 3
const ALT_RECALIBRATE_ZOOM = 2

/* Whether terrain hides what is behind it. Off, dots and paths draw over
 * everything, as they did in 2D, and a track on the far side of a ridge
 * still shows. On is more physical, but a track that is a metre under the
 * terrain mesh flickers in and out. */
const DEPTH_TEST = false

/* The dot shadows are drawn and blurred offscreen at this fraction of the
 * drawing buffer's resolution, then stretched back over the map. They are
 * blurred by several pixels anyway, so half resolution is not visibly
 * coarser, and it has a quarter of the pixels to fill. See SHADOW_FS. */
const SHADOW_SCALE = 0.5

/* The height, in CSS px, of the light that shades the dots, against the
 * shadow's offset (see lightDirection). With the default 5px offset, 12 puts
 * the highlight a little above centre. */
const LIGHT_HEIGHT = 12

/* Dot streams are resampled onto a uniform grid of at most this many seconds,
 * or coarser for an activity so long it would otherwise take more than
 * MAX_SAMPLES_PER_ACTIVITY texels. Positions are linearly interpolated between
 * samples, so at 2s a dot strays from the recorded track by at most the
 * curvature of two seconds of travel. */
const SAMPLE_SECONDS = 2
const MAX_SAMPLES_PER_ACTIVITY = 16384

/**
 * How many grid steps to divide an activity into, given a target step.
 *
 * The grid is fitted to the activity rather than laid over it: the step is
 * shortened so that N of them land exactly on the end of the recording. With
 * a grid of fixed-length steps the last one runs past the end, and since a
 * sample past the end is not a position the athlete was ever at, it is marked
 * invalid -- which culled every dot in the final partial step, so an activity
 * drew nothing over its last seconds. Fitting the grid costs no extra texels
 * and leaves every instant of the activity bracketed by two real samples.
 */
function gridSteps(duration: number, dt: number): number {
  if (!(duration > 0)) return 1
  return Math.min(MAX_SAMPLES_PER_ACTIVITY, Math.ceil(duration / dt))
}

/* Texture layout. Sample offsets are carried as float32, which counts exactly
 * only to 2**24, so that caps the total -- as does the GPU's largest texture,
 * which WebGL2 only guarantees to be 2048 square. */
const TEXTURE_WIDTH = 4096
const MAX_TOTAL_SAMPLES = 2 ** 24
const META_TEXELS = 4

const latLng2px = makePT(0)

type Style = typeof defaultOptions.normal

/** Terrain internals: the public queryTerrainElevation recomputes the
 * covering tiles on every call, which is far too slow for thousands of
 * samples. */
type TerrainInternals = {
  exaggeration: number
  tileManager: { maxzoom: number }
  getElevationForLngLatZoom(
    lnglat: { lng: number; lat: number; wrap(): unknown },
    zoom: number
  ): number
}

export type LayerOptions = {
  visual: VisualParameters
  showPaths: boolean
  startPaused: boolean
}

export class HeatflaskLayer implements CustomLayerInterface {
  readonly id = "heatflask-activities"
  readonly type = "custom" as const
  readonly renderingMode = "3d" as const

  options: typeof defaultOptions & LayerOptions

  private map: MLMap
  private gl: WebGL2RenderingContext
  private visual: VisualParameters

  /* animation clock, in activity-seconds. It advances by (real elapsed) * tau
   * each frame, so turning the speed dial changes the rate of flow without
   * making the pattern jump. */
  private simTime: number
  private lastFrame: number
  private _paused: boolean
  private animating = false

  private ready = false

  /* origin the vertex buffers are relative to, in world px */
  private ox = 0
  private oy = 0

  private pathProgram: WebGLProgram
  private pathU: Record<string, WebGLUniformLocation>
  private pathVAO: WebGLVertexArrayObject
  private pathBuffer: WebGLBuffer
  private pathVA = new VertexArray()
  private pathInstances = 0

  private dotProgram: WebGLProgram
  private dotU: Record<string, WebGLUniformLocation>
  private dotVAO: WebGLVertexArrayObject
  private slotBuffer: WebGLBuffer
  private slotCount = 0
  private streamTexture: WebGLTexture
  private metaTexture: WebGLTexture
  private meta = new Float32Array(0)

  /* Dot shadows. In prerender the dots' silhouette is drawn into
   * shadowTextures[0] and blurred horizontally into [1]; render blurs that
   * vertically onto the map. */
  private shadowProgram: WebGLProgram
  private shadowU: Record<string, WebGLUniformLocation>
  private shadowVAO: WebGLVertexArrayObject
  private shadowTextures: WebGLTexture[] = []
  private shadowFramebuffers: WebGLFramebuffer[] = []
  private shadowWidth = 0
  private shadowHeight = 0
  /* whether prerender has set this frame up, and drawn its shadows */
  private framePrepared = false
  private shadowsDrawn = false
  private prerenderMs = 0
  /* what the slot buffer and the metadata were built for */
  private slotsT = NaN
  private slotsDirty = true
  private metaDirty = true
  /* per activity (by idx): the stream texture offset and its sample count */
  private sampleOffset = new Uint32Array(0)
  private sampleCount = new Uint32Array(0)
  private sampleRate = new Float32Array(0)
  private duration = new Float32Array(0)
  private originX = new Float64Array(0)
  private originY = new Float64Array(0)

  private matrix = new Float64Array(16)
  private model = new Float64Array(16)
  private matrix32 = new Float32Array(16)

  private rebuildTick = 0
  private lastRebuild = 0
  private rebuildTimer = 0

  private infoBox?: HTMLDivElement
  private frameTimes: number[] = []

  /** Called whenever what is drawn changes: the view, the activities or the
   * selection */
  onUpdate?: () => void

  constructor(opts: LayerOptions) {
    this.options = { ...defaultOptions, ...opts }
    this.visual = opts.visual
    this._paused = !!opts.startPaused
    this.simTime = (Date.now() / 1000) * (+this.visual.tau || 1)
    this.lastFrame = performance.now()
  }

  /* ------------------------------------------------------------------ *
   * CustomLayerInterface
   * ------------------------------------------------------------------ */

  onAdd(map: MLMap, gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    if (!(gl instanceof WebGL2RenderingContext)) {
      throw new Error("Heatflask needs WebGL 2, which this browser lacks")
    }
    /* A basemap change replaces the whole style, which drops this layer
     * without calling onRemove, and MapAPI adds it back. The GL context is the
     * same one, so everything uploaded is still good: just draw again. */
    if (this.gl === gl && this.pathProgram) {
      map.triggerRepaint()
      return
    }

    this.map = map
    this.gl = gl

    this.pathProgram = compileProgram(gl, PATH_VS, PATH_FS)
    this.pathU = uniformLocations(gl, this.pathProgram, [
      "u_matrix",
      "u_viewport",
      "u_pixelRatio",
      "u_zScale",
      "u_opacity",
    ])
    this.dotProgram = compileProgram(gl, DOT_VS, DOT_FS)
    this.dotU = uniformLocations(gl, this.dotProgram, [
      "u_matrix",
      "u_viewport",
      "u_pixelRatio",
      "u_zScale",
      "u_size",
      "u_shadow",
      "u_light",
      "u_view",
      "u_T",
      "u_phase",
      "u_streams",
      "u_meta",
    ])

    this.shadowProgram = compileProgram(gl, SHADOW_VS, SHADOW_FS)
    this.shadowU = uniformLocations(gl, this.shadowProgram, [
      "u_source",
      "u_viewport",
      "u_offset",
      "u_step",
      "u_sigma",
      "u_final",
      "u_color",
    ])

    this.setupPathVAO(gl)
    this.setupDotVAO(gl)
    this.setupShadowBuffers(gl)

    map.on("move", this.onMove)
    map.on("moveend", this.onMoveEnd)
    map.on("idle", this.onIdle)
    map.on("terrain", this.onTerrain)

    if (ADMIN) {
      this.infoBox = document.createElement("div")
      this.infoBox.className = "gl-info-box"
      map.getContainer().appendChild(this.infoBox)
    }

    /* A style change removes and re-adds this layer; pick up where we were */
    if (ActivityCollection.items.size) this.reset()
  }

  onRemove(map: MLMap, gl: WebGL2RenderingContext): void {
    map.off("move", this.onMove)
    map.off("moveend", this.onMoveEnd)
    map.off("idle", this.onIdle)
    map.off("terrain", this.onTerrain)
    this.animating = false
    this.ready = false
    gl.deleteProgram(this.pathProgram)
    gl.deleteProgram(this.dotProgram)
    gl.deleteBuffer(this.pathBuffer)
    gl.deleteBuffer(this.slotBuffer)
    gl.deleteTexture(this.streamTexture)
    gl.deleteTexture(this.metaTexture)
    gl.deleteVertexArray(this.pathVAO)
    gl.deleteVertexArray(this.dotVAO)
    gl.deleteProgram(this.shadowProgram)
    gl.deleteVertexArray(this.shadowVAO)
    for (const tex of this.shadowTextures) gl.deleteTexture(tex)
    for (const fb of this.shadowFramebuffers) gl.deleteFramebuffer(fb)
    this.shadowTextures = []
    this.shadowFramebuffers = []
    this.shadowWidth = this.shadowHeight = 0
    this.pathProgram = undefined
    this.gl = undefined
    this.infoBox?.remove()
  }

  private setupPathVAO(gl: WebGL2RenderingContext): void {
    this.pathVAO = gl.createVertexArray()
    gl.bindVertexArray(this.pathVAO)

    // the quad each segment is drawn as: (t, side)
    const corners = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, corners)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    )
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

    /* One point is 20 bytes: x, y, z, width as float32, then RGBA bytes.
     * Instance i reads point i as a_p0/a_color0 and point i+1 as a_p1. */
    this.pathBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.pathBuffer)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 20, 0)
    gl.vertexAttribDivisor(1, 1)
    gl.enableVertexAttribArray(2)
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 20, 16)
    gl.vertexAttribDivisor(2, 1)
    gl.enableVertexAttribArray(3)
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 20, 20)
    gl.vertexAttribDivisor(3, 1)

    gl.bindVertexArray(null)
  }

  private setupDotVAO(gl: WebGL2RenderingContext): void {
    this.dotVAO = gl.createVertexArray()
    gl.bindVertexArray(this.dotVAO)

    /* One dot slot is (activity index, k) as two uint16s */
    this.slotBuffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, this.slotBuffer)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribIPointer(0, 2, gl.UNSIGNED_SHORT, 4, 0)

    gl.bindVertexArray(null)

    this.streamTexture = this.createDataTexture(gl)
    this.metaTexture = this.createDataTexture(gl)
  }

  private setupShadowBuffers(gl: WebGL2RenderingContext): void {
    // the blur passes draw one triangle from gl_VertexID, with no attributes
    this.shadowVAO = gl.createVertexArray()

    for (let i = 0; i < 2; i++) {
      const tex = gl.createTexture()
      gl.bindTexture(gl.TEXTURE_2D, tex)
      // linear, to stretch the reduced-resolution buffer smoothly over the map
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      this.shadowTextures.push(tex)
      this.shadowFramebuffers.push(gl.createFramebuffer())
    }
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  /** Size the shadow buffers to the drawing buffer. Allocates only when that
   * changes. */
  private sizeShadowBuffers(gl: WebGL2RenderingContext): void {
    const w = Math.max(1, Math.round(gl.drawingBufferWidth * SHADOW_SCALE))
    const h = Math.max(1, Math.round(gl.drawingBufferHeight * SHADOW_SCALE))
    if (w === this.shadowWidth && h === this.shadowHeight) return
    this.shadowWidth = w
    this.shadowHeight = h

    for (let i = 0; i < 2; i++) {
      const tex = this.shadowTextures[i]
      gl.bindTexture(gl.TEXTURE_2D, tex)
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.R8,
        w,
        h,
        0,
        gl.RED,
        gl.UNSIGNED_BYTE,
        null
      )
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffers[i])
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tex,
        0
      )
    }
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  /** The shadow's blur, as a Gaussian's standard deviation in shadow buffer
   * texels. CSS's blur radius, which dotShadows.blur is, is twice that. */
  private shadowSigma(): number {
    const blur = this.options.dotShadows.blur
    return 0.5 * blur * this.map.getPixelRatio() * SHADOW_SCALE
  }

  /** The cubes' orientation (see DOT_FS): columns are east, south and up in
   * the sprite's frame, x right, y down, z toward the viewer. The bearing
   * turns the map about up; the pitch then tips the camera back about screen
   * x, so up leans toward the top of the screen and south toward the viewer. */
  private cubeView(): Float32Array {
    const b = (this.map.getBearing() * Math.PI) / 180
    const p = (this.map.getPitch() * Math.PI) / 180
    const [cb, sb] = [Math.cos(b), Math.sin(b)]
    const [cp, sp] = [Math.cos(p), Math.sin(p)]
    // prettier-ignore
    return new Float32Array([
      cb, -sb * cp, -sb * sp,  // east
      sb, cb * cp, cb * sp,    // south
      0, -sp, cp,              // up
    ])
  }

  /** Toward the light that shades the dots (see DOT_FS), opposite the
   * shadow's offset: x right, y down, z toward the viewer, unit length. The
   * light is LIGHT_HEIGHT CSS px above the dots, so a longer shadow means a
   * lower light. */
  private lightDirection(): [number, number, number] {
    const { x, y } = this.options.dotShadows
    const len = Math.hypot(x, y, LIGHT_HEIGHT)
    return [-x / len, -y / len, LIGHT_HEIGHT / len]
  }

  private createDataTexture(gl: WebGL2RenderingContext): WebGLTexture {
    const tex = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, tex)
    // float textures are read with texelFetch, so no filtering is involved
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.bindTexture(gl.TEXTURE_2D, null)
    return tex
  }

  private textureWidth(): number {
    return Math.min(
      TEXTURE_WIDTH,
      this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)
    )
  }

  /** Upload RGBA float texels, textureWidth() to a row */
  private uploadTexels(tex: WebGLTexture, data: Float32Array): void {
    const gl = this.gl
    const texels = Math.max(1, data.length / 4)
    const width = Math.min(this.textureWidth(), texels)
    const height = Math.ceil(texels / width)
    let padded = data
    if (data.length !== width * height * 4) {
      padded = new Float32Array(width * height * 4)
      padded.set(data)
    }
    gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA32F,
      width,
      height,
      0,
      gl.RGBA,
      gl.FLOAT,
      padded
    )
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  /** Per-frame setup shared by prerender and render: advance the clock,
   * take the camera matrix and rebuild whatever is stale. */
  private prepareFrame(args: CustomRenderMethodInput): void {
    const now = performance.now()
    if (!this._paused) {
      this.simTime += ((now - this.lastFrame) / 1000) * +this.visual.tau
    }
    this.lastFrame = now

    /* mainMatrix, not modelViewProjectionMatrix: the latter takes world
     * pixels at the current zoom, with z in metres. mainMatrix is the float64
     * matrix MapLibre builds for custom layers, taking Mercator units. */
    this.computeMatrix(args.defaultProjectionData.mainMatrix)

    const T = +this.visual.T
    if (T !== this.slotsT) {
      this.slotsT = T
      this.slotsDirty = true
      this.metaDirty = true
    }
    if (this.slotsDirty) this.buildSlots()
    if (this.metaDirty) this.buildMeta()

    this.framePrepared = true
  }

  /** Bind the dot program and set the uniforms both of its passes share */
  private useDotProgram(gl: WebGL2RenderingContext, pixelRatio: number): void {
    const T = +this.visual.T
    gl.useProgram(this.dotProgram)
    gl.bindVertexArray(this.dotVAO)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.streamTexture)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.metaTexture)

    const u = this.dotU
    gl.uniform1i(u.u_streams, 0)
    gl.uniform1i(u.u_meta, 1)
    gl.uniformMatrix4fv(u.u_matrix, false, this.matrix32)
    gl.uniform1f(u.u_pixelRatio, pixelRatio)
    gl.uniform1f(u.u_zScale, this.zScale())
    gl.uniform1f(u.u_size, this.dotSize())
    const [lx, ly, lz] = this.lightDirection()
    gl.uniform3f(u.u_light, lx, ly, lz)
    gl.uniformMatrix3fv(u.u_view, false, this.cubeView())
    gl.uniform1f(u.u_T, T)
    /* simTime is ~1e11; the remainder is taken here in float64, and what
     * reaches the GPU is always less than T */
    gl.uniform1f(u.u_phase, mod(this.simTime, T))
  }

  private unbindDotTextures(gl: WebGL2RenderingContext): void {
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  /**
   * MapLibre's offscreen pass, before it draws anything into the map: draw
   * the dots' silhouette and blur it horizontally, the first two steps of the
   * shadow (see SHADOW_FS). MapLibre marks all of its cached GL state dirty
   * afterwards, so the framebuffer, viewport and blending set here need no
   * restoring.
   */
  prerender(
    glCtx: WebGLRenderingContext | WebGL2RenderingContext,
    args: CustomRenderMethodInput
  ): void {
    this.shadowsDrawn = false
    this.prerenderMs = 0
    if (!this.ready) return
    const gl = <WebGL2RenderingContext>glCtx
    const t0 = performance.now()
    this.prepareFrame(args)

    if (!(this.slotCount > 0 && +this.visual.T > 0)) return

    this.sizeShadowBuffers(gl)
    const [silhouette] = this.shadowTextures
    gl.viewport(0, 0, this.shadowWidth, this.shadowHeight)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.colorMask(true, true, true, true)

    /* 1. The silhouette. MAX, so a pixel under several dots is covered once,
     * not more. The blend factors are ignored under MAX. The buffer is
     * SHADOW_SCALE of the drawing buffer, so the dot size in device pixels
     * scales with it. */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffers[0])
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendEquation(gl.MAX)
    this.useDotProgram(gl, this.map.getPixelRatio() * SHADOW_SCALE)
    gl.uniform1f(this.dotU.u_shadow, 1)
    gl.drawArrays(gl.POINTS, 0, this.slotCount)
    this.unbindDotTextures(gl)
    gl.blendEquation(gl.FUNC_ADD)

    /* 2. Blurred horizontally. Every pixel is written, so no clear. */
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFramebuffers[1])
    gl.disable(gl.BLEND)
    this.useShadowProgram(gl, silhouette, this.shadowWidth, this.shadowHeight)
    const u = this.shadowU
    gl.uniform2f(u.u_offset, 0, 0)
    gl.uniform2f(u.u_step, 1 / this.shadowWidth, 0)
    gl.uniform1f(u.u_final, 0)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    gl.bindTexture(gl.TEXTURE_2D, null)
    gl.enable(gl.BLEND)

    gl.bindVertexArray(null)
    this.shadowsDrawn = true
    this.prerenderMs = performance.now() - t0
  }

  /** Bind the shadow program to read `source`, drawing into a target of the
   * given size in its own pixels */
  private useShadowProgram(
    gl: WebGL2RenderingContext,
    source: WebGLTexture,
    targetWidth: number,
    targetHeight: number
  ): void {
    gl.useProgram(this.shadowProgram)
    gl.bindVertexArray(this.shadowVAO)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, source)
    const u = this.shadowU
    gl.uniform1i(u.u_source, 0)
    gl.uniform2f(u.u_viewport, targetWidth, targetHeight)
    gl.uniform1f(u.u_sigma, this.shadowSigma())
  }

  render(
    glCtx: WebGLRenderingContext | WebGL2RenderingContext,
    args: CustomRenderMethodInput
  ): void {
    if (!this.ready) return
    const gl = <WebGL2RenderingContext>glCtx
    const t0 = performance.now()

    // normally prerender has done this already, this frame
    if (!this.framePrepared) this.prepareFrame(args)
    this.framePrepared = false

    const T = +this.visual.T
    const zScale = this.zScale()
    const pixelRatio = this.map.getPixelRatio()
    const vw = gl.drawingBufferWidth
    const vh = gl.drawingBufferHeight

    if (DEPTH_TEST && zScale) gl.enable(gl.DEPTH_TEST)
    else gl.disable(gl.DEPTH_TEST)

    /* ---- paths ---- */
    if (this.options.showPaths && this.pathInstances > 0) {
      gl.useProgram(this.pathProgram)
      gl.bindVertexArray(this.pathVAO)
      const u = this.pathU
      gl.uniformMatrix4fv(u.u_matrix, false, this.matrix32)
      gl.uniform2f(u.u_viewport, vw, vh)
      gl.uniform1f(u.u_pixelRatio, pixelRatio)
      gl.uniform1f(u.u_zScale, zScale)
      gl.uniform1f(u.u_opacity, 1)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.pathInstances)
    }

    /* ---- dots ---- */
    if (this.slotCount > 0 && T > 0) {
      /* Shadows first, all of them, so no dot's shadow falls on another dot,
       * and as one, so overlapping shadows do not compound. 3. The blurred
       * silhouette, blurred vertically, offset, onto the map. */
      if (this.shadowsDrawn) {
        gl.disable(gl.DEPTH_TEST)
        this.useShadowProgram(gl, this.shadowTextures[1], vw, vh)
        const u = this.shadowU
        const shadow = this.options.dotShadows
        /* screen y points down; gl_FragCoord y points up */
        gl.uniform2f(u.u_offset, shadow.x * pixelRatio, -shadow.y * pixelRatio)
        gl.uniform2f(u.u_step, 0, 1 / this.shadowHeight)
        gl.uniform1f(u.u_final, 1)
        const rgba = packColor(shadow.color)
        gl.uniform4f(
          u.u_color,
          (rgba & 0xff) / 255,
          ((rgba >>> 8) & 0xff) / 255,
          ((rgba >>> 16) & 0xff) / 255,
          1
        )
        gl.drawArrays(gl.TRIANGLES, 0, 3)
        gl.bindTexture(gl.TEXTURE_2D, null)
        if (DEPTH_TEST && zScale) gl.enable(gl.DEPTH_TEST)
      }

      this.useDotProgram(gl, pixelRatio)
      gl.uniform1f(this.dotU.u_shadow, 0)
      gl.drawArrays(gl.POINTS, 0, this.slotCount)
      this.unbindDotTextures(gl)
    }

    gl.bindVertexArray(null)

    if (this.infoBox) {
      this.updateInfoBox(this.prerenderMs + performance.now() - t0)
    }
  }

  /* ------------------------------------------------------------------ *
   * The public surface DotLayerAPI exposes
   * ------------------------------------------------------------------ */

  /** Call after activities are added or removed */
  async reset(): Promise<void> {
    if (!this.map) return
    this.ready = false
    if (!ActivityCollection.items.size) {
      this.pathInstances = 0
      this.slotCount = 0
      this.map.triggerRepaint()
      this.onUpdate?.()
      return
    }
    ActivityCollection.reset()
    this.buildStreams()
    this.slotsDirty = true
    this.metaDirty = true
    this.ready = true
    await this.rebuild()
    if (!this._paused) this.animate()
  }

  /** Re-cull and rebuild the path geometry, then draw. Call after the
   * selection changes, too: it decides widths, colours and layering. */
  async redraw(): Promise<void> {
    this.slotsDirty = true
    this.metaDirty = true
    await this.rebuild()
  }

  animate(): void {
    this._paused = false
    if (this.animating) return
    this.animating = true
    this.lastFrame = performance.now()

    const loop = () => {
      if (this._paused || !this.animating || !this.map) {
        this.animating = false
        return
      }
      this.map.triggerRepaint()
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  pause(): void {
    this._paused = true
  }

  paused(): boolean {
    return this._paused
  }

  /** The animation settings changed; a paused frame needs redrawing */
  updateDotSettings(): void {
    this.map?.triggerRepaint()
  }

  /**
   * The path width (visual.pw) changed. The width is baked into the path
   * geometry, so that has to be rebuilt -- but only the geometry: what is in
   * view and how it is simplified are unaffected, so this skips the culling
   * and index-set work of a full redraw() and stays cheap enough to run on
   * every step of the dial.
   */
  updatePathWidth(): void {
    if (!this.ready) return
    this.options.showPaths = +this.visual.pw > 0
    this.buildPaths()
    this.map?.triggerRepaint()
  }

  /**
   * The colour rotation (visual.cr) changed. The dot colour lives in the meta
   * texture, so re-dealing the palette and marking that dirty is the whole of
   * it: no geometry, culling or index-set work, which is what makes this
   * cheap enough to run on every step of the dial.
   */
  updateColors(): void {
    ActivityCollection.setColorRotation(+this.visual.cr || 0)
    this.metaDirty = true
    this.map?.triggerRepaint()
  }

  /** Length of one loop, in real seconds. The dot pattern repeats every T
   * activity-seconds, which is T/tau of real time. */
  periodInSecs(): number {
    return +this.visual.T / +this.visual.tau
  }

  /** tau: activity-seconds per real second */
  speed(): number {
    return +this.visual.tau
  }

  /** The animation clock, in activity-seconds */
  getSimTime(): number {
    return this.simTime
  }

  /** Set the animation clock, for stepping frames during capture. Only
   * meaningful while paused, or the clock moves on at the next frame. */
  setSimTime(t: number): void {
    this.simTime = t
  }

  /**
   * Activities with a drawn point inside a box on the screen, in CSS pixels
   * relative to the map container, each with the first such point found.
   * Tests the same simplified points that are drawn, projected through the
   * same matrix, so it agrees with what is on screen at any pitch, bearing or
   * terrain height.
   */
  activitiesInScreenBox(x0: number, y0: number, x1: number, y1: number) {
    const found = new Map<Activity, [number, number]>()
    if (!this.ready) return found

    const { clientWidth: w, clientHeight: h } = this.map.getCanvas()
    const [xmin, xmax] = x0 < x1 ? [x0, x1] : [x1, x0]
    const [ymin, ymax] = y0 < y1 ? [y0, y1] : [y1, y0]
    const m = this.matrix
    const zScale = this.zScale()

    for (const A of ActivityCollection.inViewItems()) {
      const segMask = A.segMask
      if (!segMask) continue
      const idxArray = A.idxArray[segMask.zoom]
      const px = A.streams.px
      for (let j = 0; j < idxArray.length; j++) {
        const idx = idxArray[j]
        const x = px[2 * idx] - this.ox
        const y = px[2 * idx + 1] - this.oy
        const z = A.zAt(idx) * zScale
        const cw = m[3] * x + m[7] * y + m[11] * z + m[15]
        if (cw <= 0) continue
        const sx = ((m[0] * x + m[4] * y + m[8] * z + m[12]) / cw + 1) * 0.5 * w
        const sy = (1 - (m[1] * x + m[5] * y + m[9] * z + m[13]) / cw) * 0.5 * h
        if (sx >= xmin && sx <= xmax && sy >= ymin && sy <= ymax) {
          found.set(A, [sx, sy])
          break
        }
      }
    }
    return found
  }

  /* ------------------------------------------------------------------ *
   * Geometry
   * ------------------------------------------------------------------ */

  /** The zoom level simplification and culling work at. MapLibre's zoom is
   * one less than Leaflet's for the same scale (512px tiles, not 256), and
   * the index sets were built around Leaflet's. A steep pitch shows ground
   * closer than the centre, so it gets a level finer detail. */
  private zoomLevel(): number {
    const pitchBonus = this.map.getPitch() > 40 ? 1 : 0
    return Math.max(0, Math.round(this.map.getZoom() + 1) + pitchBonus)
  }

  /** The dot size in CSS px at the current zoom, on Leaflet's zoom scale so
   * the sz dial means what it did */
  private dotSize(): number {
    return dotSizeForZoom(+this.visual.sz, this.map.getZoom() + 1)
  }

  private zScale(): number {
    const terrain = this.map.getTerrain()
    return terrain ? terrain.exaggeration ?? 1 : 0
  }

  /** The visible region in world px, padded */
  private viewportBounds(pad = VIEWPORT_PAD): Bounds {
    const llb = this.map.getBounds()
    const nw = latLng2px([llb.getNorth(), llb.getWest()])
    const se = latLng2px([llb.getSouth(), llb.getEast()])
    const dx = (se[0] - nw[0]) * pad
    const dy = (se[1] - nw[1]) * pad
    const b = new Bounds()
    b.update(nw[0] - dx, nw[1] - dy)
    b.update(se[0] + dx, se[1] + dy)
    return b
  }

  /** mvp * translate(origin) * scale(1/256): world px relative to the origin
   * -> Mercator units -> clip space */
  private computeMatrix(mvp: ArrayLike<number>): void {
    const s = 1 / WORLD_PX
    const model = this.model
    model.fill(0)
    model[0] = s
    model[5] = s
    model[10] = s
    model[12] = this.ox * s
    model[13] = this.oy * s
    model[15] = 1
    multiply(this.matrix, <number[]>mvp, model)
    this.matrix32.set(this.matrix)
  }

  /** Throttled re-cull while the map moves */
  private onMove = (): void => {
    if (!this.ready) return
    const since = performance.now() - this.lastRebuild
    if (since >= REBUILD_INTERVAL_MS) {
      this.rebuild()
    } else if (!this.rebuildTimer) {
      this.rebuildTimer = window.setTimeout(() => {
        this.rebuildTimer = 0
        this.rebuild()
      }, REBUILD_INTERVAL_MS - since)
    }
  }

  private onMoveEnd = (): void => {
    if (this.ready) this.rebuild()
  }

  private onIdle = (): void => {
    if (this.ready && this.map.getTerrain()) this.calibrateAltitudes()
  }

  private onTerrain = (): void => {
    if (!this.ready) return
    this.calibrateAltitudes()
    this.map.triggerRepaint()
  }

  private async rebuild(): Promise<void> {
    if (!this.ready) return
    const tick = ++this.rebuildTick
    this.lastRebuild = performance.now()

    const bounds = this.viewportBounds()
    await ActivityCollection.updateContext(bounds, this.zoomLevel())
    // a newer rebuild started while this one waited on index sets
    if (tick !== this.rebuildTick || !this.ready) return

    const c = this.map.getCenter()
    const center = latLng2px([c.lat, c.lng])
    this.ox = Math.round(center[0])
    this.oy = Math.round(center[1])

    this.buildPaths()
    // the activity origins are stored relative to the view origin
    this.metaDirty = true
    this.map.triggerRepaint()
    this.onUpdate?.()
  }

  private buildPaths(): void {
    const gl = this.gl
    const va = this.pathVA
    const ox = this.ox
    const oy = this.oy
    let n = 0

    /* The three styles (normal, selected, unselected) keep their widths in
     * proportion; the dial scales all of them together. */
    const widthScale = +this.visual.pw / defaultOptions.normal.pathWidth

    ActivityCollection.forEachInViewLayered((A: Activity, style: Style) => {
      const segMask = A.segMask
      if (!segMask) return
      const color = packColor(A.colors.path, style.pathOpacity)
      const width = style.pathWidth * widthScale
      const idxArray = A.idxArray[segMask.zoom]
      const px = A.streams.px

      A.forEachSegmentRun((start, end) => {
        va.reserve((n + end - start + 1) * 5, n * 5)
        const f32 = va.f32
        const u32 = va.u32
        for (let j = start; j <= end; j++) {
          const idx = idxArray[j]
          const o = n * 5
          f32[o] = px[2 * idx] - ox
          f32[o + 1] = px[2 * idx + 1] - oy
          f32[o + 2] = A.zAt(idx)
          f32[o + 3] = j < end ? width : 0
          u32[o + 4] = color
          n++
        }
      })
    })

    /* a_p1 reads one point past each instance, so n points make n-1 segments;
     * pad one terminator so the buffer is never read past its end */
    va.reserve((n + 1) * 5, n * 5)
    va.f32.fill(0, n * 5, (n + 1) * 5)

    gl.bindBuffer(gl.ARRAY_BUFFER, this.pathBuffer)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Uint8Array(va.buffer, 0, (n + 1) * 20),
      gl.DYNAMIC_DRAW
    )
    this.pathInstances = Math.max(0, n - 1)
  }

  /**
   * Resample every activity's stream onto a uniform time grid and upload the
   * lot as one float texture. Done once per reset; nothing about it depends on
   * the view, the time, T or the selection.
   */
  private buildStreams(): void {
    const items = ActivityCollection.itemsArray()
    const n = items.length
    this.sampleOffset = new Uint32Array(n)
    this.sampleCount = new Uint32Array(n)
    this.sampleRate = new Float32Array(n)
    this.duration = new Float32Array(n)
    this.originX = new Float64Array(n)
    this.originY = new Float64Array(n)

    /* Size it first, coarsening the grid if everything together would not fit */
    const maxTotal = Math.min(MAX_TOTAL_SAMPLES, this.textureWidth() ** 2)
    let dt = SAMPLE_SECONDS
    let total: number
    for (;;) {
      total = 0
      for (const A of items) {
        const time = A.streams.time
        const duration = time[time.length - 1] || 0
        total += gridSteps(duration, dt) + 2
      }
      if (total <= maxTotal) break
      dt *= 2
    }

    const data = new Float32Array(total * 4)
    let offset = 0

    for (let a = 0; a < n; a++) {
      const A = items[a]
      const { px, time, altitude: alt } = A.streams
      const nPoints = time.length
      const duration = time[nPoints - 1] || 0
      /* steps land on the end; one sample past it, so the last step still has
       * an upper bracket to fetch */
      const steps = gridSteps(duration, dt)
      const step = duration > 0 ? duration / steps : dt
      const count = steps + 2

      const [bx0, by0, bx1, by1] = A.pxBounds.data
      const ox = (this.originX[a] = (bx0 + bx1) / 2)
      const oy = (this.originY[a] = (by0 + by1) / 2)
      this.sampleOffset[a] = offset
      this.sampleCount[a] = count
      this.sampleRate[a] = 1 / step
      this.duration[a] = duration

      const gaps = new Set(A.pxGaps || [])
      let seg = 0
      for (let s = 0; s < count; s++) {
        const t = s * step
        while (seg < nPoints - 2 && time[seg + 1] <= t) seg++
        const o = (offset + s) * 4
        if (nPoints < 2) {
          data[o + 3] = 0
          continue
        }
        const ta = time[seg]
        const tb = time[seg + 1]
        const f = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0
        data[o] = px[2 * seg] + (px[2 * seg + 2] - px[2 * seg]) * f - ox
        data[o + 1] =
          px[2 * seg + 1] + (px[2 * seg + 3] - px[2 * seg + 1]) * f - oy
        data[o + 2] = alt[seg] + (alt[seg + 1] - alt[seg]) * f
        /* A recording gap is a straight line the athlete never travelled. The
         * samples past step `steps` are past the end of the recording; they
         * exist only so the fetch of i0+1 has something to land on. Tested by
         * index, not by t > duration: the last step's t is duration give or
         * take a float rounding, and rounding the wrong way would invalidate a
         * real sample. */
        data[o + 3] = gaps.has(seg) || s > steps ? 0 : 1
      }
      offset += count
    }

    this.uploadTexels(this.streamTexture, data)
  }

  /** The draw order of the dot slots: every unselected activity first, so
   * selected dots land on top, as the Canvas renderer layered them. */
  private buildSlots(): void {
    this.slotsDirty = false
    const T = +this.visual.T
    const items = ActivityCollection.itemsArray()
    if (!(T > 0) || !items.length) {
      this.slotCount = 0
      return
    }

    let total = 0
    const perActivity = new Uint32Array(items.length)
    for (let a = 0; a < items.length; a++) {
      /* k spans every multiple of T that fits in the activity; uint16 caps it,
       * which only a T under 1.1 on an 18-hour activity would reach */
      perActivity[a] = Math.min(65535, Math.floor(this.duration[a] / T) + 1)
      total += perActivity[a]
    }

    const slots = new Uint16Array(total * 2)
    let o = 0
    for (const selectedPass of [false, true]) {
      for (let a = 0; a < items.length; a++) {
        if (!!items[a].selected !== selectedPass) continue
        for (let k = 0; k < perActivity[a]; k++) {
          slots[o++] = a
          slots[o++] = k
        }
      }
    }

    const gl = this.gl
    gl.bindBuffer(gl.ARRAY_BUFFER, this.slotBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, slots, gl.STATIC_DRAW)
    this.slotCount = total
  }

  /** Per-activity metadata: everything the dot shader needs besides the
   * stream. Small, and rebuilt whenever T, the selection, the view origin or
   * a terrain calibration changes. */
  private buildMeta(): void {
    this.metaDirty = false
    const T = +this.visual.T
    const items = ActivityCollection.itemsArray()
    const n = items.length
    if (this.meta.length !== n * META_TEXELS * 4) {
      this.meta = new Float32Array(n * META_TEXELS * 4)
    }
    const m = this.meta

    const anySelected = items.some((A) => A.selected)
    for (let a = 0; a < n; a++) {
      const A = items[a]
      const style = !anySelected
        ? defaultOptions.normal
        : A.selected
        ? defaultOptions.selected
        : defaultOptions.unselected
      const o = a * META_TEXELS * 4
      m[o] = this.sampleOffset[a]
      m[o + 1] = this.sampleCount[a]
      m[o + 2] = this.sampleRate[a]
      m[o + 3] = mod(A.ts, T)

      m[o + 4] = this.originX[a] - this.ox
      m[o + 5] = this.originY[a] - this.oy
      m[o + 6] = A.heightScale()
      m[o + 7] = A.altOffset

      const rgba = packColor(A.colors.dot, style.dotOpacity)
      m[o + 8] = (rgba & 0xff) / 255
      m[o + 9] = ((rgba >>> 8) & 0xff) / 255
      m[o + 10] = ((rgba >>> 16) & 0xff) / 255
      m[o + 11] = ((rgba >>> 24) & 0xff) / 255

      m[o + 12] = A.selected ? 1 : 0
      m[o + 13] = this.duration[a]
      m[o + 14] = 0
      m[o + 15] = 0
    }
    this.uploadTexels(this.metaTexture, m)
  }

  /* ------------------------------------------------------------------ *
   * Terrain
   * ------------------------------------------------------------------ */

  /**
   * Anchor each in-view activity's altitude to the terrain model.
   *
   * Sampled only at points inside the viewport, since only there are DEM
   * tiles loaded; elsewhere the lookup answers 0, which is indistinguishable
   * from sea level, so zeros are ignored.
   */
  private calibrateAltitudes(): void {
    const terrain = <TerrainInternals>(<unknown>this.map.terrain)
    if (!terrain) return

    const exaggeration = terrain.exaggeration || 1
    const zoom = this.zoomLevel()
    const view = this.viewportBounds(0)
    const demZoom = Math.min(
      Math.max(0, Math.floor(this.map.getZoom())),
      terrain.tileManager.maxzoom
    )
    let changed = false

    const lnglat = {
      lng: 0,
      lat: 0,
      wrap() {
        return this
      },
    }

    const ground = (lng: number, lat: number): number => {
      lnglat.lng = lng
      lnglat.lat = lat
      /* A tile not loaded at this zoom reads as 0; try coarser ones */
      for (let z = demZoom; z >= Math.max(0, demZoom - 3); z--) {
        const e = terrain.getElevationForLngLatZoom(lnglat, z)
        if (e) return e / exaggeration
      }
      return 0
    }

    for (const A of ActivityCollection.inViewItems()) {
      if (
        A.altCalibratedZoom !== undefined &&
        zoom - A.altCalibratedZoom < ALT_RECALIBRATE_ZOOM
      )
        continue

      const segMask = A.segMask
      if (!segMask) continue
      const idxArray = A.idxArray[segMask.zoom]
      const px = A.streams.px
      const alt = A.streams.altitude
      const step = Math.max(1, Math.floor(idxArray.length / (ALT_SAMPLES * 4)))

      const diffs: number[] = []
      for (
        let j = 0;
        j < idxArray.length && diffs.length < ALT_SAMPLES;
        j += step
      ) {
        const idx = idxArray[j]
        const x = px[2 * idx]
        const y = px[2 * idx + 1]
        if (!view.contains(x, y)) continue
        const [lng, lat] = px2lngLat(x, y)
        const g = ground(lng, lat)
        if (g) diffs.push(g - alt[idx])
      }
      if (diffs.length < ALT_MIN_SAMPLES) continue

      diffs.sort((a, b) => a - b)
      const offset = diffs[diffs.length >> 1] + ALT_LIFT_M
      if (Math.abs(offset - A.altOffset) > 1) changed = true
      A.altOffset = offset
      A.altCalibratedZoom = zoom
    }

    if (changed) {
      this.buildPaths()
      this.metaDirty = true
      this.map.triggerRepaint()
    }
  }

  /* ------------------------------------------------------------------ *
   * Debug readout (admins)
   * ------------------------------------------------------------------ */

  private updateInfoBox(ms: number): void {
    const times = this.frameTimes
    times.push(ms)
    if (times.length < 30) return
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    times.length = 0
    this.infoBox.textContent =
      `cpu ${avg.toFixed(1)} ms/frame, ${this.slotCount} dot slots, ` +
      `${this.pathInstances} segments, z${this.zoomLevel()}`
  }
}

/** x mod y, non-negative for positive y */
function mod(x: number, y: number): number {
  return ((x % y) + y) % y
}
