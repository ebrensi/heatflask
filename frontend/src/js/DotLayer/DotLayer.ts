/*
  DotLayer Efrem Rensi, 2020 - 2021
*/
// was "../myLeaflet", a module that does not exist anywhere in the tree
import { Layer, DomUtil, Browser, setOptions, Control } from "leaflet"
import * as ViewBox from "./ViewBox"
import * as ActivityCollection from "./ActivityCollection"
import { PixelGraphics } from "./PixelGraphics"
// Env exports ADMIN; MAP_INFO is the alias ViewBox.ts uses for it
import { ADMIN as MAP_INFO } from "../Env"
import { nextTask, sleep, nextAnimationFrame } from "../appUtil"
import type { VisualParameters } from "../Model"
// import * as WorkerPool from "./WorkerPool.js"

import {
  options as defaultOptions,
  dotSettings as _dotSettings,
} from "./Defaults"

import type {
  Map as LMap,
  LeafletEvent,
  ZoomAnimEvent,
  LatLng,
  Point,
} from "leaflet"

/* These handlers receive Leaflet events, not DOM events. The map used to be
 * typed as { [name: string]: EventListener }, which is a DOM handler and is
 * not what Leaflet passes. */
type EventHandlerObject = { [eventName: string]: (e?: LeafletEvent) => void }

/** Leaflet internals @types/leaflet does not declare. */
type MapInternals = {
  _latLngToNewLayerPoint(latlng: LatLng, zoom: number, center: LatLng): Point
}

const DEBUG_BORDERS = false
const TARGET_FPS = 36

/* In order to prevent path redraws from happening too often
 * and hogging up CPU cycles we set a minimum delay between redraws
 */
const CONTINUOUS_REDRAWS = true
/* The floor on the interval between redraws, in ms -- so ~20 redraws/sec at
 * most during a continuous pan. Lower is smoother and costs more CPU. */
const MIN_REDRAW_DELAY = 50

/* Dot size grows with zoom, so dots read as objects sitting in space rather
 * than decoration painted on the screen -- but only partly. Map scale is
 * already exponential in zoom (level z = scale 2**z), so a real object would
 * scale as 2**z, doubling every level. K is the fraction of that to apply:
 * 0 keeps a fixed pixel size, 1 is fully physical. The growth is then a
 * constant factor per zoom level.
 *
 * This replaces Math.log(zoomLevel), whose derivative is 1/z -- so the dots
 * grew *more slowly* the further you zoomed in, the opposite of the intent. */
const DOT_ZOOM_SCALING = 0.15
const DOT_ZOOM_REF = 4
const MIN_DOT_SIZE = 0.5

function dotSizeForZoom(dotScale: number, zoomLevel: number): number {
  // zoomLevel is undefined until ViewBox.updateZoom() has run at least once
  if (!zoomLevel) return Math.max(MIN_DOT_SIZE, dotScale)
  const zoomFactor = 2 ** (DOT_ZOOM_SCALING * (zoomLevel - DOT_ZOOM_REF))
  return Math.max(MIN_DOT_SIZE, dotScale * zoomFactor)
}

let dotCanvas: HTMLCanvasElement
let dotPxg: PixelGraphics
let pathCanvas: HTMLCanvasElement
let pathPxg: PixelGraphics
let debugCanvas: HTMLCanvasElement

const dotCanvasPane = "shadowPane"
const pathCanvasPane = "overlayPane"
const debugCanvasPane = "overlayPane"

let _map: LMap
let _ready: boolean
let _options
let _gifPatch: boolean

/* The animation settings: tau, T, sz, alpha, paused. This module used to do
 * `import { vParams } from "../Model"`, but Model exports no such binding --
 * it became VisualParameters / appState.visual and this file was never
 * updated. Nothing imported DotLayer, so neither Parcel nor tsc ever noticed.
 * It is now supplied as the `visual` option at construction. */
let vParams: VisualParameters

/*
 * Displays for debugging
 */
