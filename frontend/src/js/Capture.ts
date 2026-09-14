/*
 * Capture -- record one animation cycle as an MP4 the user can upload to
 * Strava.
 *
 * This replaces the GIF capture in DotLayer/Export.ts, which was ported from
 * master but never connected: it referenced six APIs that do not exist on the
 * new DotLayer, and gif.js pulls a worker-and-wasm build off a git branch to
 * produce a format with a 256-colour palette. The dots are anti-aliased over a
 * photographic basemap, which is close to the worst case for palette
 * quantisation -- and Strava takes video, not GIF.
 *
 * Encoding is WebCodecs (in every current browser) with mediabunny doing the
 * MP4 muxing.
 *
 * Why one period: the animation is periodic. The set of dot positions at time
 * t+s is the same set as at time t, so a recording exactly one period long
 * ends where it began and loops seamlessly.
 */

/* mediabunny is imported dynamically, down in captureVideo(). It is a large
 * library and capture is a rare, deliberate action, so there is no reason to
 * make every page load pay for it -- Parcel splits it into its own bundle that
 * is fetched the first time someone records. Only the types are imported
 * statically, and those are erased. */
import { dotLayer } from "./DotLayerAPI"
import { CAPTURE_DURATION_MAX } from "./Env"

import heatflaskImgSrc from "url:../images/logo.png"
import stravaImgSrc from "url:../images/pbs4.png"

import type { Map as LMap } from "leaflet"
import type { VideoCodec } from "mediabunny"

/* 25fps is plenty for this material -- the dots move smoothly but there is no
 * fine detail to alias -- and it keeps the frame count (and so the encode
 * time) down. */
const FPS = 25

/** Height of each attribution logo, in pixels. */
const LOGO_HEIGHT = 50
const LOGO_MARGIN = 4
const LOGO_ALPHA = 0.5

/** A rectangle of the map viewport, in container pixels. */
export type Selection = {
  x: number
  y: number
  width: number
  height: number
}

export type ProgressFn = (fraction: number, label: string) => void

const heatflaskImg = new Image()
heatflaskImg.src = heatflaskImgSrc

const stravaImg = new Image()
stravaImg.src = stravaImgSrc

let _aborted = false
let _capturing = false

export function isCapturing(): boolean {
  return _capturing
}

export function abortCapture(): void {
  _aborted = true
}

/* ------------------------------------------------------------------ *
 * The basemap
 * ------------------------------------------------------------------ */

/**
 * Draw the basemap as it currently appears on screen.
 *
 * Rather than re-deriving which tiles cover the viewport, this reads the tile
 * <img> elements Leaflet has already placed and asks each one where it landed.
 * getBoundingClientRect() reports post-CSS-transform geometry, so this comes
 * out right at fractional zoom and mid-pan without knowing anything about how
 * Leaflet positions tiles.
 *
 * The tile elements are drawn directly. An earlier version re-loaded each
 * tile.src into a fresh crossOrigin="anonymous" Image to keep the canvas
 * readable, which was both a second decode per tile and, as it turned out,
 * broken: CachedTileLayer serves tiles from blob: URLs, and it was revoking
 * them the instant they loaded, so every re-load failed and the capture came
 * out on black.
 *
 * Drawing the elements is also what keeps the canvas readable. CachedTileLayer
 * fetches each tile and displays it from a blob: URL, which is same-origin and
 * so does not taint -- and a tainted canvas cannot be encoded at all, since
 * VideoEncoder throws SecurityError on the first frame.
 */
function drawBasemap(
  map: LMap,
  ctx: CanvasRenderingContext2D,
  sel: Selection
): boolean {
  const container = map.getContainer()
  const origin = container.getBoundingClientRect()

  const tiles = Array.from(
    container.querySelectorAll<HTMLImageElement>("img.leaflet-tile")
  ).filter((t) => t.complete && t.naturalWidth > 0)

  let drew = false
  for (const tile of tiles) {
    /* A tile mid-fade or being swapped out can be transparent; honour it so
     * the capture matches what is on screen. */
    const opacity = Number(tile.style.opacity || "1")
    if (opacity <= 0) continue

    const r = tile.getBoundingClientRect()
    const prev = ctx.globalAlpha
    ctx.globalAlpha = opacity
    try {
      ctx.drawImage(
        tile,
        r.left - origin.left - sel.x,
        r.top - origin.top - sel.y,
        r.width,
        r.height
      )
      drew = true
    } catch (e) {
      /* A tile whose src never resolved throws here rather than drawing */
      console.warn("capture: could not draw a tile", e)
    }
    ctx.globalAlpha = prev
  }
  return drew
}

/* ------------------------------------------------------------------ *
 * Attribution
 * ------------------------------------------------------------------ */

function drawLogos(ctx: CanvasRenderingContext2D, sel: Selection): void {
  const alpha = ctx.globalAlpha
  ctx.globalAlpha = LOGO_ALPHA

  for (const [img, side] of <[HTMLImageElement, "left" | "right"][]>[
    [heatflaskImg, "left"],
    [stravaImg, "right"],
  ]) {
    if (!img.complete || !img.naturalWidth) continue

    const h = LOGO_HEIGHT
    const w = (img.naturalWidth * h) / img.naturalHeight
    const x = side === "left" ? LOGO_MARGIN : sel.width - w - LOGO_MARGIN
    ctx.drawImage(img, x, sel.height - h - LOGO_MARGIN, w, h)
  }

  ctx.globalAlpha = alpha
}

