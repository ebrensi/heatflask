/*
  DotLayer Efrem Rensi, 2020 - 2021
*/
import { Layer, DomUtil, Browser, setOptions, Control } from "../myLeaflet"
import * as ViewBox from "./ViewBox"
import * as ActivityCollection from "./ActivityCollection"
import { PixelGraphics } from "./PixelGraphics"
import { MAP_INFO } from "../Env"
import { nextTask, sleep, nextAnimationFrame } from "../appUtil"
import { vParams } from "../Model"
// import * as WorkerPool from "./WorkerPool.js"

import {
  options as defaultOptions,
  dotSettings as _dotSettings,
} from "./Defaults"

import type { Map as LMap } from "leaflet"

export { _dotSettings as dotSettings }

const DEBUG_BORDERS = true
const TARGET_FPS = 30

/* In order to prevent path redraws from happening too often
 * and hogging up CPU cycles we set a minimum delay between redraws
 */
const FORCE_FULL_REDRAW = false
const CONTINUOUS_PAN_REDRAWS = true
const CONTINUOUS_PINCH_REDRAWS = true
const MIN_REDRAW_DELAY = 100 // milliseconds

let dotCanvas: HTMLCanvasElement
let pathCanvas: HTMLCanvasElement
let debugCanvas: HTMLCanvasElement

const dotCanvasPane = "shadowPane"
const pathCanvasPane = "overlayPane"
const debugCanvasPane = "overlayPane"

let _map: LMap
let _ready: boolean
let _options
let _gifPatch: boolean

/*
 * Displays for debugging
 */