let _infoBox: HTMLDivElement
const InfoViewer = Control.extend({
  onAdd: function () {
    _infoBox = <HTMLDivElement>DomUtil.create("div")
    _infoBox.style.width = "200px"
    _infoBox.style.padding = "5px"
    _infoBox.style.background = "rgba(50,50,240,0.6)"
    _infoBox.style.textAlign = "left"
    _infoBox.innerHTML = "dotLayer infoBox"
    return _infoBox
  },
})

export const DotLayer = Layer.extend({
  options: defaultOptions,
  dotSettings: _dotSettings,
  updateDotSettings: updateDotSettings,
  redraw: redraw,
  animate: animate,

  // -- initialized is called on prototype
  initialize: function (options) {
    setOptions(this, options)
    _options = this.options

    vParams = _options.visual
    if (!vParams) {
      throw new Error("DotLayer requires a `visual` option (appState.visual)")
    }

    _paused = _options.startPaused
    if (_paused) this.pause()
    // WorkerPool.initialize(_options.numWorkers)
  },

  //-------------------------------------------------------------
  onAdd: function (map: LMap) {
    _map = map
    ViewBox.canvases.length = 0

    // dotlayer canvas
    dotCanvas = addCanvasOverlay(dotCanvasPane)
    dotPxg = new PixelGraphics(dotCanvas)

    /*
     * The Path Canvas is for activity paths, which are made up of
     * a bunch of segments.
     */
    pathCanvas = addCanvasOverlay(pathCanvasPane)
    pathPxg = new PixelGraphics(pathCanvas)

    if (DEBUG_BORDERS) {
      // create Canvas for debugging canvas stuff
      debugCanvas = addCanvasOverlay(debugCanvasPane)
      pathPxg.debugCanvas = debugCanvas
      dotPxg.debugCanvas = debugCanvas
    }

    ViewBox.setMap(_map)
    /* No context argument: every handler here is a module-level function that
     * closes over module state and never touches `this`. Leaflet's
     * on(eventMap, context) is real but undeclared in @types/leaflet, and
     * passing a context we don't use only bought a type error. on and off must
     * agree for the listeners to be removable, so both drop it. */
    map.on(assignEventHandlers())

    if (MAP_INFO) {
      new InfoViewer().addTo(map)
    }
  },

  addTo: function (map: LMap) {
    map.addLayer(this)
    return this
  },

  //-------------------------------------------------------------
  onRemove: function (map: LMap) {
    const panes = _map.getPanes()
    panes[dotCanvasPane].removeChild(dotCanvas)
    panes[pathCanvasPane].removeChild(pathCanvas)

    if (DEBUG_BORDERS) {
      panes[debugCanvasPane].removeChild(debugCanvas)
      debugCanvas = null
    }

    map.off(assignEventHandlers())
  },

  // -------------------------------------------------------------------

  // Call this function after items are added or removed
  reset: async function (): Promise<void> {
    if (!ActivityCollection.items.size) return

    _ready = false

    ActivityCollection.reset()
    ViewBox.updateBounds()
    ViewBox.updateZoom()
    dotCtxUpdate()
    updateDotSettings()
    _ready = true
    await redraw(true)

    if (!_paused) this.animate()
  },

  // --------------------------------------------------------------------
  pause: function () {
    _paused = true
  },

  paused: function (): boolean {
    return !!_paused
  },

  /* ---- frame stepping, for capture -------------------------------------
   *
   * The animation is periodic: the dot pattern repeats every s activity-
   * seconds, which is s/tau of real time. Capturing exactly one period
   * therefore yields a seamless loop.
   */

  /** Length of one loop, in real seconds. */
  periodInSecs: function (): number {
    return +vParams.T / +vParams.tau
  },

  /** Draw one frame at an arbitrary time rather than "now". */
  drawDotsAt: function (tsecs: number): Promise<number> {
    return drawDots(tsecs)
  },

  /** The canvases a capture composites, in bottom-to-top order. */
  canvases: function (): { path: HTMLCanvasElement; dot: HTMLCanvasElement } {
    return { path: pathCanvas, dot: dotCanvas }
  },
})

