/*
  DotLayer Efrem Rensi, 2020,
*/

import { Layer, DomUtil, Browser, setOptions } from "../myLeaflet.js"
import { Control } from "../myLeaflet.js"

import * as ViewBox from "./ViewBox.js"
import * as DrawBox from "./DrawBox.js"
import * as ActivityCollection from "./ActivityCollection.js"
import { PixelGraphics } from "./PixelGraphics.js"
import { MAP_INFO } from "../Env.js"
import { nextTask, nextAnimationFrame } from "../appUtil.js"
import { DEBUG_BORDERS } from "../Env.js"
import { vParams } from "../Model.js"
// import * as WorkerPool from "./WorkerPool.js"

import {
  options as defaultOptions,
  dotSettings as _dotSettings,
} from "./Defaults.js"

export { _dotSettings as dotSettings }

const TARGET_FPS = 30
/* In order to prevent path redraws from happening too often
 * and hogging up CPU cycles we set a minimum delay between redraws
 */
const FORCE_FULL_REDRAW = false
const CONTINUOUS_PAN_REDRAWS = true
const CONTINUOUS_PINCH_REDRAWS = true
const MIN_PAN_REDRAW_DELAY = 200 // milliseconds
const MIN_PINCH_REDRAW_DELAY = 100

let dotCanvas, pathCanvas, debugCanvas
let _lastDotDrawBox

const dotCanvasPane = "shadowPane"
const pathCanvasPane = "overlayPane"
const debugCanvasPane = "overlayPane"

let _map, _options
let _ready

let _gifPatch
let _styleGroups
let _lastRedraw = 0

/*
 * Displays for debugging
 */