let _infoBox: HTMLDivElement
const InfoViewer = Control.extend({
  onAdd: function () {
    _infoBox = DomUtil.create("div")
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
    const { width: dw, height: dh } = dotCanvas
    dotCanvas.pxg = new PixelGraphics(
      dotCanvas.getContext("2d").createImageData(dw, dh)
    )

    /*
     * The Path Canvas is for activity paths, which are made up of a bunch of
     * segments.
     */
    pathCanvas = addCanvasOverlay(pathCanvasPane)
    const { width: pw, height: ph } = pathCanvas

    pathCanvas.pxg = new PixelGraphics(
      pathCanvas.getContext("2d").createImageData(pw, ph)
    )

    if (DEBUG_BORDERS) {
      // create Canvas for debugging canvas stuff
      debugCanvas = addCanvasOverlay(debugCanvasPane)
      pathCanvas.pxg.debugCanvas = debugCanvas
      dotCanvas.pxg.debugCanvas = debugCanvas
      ActivityCollection.pxg.debugCanvas = debugCanvas
    }

    ViewBox.setMap(_map)
    map.on(assignEventHandlers(), this)

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

    map.off(assignEventHandlers(), this)
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
})

export const dotLayer = function (options) {
  return new DotLayer(options)
}

/*
 *
 * Auxilliary functions
 *
 */
function addCanvasOverlay(pane: string): HTMLCanvasElement {
  const size = _map.getSize()
  const zoomAnimated = _map.options.zoomAnimation && Browser.any3d
  const canvas: HTMLCanvasElement = DomUtil.create("canvas", "leaflet-layer")
  canvas.width = size.x
  canvas.height = size.y
  DomUtil.addClass(
    canvas,
    "leaflet-zoom-" + (zoomAnimated ? "animated" : "hide")
  )
  _map._panes[pane].appendChild(canvas)
  ViewBox.canvases.push(canvas)
  return canvas
}

// Define handlers for leaflet events
function assignEventHandlers() {
  const events = {
    moveend: onMoveEnd,
    resize: onResize,
  }

  if (CONTINUOUS_PAN_REDRAWS) events.move = onMove
  if (CONTINUOUS_PINCH_REDRAWS) events.zoom = onZoom
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

async function onResize(): Promise<void> {
  const newMapSize = _map.getSize()
  const { x, y } = newMapSize
  const { width, height } = dotCanvas
  if (x === width && y === height) return

  ViewBox.resize(newMapSize)

  const { width: dw, height: dh } = dotCanvas
  dotCanvas.pxg = new PixelGraphics(
    dotCanvas.getContext("2d").createImageData(dw, dh)
  )
  dotCtxUpdate()

  /*
   * The Path Canvas is for activity paths, which are made up
   * of a bunch of segments.
   */
  const { width: pw, height: ph } = pathCanvas
  pathCanvas.pxg = new PixelGraphics(
    pathCanvas.getContext("2d").createImageData(pw, ph)
  )

  console.log(`resized to ${x} x ${y}`)

  await redraw(true)
}

/*
 * This gets called continuously as the user moves the touchscreen by pinching
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
 * This gets called continuously as the user pans or zooms (without pinch)
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

async function redraw(forceFullRedraw?: boolean) {
  if (!_ready) return

  const tick = ++_currentTick

  await sleep(MIN_REDRAW_DELAY)

  _moveEnd = false

  if (tick !== _currentTick) {
    return
  }

  while (_redrawing) {
    await nextTask()
  }

  _redrawing = true

  const zoomChanged = ViewBox.updateZoom()
  const boundsChanged = ViewBox.updateBounds()

  if (!(forceFullRedraw || boundsChanged || zoomChanged)) {
    console.log("redraw: nothing to do!")
    _redrawing = false
    return
  }

  const drawDiff = !FORCE_FULL_REDRAW && !forceFullRedraw && zoomChanged < 2

  /* Erase the path and dot canvases, using their respective
   * drawBounds rectangles. The underlying imageData buffers are
   *  still intact though
   */
  clearCanvases()

  // reset the canvases to to align with the screen and update the ViewBox
  // location relative to the map's pxOrigin
  const shift = ViewBox.calibrate()

  if (drawDiff) {
    if (_options.showPaths) {
      pathCanvas.pxg.translate(shift.x, shift.y)
      drawPathImageData()
    }
    if (_paused) {
      dotCanvas.pxg.translate(shift.x, shift.y)
      drawDotImageData()
    }
  }

  await ActivityCollection.updateContext(ViewBox.pxBounds, ViewBox.zoomLevel)

  if (_options.showPaths) {
    drawPaths(drawDiff)
  }

  if (_paused) {
    drawDots(null, drawDiff)
  }

  await nextTask()
  _redrawing = false
}

function clearCanvases() {
  for (const canvas of [pathCanvas, dotCanvas]) {
    const pxg = canvas.pxg
    if (!pxg.drawBounds.isEmpty()) {
      const { x, y, w, h } = pxg.drawBounds.rect
      canvas.getContext("2d").clearRect(x, y, w, h)
    }
  }
}

function drawPathImageData() {
  pathCanvas.pxg.putImageData(pathCanvas)
}

async function drawPaths(drawDiff?: boolean) {
  if (!_ready) return 0
  const pxg = pathCanvas.pxg
  pxg.transform = ViewBox.transform
  const { count, imageData } = await ActivityCollection.drawPaths(
    pxg.imageData,
    drawDiff
  )
  pxg.imageData = imageData
  drawPathImageData()
}

function drawDotImageData() {
  if (_options.dotShadows.enabled) {
    dotCanvas.pxg.drawImageData(dotCanvas)
  } else {
    dotCanvas.pxg.putImageData(dotCanvas)
  }
}

async function drawDots(tsecs?: number, drawDiff?: boolean) {
  if (!_ready) return 0

  if (!tsecs) tsecs = _timePaused || (timeOrigin / 1000)

  const pxg = dotCanvas.pxg
  pxg.transform = ViewBox.transform
  const { count, imageData } = await ActivityCollection.drawDots(
    pxg.imageData,
    vParams.sz,
    vParams.T * vParams.tau,
    tsecs * vParams.tau,
    drawDiff
  )
  pxg.imageData = imageData
  drawDotImageData()

  if (DEBUG_BORDERS) drawBoundsBoxes()

  return count
}

function drawBoundsBoxes() {
  const ctx = debugCanvas.getContext("2d")

  ViewBox.clear(ctx)
  ctx.lineWidth = 4
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = "rgba(255,0,0,0.8)"
  ViewBox.draw(ctx)

  if (!pathCanvas.pxg.drawBounds.isEmpty()) {
    ctx.lineWidth = 1
    ctx.strokeStyle = "rgba(0,255,0,0.8)"
    ViewBox.draw(ctx, pathCanvas.pxg.drawBounds.rect)
  }

  if (!dotCanvas.pxg.drawBounds.isEmpty()) {
    ctx.lineWidth = 1
    ctx.strokeStyle = "rgba(0,0,255,0.8)"
    ViewBox.draw(ctx, dotCanvas.pxg.drawBounds.rect)
  }
}

/*
 * Dot settings
 *
 */
function updateDotSettings(shadowSettings) {
  const ds = _dotSettings

  ds._timeScale = +vParams.tau
  ds._period = +vParams.T

  const dotScale = +vParams.sz
  ds._dotSize = Math.max(1, ~~(dotScale * Math.log(ViewBox.zoomLevel) + 0.5))
  ds.alpha = (+vParams.alpha * 256) | 0

  if (shadowSettings) {
    Object.assign(_options.dotShadows, shadowSettings)
    dotCtxUpdate()
  }

  if (_paused) {
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

      const pxg = dotCanvas.pxg
      if (!pxg.drawBounds.isEmpty()) {
        const { x, y, w, h } = pxg.drawBounds.rect
        dotCanvas.getContext("2d").clearRect(x, y, w, h)
      }
      // draw the dots
      const count = await drawDots(nowInSeconds)

      if (MAP_INFO) {
        updateInfoBox(frameDelay, count)
      }
    }
  }

  _drawingDots = false
  _timePaused = nowInSeconds
}

function animateZoom(e) {
  if (_moveEnd) return // prevents weird animation on moveEnd.
  const m = _map
  const z = e.zoom
  const scale = m.getZoomScale(z)

  const offset = m._latLngToNewLayerPoint(
    m.getBounds().getNorthWest(),
    z,
    e.center
  )
  ViewBox.setCSStransform(offset, scale)

  // console.log({ offset, scale })
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