/*
 *
 * Auxilliary functions
 *
 */
function addCanvasOverlay(pane: string): HTMLCanvasElement {
  const size = _map.getSize()
  const zoomAnimated = _map.options.zoomAnimation && Browser.any3d
  const canvas = <HTMLCanvasElement>DomUtil.create("canvas", "leaflet-layer")
  canvas.width = size.x
  canvas.height = size.y
  DomUtil.addClass(
    canvas,
    "leaflet-zoom-" + (zoomAnimated ? "animated" : "hide")
  )
  _map.getPane(pane).appendChild(canvas)
  ViewBox.canvases.push(canvas)
  return canvas
}

// Define handlers for leaflet events
function assignEventHandlers() {
  const events: EventHandlerObject = {
    moveend: onMoveEnd,
    resize: onResize,
    zoom: onZoom,
  }

  if (CONTINUOUS_REDRAWS) events.move = onMove
  if (_map.options.zoomAnimation && Browser.any3d) {
    events.zoomanim = animateZoom
  }
  return events
}

function dotCtxUpdate(): void {
  const ctx = dotCanvas.getContext("2d")
  if (_options.dotShadows.enabled) {
    const shadowOpts = _options.dotShadows

    ctx.shadowOffsetX = shadowOpts.x
    ctx.shadowOffsetY = shadowOpts.y
    ctx.shadowBlur = shadowOpts.blur
    ctx.shadowColor = shadowOpts.color
  } else {
    ctx.shadowOffsetX = 0
    ctx.shadowOffsetY = 0
    ctx.shadowBlur = 0
  }
}

let _resizeTick = 0
async function onResize(): Promise<void> {
  const tick = ++_resizeTick
  await sleep(MIN_REDRAW_DELAY)
  if (tick !== _resizeTick) return

  const newMapSize = _map.getSize()
  const { x, y } = newMapSize
  const { width, height } = dotCanvas
  if (x === width && y === height) return

  ViewBox.resize(newMapSize)

  dotPxg.setSize(x, y)
  pathPxg.setSize(x, y)
  dotCtxUpdate()

  console.log(`resized to ${x} x ${y}`)

  await redraw(true)
}

/*
 * This gets called continuously as the user moves
 * the touchscreen by pinching
 */
let _pinching = false
async function onZoom(e) {
  if (!_map || !ViewBox.zoomLevel) return
  // console.log("onZoom")

  _pinching = e.pinch || e.flyTo
  if (_pinching) {
    const z = _map.getZoom()
    const scale = _map.getZoomScale(z, ViewBox.zoom)
    const trans = _map.latLngToLayerPoint(ViewBox.ll0)
    // console.log(`pinch transform ${scale}, ${trans.x}, ${trans.y}`)
    ViewBox.setCSStransform(trans, scale)
  }
}

/*
 * This gets called continuously as the user pans or zooms
 * (also when pinching)
 */
async function onMove() {
  // console.log("onMove")
  await redraw(_pinching)
  // await redraw()
}

/*
 * This gets called after a pan or zoom is done.
 * Leaflet moves the pixel origin so we need to reset the CSS transform
 */
let _moveEnd: boolean
async function onMoveEnd() {
  // console.log("onMoveEnd")
  _moveEnd = true
  _pinching = false
  await redraw(true)
}

/*
 * This function redraws paths (and dots if paused),
 * also recalibrating the position of the canvases
 * over the map pane
 */
let _redrawing: boolean
let _currentTick = 0

let _lastRedrawTime = 0

