/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
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
 * Each frame is the map's own WebGL canvas -- basemap, terrain, paths and
 * dots together, exactly as they appear -- read back right after MapLibre
 * renders it. With Leaflet a frame had to be composited by hand from tile
 * images and two overlay canvases.
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
import { t } from "./i18n"

import heatflaskImgSrc from "url:../images/logo.png"
import stravaImgSrc from "url:../images/pbs4.png"

import type { Map as MLMap } from "maplibre-gl"
import type { VideoCodec } from "mediabunny"

/* 25fps is plenty for this material -- the dots move smoothly but there is no
 * fine detail to alias -- and it keeps the frame count (and so the encode
 * time) down. */
const FPS = 25

/** Height of each attribution logo, in pixels. */
const LOGO_HEIGHT = 50
const LOGO_MARGIN = 4
const LOGO_ALPHA = 0.5

/** The longest side a recording is scaled down to, if it is bigger */
const MAX_VIDEO_SIDE = 1920

/** A rectangle of the map viewport, in CSS pixels. */
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
  map: MLMap,
  sel: Selection,
  onProgress: ProgressFn = () => undefined
): Promise<Blob | null> {
  if (_capturing) return null

  /* The canvas is at device resolution, so a selection in CSS pixels covers
   * pixelRatio times as many canvas pixels. Record at that resolution, up to
   * MAX_VIDEO_SIDE. */
  const pr = map.getPixelRatio()
  const src = {
    x: Math.round(sel.x * pr),
    y: Math.round(sel.y * pr),
    width: Math.round(sel.width * pr),
    height: Math.round(sel.height * pr),
  }
  const shrink = Math.min(1, MAX_VIDEO_SIDE / Math.max(src.width, src.height))
  /* H.264 needs even dimensions, and every other codec is happier with them */
  const width = Math.max(2, Math.floor((src.width * shrink) / 2) * 2)
  const height = Math.max(2, Math.floor((src.height * shrink) / 2) * 2)

  const period = dotLayer.periodInSecs()
  if (!isFinite(period) || period <= 0) {
    throw new Error("the animation has no period to capture")
  }

  const duration = Math.min(period, CAPTURE_DURATION_MAX)
  const numFrames = Math.max(1, Math.round(duration * FPS))

  onProgress(0, t("capture.loadingEncoder"))
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

  /* Frames are stepped by hand, so the animation must not advance the clock
   * underneath. Remember whether it was running to put it back. */
  const wasRunning = !dotLayer.paused()
  dotLayer.pause()
  const t0 = dotLayer.getSimTime()
  const T = period * dotLayer.speed()

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

    onProgress(0, t("capture.waitingForMap"))
    await mapSettled(map)

    for (let i = 0; i < numFrames; i++) {
      if (_aborted) {
        await output.cancel()
        return null
      }

      /* Frame i sits at i/numFrames of the way through one period. The frame
       * *at* the period is frame 0 again, so it is not recorded -- that is
       * what makes the loop seamless rather than double-exposing one frame. */
      dotLayer.setSimTime(t0 + (i * T) / numFrames)
      await renderedFrame(map, (canvas) => {
        ctx.clearRect(0, 0, width, height)
        ctx.drawImage(
          canvas,
          src.x,
          src.y,
          src.width,
          src.height,
          0,
          0,
          width,
          height
        )
      })
      drawLogos(ctx, { x: 0, y: 0, width, height })

      /* Awaited so encoder and writer backpressure is respected -- without it
       * a long capture queues every frame in memory at once. */
      await source.add(i / FPS, 1 / FPS)

      onProgress(
        (i + 1) / numFrames,
        t("capture.encoding", { percent: ~~(((i + 1) / numFrames) * 100) })
      )
    }

    onProgress(1, t("capture.finalizing"))
    await output.finalize()

    return new Blob([target.buffer], { type: "video/mp4" })
  } finally {
    _capturing = false
    dotLayer.setSimTime(t0)
    if (wasRunning) dotLayer.animate()
    else dotLayer.updateDotSettings()
  }
}

/** Resolve once the map has no tiles still loading */
function mapSettled(map: MLMap): Promise<void> {
  if (map.loaded()) return Promise.resolve()
  return new Promise((resolve) => map.once("idle", () => resolve()))
}

/**
 * Render one frame and hand the map's canvas to `read` straight away.
 *
 * The WebGL drawing buffer is only guaranteed until the browser composites
 * it, so it has to be read in the same task that drew it. MapLibre fires
 * "render" at the end of drawing a frame, synchronously, which is that task.
 * (The alternative, preserveDrawingBuffer, costs every frame of normal use.)
 */
function renderedFrame(
  map: MLMap,
  read: (canvas: HTMLCanvasElement) => void
): Promise<void> {
  return new Promise((resolve) => {
    map.once("render", () => {
      read(map.getCanvas())
      resolve()
    })
    map.triggerRepaint()
  })
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