let _infoBox
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
  onAdd: function (map) {
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
    }

    ViewBox.setMap(_map)
    map.on(assignEventHandlers(), this)

    if (MAP_INFO) {
      new InfoViewer().addTo(map)
    }
  },

  addTo: function (map) {
    map.addLayer(this)
    return this
  },

  //-------------------------------------------------------------
  onRemove: function (map) {
    map._panes[dotCanvasPane].removeChild(dotCanvas)
    map._panes[pathCanvasPane].removeChild(pathCanvas)

    if (DEBUG_BORDERS) {
      map._panes[debugCanvasPane].removeChild(debugCanvas)
      debugCanvas = null
    }

    map.off(assignEventHandlers(), this)
  },

  // -------------------------------------------------------------------

  // Call this function after items are added or removed
  reset: async function () {
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
function addCanvasOverlay(pane) {
  const size = _map.getSize()
  const zoomAnimated = _map.options.zoomAnimation && Browser.any3d
  const canvas = DomUtil.create("canvas", "leaflet-layer")
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

function dotCtxUpdate() {
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

async function onResize() {
  const newMapSize = _map.getSize()
  const { x, y } = newMapSize
  const { width, height } = dotCanvas
  if (x === width && y === height) return

  ViewBox.resize(newMapSize)

  const { width: dw, height: dh } = dotCanvas
  const dctx = dotCanvas.getContext("2d")
  dotCanvas.pxg.imageData = dctx.createImageData(dw, dh)

  dotCtxUpdate()

  /*
   * The Path Canvas is for activity paths, which are made up
   * of a bunch of segments.
   */
  const { width: pw, height: ph } = pathCanvas
  const pctx = pathCanvas.getContext("2d")
  pathCanvas.pxg.imageData = pctx.createImageData(pw, ph)

  await redraw(true)
}

async function onZoom(e) {
  if (!_map || !ViewBox.zoom) return

  // console.log("onzoom")

  if (e.pinch || e.flyTo) {
    const ts = Date.now()
    if (ts - _lastRedraw < MIN_PINCH_REDRAW_DELAY) {
      return
    }

    _lastRedraw = ts
    await redraw()
  }
}

/*
 * This gets called continuously as the user pans or zooms (without pinch)
 */
async function onMove() {
  // prevent redrawing more often than necessary
  const ts = Date.now()
  if (ts - _lastRedraw < MIN_PAN_REDRAW_DELAY) {
    return
  }

  _lastRedraw = ts
  await redraw()
}

/*
 * This gets called after a pan or zoom is done.
 * Leaflet moves the pixel origin so we need to reset the CSS transform
 */
async function onMoveEnd() {
  await redraw()
}

function moveDrawBox() {
  // Get the current draw rectangle in screen coordinates
  // (relative to map pane position)
  const D = DrawBox.getScreenRect()

  // Get the last recorded ViewBox (screen) rectangle
  // in pane coordinates (relative to pxOrigin)
  const V = ViewBox.getPaneRect()

  // reset the canvases to to align with the screen and update the ViewBox location
  // relative to the map's pxOrigin
  const V_ = ViewBox.calibrate()

  // Move the visible portion of currently drawn segments and dots
  // to the new location after calibration
  const dVx = Math.round(V_.x - V.x)
  const dVy = Math.round(V_.y - V.y)

  const canvasesToMove = [pathCanvas, dotCanvas]
  for (const canvas of canvasesToMove) {
    canvas.pxg.moveRect(D, dVx, dVy)
    DrawBox.clear(canvas.getContext("2d"), D)
  }
}

/*
 * This function redraws paths (and dots if paused),
 * also recalibrating the position of the canvases
 * over the map pane
 */
async function redraw(force) {
  if (!_ready) return

  await nextTask()
  const boundsChanged = ViewBox.updateBounds()
  const zoomChanged = ViewBox.updateZoom()
  if (!force && !boundsChanged && !zoomChanged) {
    return
  }

  // console.log("onmoveend")
  const fullRedraw = zoomChanged || FORCE_FULL_REDRAW || force

  // Recalibrate the DrawBox and possibly move it
  if (fullRedraw) {
    const oldDrawBoxDim = DrawBox.getScreenRect()
    ViewBox.calibrate()
    if (zoomChanged > 1) ActivityCollection.resetSegMasks()
    const canvasesToClear = [pathCanvas, dotCanvas]
    for (const canvas of canvasesToClear) {
      DrawBox.clear(canvas.getContext("2d"), oldDrawBoxDim)
      canvas.pxg.clearRect(oldDrawBoxDim)
    }
  } else {
    // const t0 = Date.now()
    moveDrawBox()
    drawPathImageData()
    // console.log(`moveDrawBox: ${D.w}x${D.h} -- ${Date.now() - t0}ms`)
  }

  DrawBox.reset()

  await ActivityCollection.updateGroups()

  if (DEBUG_BORDERS) {
    drawBoundsBoxes()
  }

  if (_options.showPaths) {
    // const t0 = performance.now()
    const count = await drawPaths(fullRedraw)
    // console.log(`drawPaths: ${count}, ${Math.round(performance.now() - t0)}ms`)
  }

  if (_paused) {
    // await nextTask()
    drawDots(_timePaused || 0)
  }
}

function drawPathImageData() {
  const D = DrawBox.getScreenRect()
  const ctx = pathCanvas.getContext("2d")
  const imageData = pathCanvas.pxg.imageData
  ctx.putImageData(imageData, 0, 0, D.x, D.y, D.w, D.h)
}

async function drawPaths(forceFullRedraw) {
  if (!_ready) return 0
  const drawDiffs = !forceFullRedraw
  const pathImageData = pathCanvas.pxg.imageData
  const count = ActivityCollection.drawPaths(
    pathImageData,
    ViewBox.transform,
    drawDiffs
  )
  drawPathImageData()
  return count
}

async function drawdotImageData() {
  const D = DrawBox.getScreenRect()
  const ctx = dotCanvas.getContext("2d")
  const imageData = dotCanvas.pxg.imageData

  if (_options.dotShadows.enabled) {
    const img = await createImageBitmap(imageData, D.x, D.y, D.w, D.h)
    ctx.drawImage(img, D.x, D.y)
  } else {
    ctx.putImageData(imageData, 0, 0, D.x, D.y, D.w, D.h)
  }
}

async function drawDots(tsecs) {
  if (!_ready) return 0

  const pxg = dotCanvas.pxg
  pxg.clearRect(_lastDotDrawBox)
  if (_options.dotShadows.enabled) {
    DrawBox.clear(dotCanvas.getContext("2d"), _lastDotDrawBox)
  }
  const count = ActivityCollection.drawDots(
    pxg.imageData,
    ViewBox.transform,
    _dotSettings._dotSize,
    tsecs
  )
  drawdotImageData()
  return count
}

function drawBoundsBoxes() {
  const ctx = debugCanvas.getContext("2d")
  ViewBox.clear(ctx)
  ctx.lineWidth = 4
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = "rgb(0,255,0,0.8)"
  DrawBox.draw(ctx)
  ctx.strokeStyle = "rgb(255,0,255,1)"
  ViewBox.draw(ctx)
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
  ds._dotSize = Math.max(1, ~~(dotScale * Math.log(ViewBox.zoom) + 0.5))
  ds.alpha = (+vParams.alpha * 256) | 0

  if (shadowSettings) {
    Object.assign(_options.dotShadows, shadowSettings)
    dotCtxUpdate()
  }

  if (_paused) {
    drawDots(_timePaused || 0, null, true)
  }
  return ds
}

/*
 * Animation
 */
let _drawingDots, _timePaused, _paused
async function animate() {
  // this prevents accidentally running multiple animation loops
  if (_drawingDots || !_ready) return

  _drawingDots = true
  _paused = false

  const fpsInterval = 1000 / TARGET_FPS
  const timeOrigin = performance.timing.navigationStart
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
  const m = _map
  const z = e.zoom
  const scale = m.getZoomScale(z)

  const offset = m._latLngToNewLayerPoint(
    m.getBounds().getNorthWest(),
    z,
    e.center
  )
  DomUtil.setTransform(dotCanvas, offset, scale)
  DomUtil.setTransform(pathCanvas, offset, scale)
  // console.log({ offset, scale })
}

// for debug display
const fpsRegister = []
let fpsSum = 0
let _roundCount, _duration
const fpsRegisterSize = 32
function updateInfoBox(dt, count) {
  fpsSum += dt
  fpsRegister.push(dt)
  if (fpsRegister.length !== fpsRegisterSize) return

  const roundCount = 10 * Math.round(count / 10)
  const duration = Math.round(fpsSum / fpsRegisterSize)
  fpsSum -= fpsRegister.shift()

  if (roundCount !== _roundCount || duration !== _duration) {
    _infoBox.innerHTML = `${duration} ms (${Math.round(
      1000 / duration
    )}fps), ${roundCount} pts`
  }
  _roundCount = roundCount
  _duration = duration
}