async function redraw(forceFullRedraw?: boolean) {
  if (!_ready) return

  const tick = ++_currentTick

  /* A leading-edge throttle, not a debounce.
   *
   * This used to sleep MIN_REDRAW_DELAY on every call and only then check
   * whether a newer call had superseded it. That has two costs: an isolated
   * redraw -- the one at the end of a zoom, say -- paid the full delay for
   * nothing, and during a continuous gesture every call kept getting
   * superseded, so nothing was drawn until the gesture stopped.
   *
   * Now a redraw that follows a quiet period runs immediately, and only
   * back-to-back redraws get spaced out. */
  const elapsed = performance.now() - _lastRedrawTime
  if (elapsed < MIN_REDRAW_DELAY) {
    await sleep(MIN_REDRAW_DELAY - elapsed)
  }
  _lastRedrawTime = performance.now()

  _moveEnd = false

  if (tick !== _currentTick) {
    return
  }

  if (_redrawing) {
    console.log("can't redraw")
    await sleep(1000)
  }

  _redrawing = true

  const boundsChanged = ViewBox.updateBounds()
  const zoomChanged = ViewBox.updateZoom()

  if (!(forceFullRedraw || boundsChanged || zoomChanged)) {
    console.log("redraw: nothing to do!")
    _redrawing = false
    return
  }

  /* Note: the canvases are NOT cleared here. Each draw clears its own canvas
   * immediately before drawing into it.
   *
   * Clearing up front and drawing after `await nextTask()` put a macrotask
   * boundary between the two, and the browser repaints between tasks -- so a
   * fully-wiped canvas got painted to the screen, which showed up as blank
   * frames between zoom steps. The old code avoided this by clearing only the
   * drawBounds rectangle and shifting the surviving pixels across, machinery
   * that has since been removed. */

  // reset the canvases to to align with the screen and update the ViewBox
  // location relative to the map's pxOrigin
  ViewBox.calibrate()
  pathPxg.setTransform(ViewBox.transform)
  dotPxg.setTransform(ViewBox.transform)

  await ActivityCollection.updateContext(ViewBox.pxBounds, ViewBox.zoomLevel)

  const promises = []
  if (_options.showPaths) {
    await nextTask()
    promises.push(drawPaths())
  } else {
    // paths turned off: wipe whatever is still on that canvas
    pathPxg.clear()
  }

  if (_paused) {
    await nextTask()
    promises.push(drawDots())
  }

  await Promise.all(promises)
  _redrawing = false
}

async function drawPaths() {
  if (!_ready) return 0
  /* Clear and draw with no macrotask boundary between them. ActivityCollection
   * .drawPaths contains no awaits, so awaiting it only yields a microtask, and
   * the browser cannot repaint mid-microtask -- so the wiped canvas is never
   * visible. */
  pathPxg.clear()
  const { count } = await ActivityCollection.drawPaths(pathPxg)
  pathPxg.flush()
  return count
}

async function drawDots(tsecs?: number) {
  if (!_ready) return 0

  /* `=== undefined`, not a falsy test: t=0 is a legitimate timestamp, and a
   * falsy test quietly turned it into "now". */
  if (tsecs === undefined) tsecs = _timePaused || timeOrigin / 1000

  dotPxg.clear()
  /* vParams.T is s: the timestep between successive dots, in ACTIVITY
   * seconds. It used to be a period in real seconds, multiplied by tau here
   * -- which coupled the two dials, so changing the speed also changed how
   * far apart the dots sat. Sparsity is a spatial property and the flow rate
   * is a temporal one; they are independent, so s passes straight through. */
  /* Computed here rather than read from _dotSettings._dotSize, so it always
   * reflects the current zoom. drawDots used to pass vParams.sz straight
   * through, which meant the zoom scaling in updateDotSettings was computed
   * and then thrown away -- the dots never scaled with zoom at all. */
  const { count } = await ActivityCollection.drawDots(
    dotPxg,
    dotSizeForZoom(+vParams.sz, ViewBox.zoomLevel),
    vParams.T,
    tsecs * vParams.tau
  )
  dotPxg.flush()

  return count
}

/*
 * Dot settings
 *
 */