/* ------------------------------------------------------------------ *
 * The capture itself
 * ------------------------------------------------------------------ */

/**
 * Record one animation period and return it as an MP4 blob.
 *
 * @param sel the region of the viewport to record, in container pixels
 */
export async function captureVideo(
  map: LMap,
  sel: Selection,
  onProgress: ProgressFn = () => undefined
): Promise<Blob | null> {
  if (_capturing) return null

  /* H.264 needs even dimensions, and every other codec is happier with them */
  const width = Math.max(2, Math.floor(sel.width / 2) * 2)
  const height = Math.max(2, Math.floor(sel.height / 2) * 2)
  const region: Selection = { ...sel, width, height }

  const period = dotLayer.periodInSecs()
  if (!isFinite(period) || period <= 0) {
    throw new Error("the animation has no period to capture")
  }

  const duration = Math.min(period, CAPTURE_DURATION_MAX)
  const numFrames = Math.max(1, Math.round(duration * FPS))

  onProgress(0, "loading encoder…")
  const {
    Output,
    Mp4OutputFormat,
    BufferTarget,
    CanvasSource,
    QUALITY_HIGH,
    getFirstEncodableVideoCodec,
  } = await import("mediabunny")

  const codec = <VideoCodec | null>(
    await getFirstEncodableVideoCodec(["avc", "vp9", "av1", "vp8"], {
      width,
      height,
      quality: QUALITY_HIGH,
    })
  )
  if (!codec) throw new Error("this browser cannot encode video")

  _capturing = true
  _aborted = false

  /* The animation loop and the capture both draw into the same dot canvas, so
   * they cannot run at once. Remember whether it was running so we can put it
   * back the way we found it. */
  const wasRunning = !dotLayer.paused()
  dotLayer.pause()

  const frame = document.createElement("canvas")
  frame.width = width
  frame.height = height
  const ctx = frame.getContext("2d")

  const target = new BufferTarget()
  const output = new Output({
    /* 'in-memory' puts the metadata at the front of the file. Players can
     * start without seeking to the end, which is what makes the file behave
     * when it is uploaded somewhere. */
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target,
  })

  const source = new CanvasSource(frame, {
    codec,
    quality: QUALITY_HIGH,
    keyFrameInterval: duration,
  })
  output.addVideoTrack(source, { frameRate: FPS })

  try {
    await output.start()

    onProgress(0, "capturing basemap…")
    /* Captured once: the map does not move during a capture, so the basemap is
     * the same in every frame and re-compositing it per frame would be pure
     * waste. */
    const basemap = document.createElement("canvas")
    basemap.width = width
    basemap.height = height
    const haveBasemap = drawBasemap(map, basemap.getContext("2d"), region)
    if (!haveBasemap) {
      /* Worth saying out loud: with no basemap the frames are transparent
       * behind the dots, and MP4 has no alpha channel, so the recording comes
       * out on a black background. That looks like a broken capture rather
       * than a missing basemap. The usual cause is a tile server that sends no
       * CORS headers, since a tainted canvas cannot be encoded. */
      console.warn(
        "capture: no basemap tiles could be composited; " +
          "recording on a black background"
      )
    }

    const { path: pathCanvas, dot: dotCanvas, dotFilter } = dotLayer.canvases()

    for (let i = 0; i < numFrames; i++) {
      if (_aborted) {
        await output.cancel()
        return null
      }

      /* Frame i sits at i/numFrames of the way through one period. The frame
       * *at* the period is frame 0 again, so it is not recorded -- that is
       * what makes the loop seamless rather than double-exposing one frame. */
      const t = (i * period) / numFrames
      await dotLayer.drawDotsAt(t)

      ctx.clearRect(0, 0, width, height)
      if (haveBasemap) ctx.drawImage(basemap, 0, 0)

      for (const src of [pathCanvas, dotCanvas]) {
        if (!src) continue
        /* The dot shadows are a CSS filter on the live canvas, which drawImage
         * does not carry over -- so apply the same filter here. */
        ctx.filter = src === dotCanvas && dotFilter ? dotFilter : "none"
        ctx.drawImage(
          src,
          region.x,
          region.y,
          width,
          height,
          0,
          0,
          width,
          height
        )
      }

      ctx.filter = "none"
      drawLogos(ctx, region)

      /* Awaited so encoder and writer backpressure is respected -- without it
       * a long capture queues every frame in memory at once. */
      await source.add(i / FPS, 1 / FPS)

      onProgress(
        (i + 1) / numFrames,
        `encoding… ${~~(((i + 1) / numFrames) * 100)}%`
      )
    }

    onProgress(1, "finalizing…")
    await output.finalize()

    return new Blob([target.buffer], { type: "video/mp4" })
  } finally {
    _capturing = false
    /* Put the layer back as we found it. If it was already paused, redraw so
     * the last capture frame is not left sitting on screen. */
    if (wasRunning) dotLayer.animate()
    else await dotLayer.redraw(true)
  }
}

/** Hand the finished file to the user. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  /* Revoking immediately can cancel the download in some browsers. */
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