function updateDotSettings(shadowSettings?) {
  const ds = _dotSettings

  ds._timeScale = +vParams.tau
  ds._period = +vParams.T

  /* Fractional sizes are fine now. The `~~(... + 0.5)` that used to round
   * this to whole pixels existed because the old renderer wrote individual
   * pixels into a buffer by hand; Canvas 2D takes any radius, so the dots can
   * grow and shrink smoothly instead of jumping a pixel at a time. */
  ds._dotSize = dotSizeForZoom(+vParams.sz, ViewBox.zoomLevel)
  ds.alpha = (+vParams.alpha * 256) | 0

  if (shadowSettings) {
    Object.assign(_options.dotShadows, shadowSettings)
    dotCtxUpdate()
  }

  if (_paused) {
    // drawDots clears the canvas before drawing
    drawDots()
  }
  return ds
}

/*
 * Animation
 */
let _drawingDots: boolean
let _timePaused: number
let _paused: boolean
const timeOrigin = performance.timing.navigationStart
const fpsInterval = 1000 / TARGET_FPS

async function animate() {
  // this prevents accidentally running multiple animation loops
  if (_drawingDots || !_ready) return

  _drawingDots = true
  _paused = false

  const timeOffset = _timePaused
    ? 1000 * _timePaused - performance.now() + fpsInterval
    : timeOrigin

  let lastFrameTime = performance.now() + fpsInterval
  let nowInSeconds

  while (!_paused) {
    const timeStamp = await nextAnimationFrame()
    const frameDelay = timeStamp - lastFrameTime

    if (frameDelay > fpsInterval) {
      lastFrameTime = timeStamp - (frameDelay % fpsInterval)

      // ts is in milliseconds since navigationStart
      nowInSeconds = (timeStamp + timeOffset) / 1000

      // draw the dots (drawDots clears the canvas first)
      const count = await drawDots(nowInSeconds)

      if (MAP_INFO) {
        updateInfoBox(frameDelay, count)
      }
    }
  }

  _drawingDots = false
  _timePaused = nowInSeconds
}

/*
 * Leaflet zooms by CSS-transforming the map pane, and ViewBox.calibrate()
 * cancels that transform on our canvases so they sit in screen coordinates.
 * The consequence is that during a zoom animation the tiles scale while the
 * paths and dots stay frozen, and then snap into place at moveend -- which is
 * what makes zooming look choppy.
 *
 * This handler fixes that without re-rendering anything: it scales the
 * already-drawn canvas about the zoom centre for the duration of the
 * animation, the same way Leaflet's own Canvas renderer does. The real redraw
 * still happens at moveend; this just keeps the layer glued to the map on the
 * way there.
 *
 * It had been disabled by an unconditional `return` on its first line.
 */
function animateZoom(e: ZoomAnimEvent) {
  if (_moveEnd) return // prevents weird animation on moveEnd.

  /* _latLngToNewLayerPoint is Leaflet-internal (no leading-underscore members
   * appear in @types/leaflet) but it is what every zoom-animated canvas layer
   * in the ecosystem uses, Leaflet's own Canvas renderer included. */
  const m = <LMap & MapInternals>_map
  const scale = m.getZoomScale(e.zoom)
  const offset = m._latLngToNewLayerPoint(
    m.getBounds().getNorthWest(),
    e.zoom,
    e.center
  )
  ViewBox.setCSStransform(offset, scale)
}

// for debug display
const fpsRegister: number[] = []
let fpsSum = 0
let _roundCount: number
let _duration: number
const fpsRegisterSize = 32

function updateInfoBox(dt: number, count: number) {
  fpsSum += dt
  fpsRegister.push(dt)
  if (fpsRegister.length !== fpsRegisterSize) return

  const roundCount = 10 * Math.round(count / 10)
  const duration = Math.round(fpsSum / fpsRegisterSize)
  const fps = Math.round(1000 / duration)
  // const [dx, dy, dw, dh] = dotCanvas.pxg.imageData.drawBounds
  if (roundCount !== _roundCount || duration !== _duration) {
    _infoBox.innerHTML = `${duration} ms (${fps}fps), ${roundCount} pts`
    // + `<br>${dx}, ${dy}, ${dw}, ${dh}`
  }
  _roundCount = roundCount
  _duration = duration
  fpsSum -= fpsRegister.shift()
}
