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
import { nextTask, nextAnimationFrame, rgbaToUint32 } from "../appUtil.js"
import { DEBUG_BORDERS } from "../Env.js"
import { vParams } from "../Model.js"
// import * as WorkerPool from "./WorkerPool.js"

import {
  options as defaultOptions,
  dotSettings as _dotSettings,
} from "./Defaults.js"

export { _dotSettings as dotSettings }

/* In order to prevent path redraws from happening too often
 * and hogging up CPU cycles we set a minimum delay between redraws
 */
const FORCE_FULL_REDRAW = false
const CONTINUOUS_PAN_REDRAWS = false
const CONTINUOUS_PINCH_REDRAWS = true
const MIN_PAN_REDRAW_DELAY = 500 // milliseconds
const MIN_PINCH_REDRAW_DELAY = 50

const MAX_SEGMENTS_PER_FRAME = 5000

const TWO_PI = 2 * Math.PI
const TARGET_FPS = 30

const _drawFunction = {
  square: null,
  circle: null,
}

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
    makeDrawDotFuncs.imageDataTest()

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

  makeDrawDotFuncs.imageDataTest()
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
  debugger;
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

  dotCanvas.pxg.setTransform(...ViewBox.transform)
  pathCanvas.pxg.setTransform(...ViewBox.transform)

  DrawBox.reset()

  _styleGroups = await ActivityCollection.updateGroups()

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
  const { x: Dx, y: Dy, w: Dw, h: Dh } = DrawBox.getScreenRect()
  const pathCtx = pathCanvas.getContext("2d")
  pathCtx.putImageData(pathCanvas.pxg.imageData, 0, 0, Dx, Dy, Dw, Dh)
}

async function drawPaths(forceFullRedraw) {
  if (!_ready) return

  // const alphaScale = _dotSettings.alphaScale
  const drawAll = forceFullRedraw || FORCE_FULL_REDRAW

  let count = 0
  let frameCount = 0
  const pxg = pathCanvas.pxg
  const drawSeg = (x0,y0,x1,y1) => pxg.drawSegment(x0,y0,x1,y1)

  for (const { spec, items } of _styleGroups.path) {
    pxg.setColor(extractColor(spec.strokeStyle))
    pxg.setLineWidth(spec.lineWidth)
    for (const A of items) {
      const segMask = drawAll ? A.segMask : A.getSegMaskUpdates()
      if (segMask) {
        frameCount += A.forEachSegment(drawSeg, segMask)
      }

      if (frameCount > MAX_SEGMENTS_PER_FRAME) {
        drawPathImageData()
        count += frameCount
        frameCount = 0
        // console.log("drawPaths next frame")
        await nextAnimationFrame()
      }
    }
  }
  count += frameCount
  drawPathImageData()
  return count
}

/*
 * Functions for Drawing Dots
 * size is the length of the square and the radius of the circle
 */

const makeDrawDotFuncs = {
  imageDataTest: function () {
    const ds = _dotSettings
    const pxg = dotCanvas.pxg
    const ctx = dotCanvas.getContext("2d")

    _drawFunction.before = () => {
      pxg.clearRect(_lastDotDrawBox)
      if (_options.dotShadows.enabled) {
        DrawBox.clear(ctx, _lastDotDrawBox)
      }
    }

    _drawFunction.setColor = pxg.setColor

    _drawFunction.square = (x, y) => {
      pxg.drawSquare(x, y, ds._dotSize)
    }

    _drawFunction.circle = (x, y) => {
      pxg.drawCircle(x, y, ds._dotSize)
    }

    _drawFunction.after = () => {
      const D = DrawBox.getScreenRect()
      _lastDotDrawBox = D
      if (_options.dotShadows.enabled) {
        createImageBitmap(pxg.imageData, D.x, D.y, D.w, D.h).then((img) =>
          ctx.drawImage(img, D.x, D.y)
        )
      } else {
        ctx.putImageData(pxg.imageData, 0, 0, D.x, D.y, D.w, D.h)
      }
    }
  },

  sprites: function () {
    const ctx = dotCanvas.getContext("2d")
    const size = _dotSettings._dotSize

    // Make sprite sheet
    const bufferCanvas = document.createElement("canvas")
    const bufCtx = bufferCanvas.getContext("2d")

    const items = ActivityCollection.items
    const colorSet = new Set(
      Array.from(items.values()).map((A) => A.colors.dot)
    )
    const colorsArray = Array.from(colorSet)
    const colorIdx = {}
    const n = colorsArray.length
    for (let i = 0; i < n; i++) {
      const color = colorsArray[i]
      colorIdx[color] = i
    }
    bufferCanvas.width = 3 * size * n
    bufferCanvas.height = 2 * size
    const loc = (idx, sel) => {
      const x = 3 * idx + sel
      const y = 0
      const w = (1 + sel) * size
      const h = w
      return { x, y, w, h }
    }

    for (let i = 0; i < n; i++) {
      bufCtx.fillStyle = colorsArray[i]

      const { x0, y0, w0, h0 } = loc(i, 0)``
      bufCtx.fillRect(x0, y0, w0, h0)

      const { x1, y1, w1 } = loc(i, 1)
      const radius = w1 / 2
      const cx = x1 + radius
      const cy = y1 + radius
      bufCtx.beginPath()
      bufCtx.ctx.arc(cx, cy, radius, 0, TWO_PI)
      ctx.closePath()
      ctx.fill()
    }

    _drawFunction.circle = (x, y, color) => {
      const idx = color ? colorIdx(color) : 0
      const r = loc(idx, 1)
    }

    _drawFunction.square = (x, y, color) => {
      const idx = color ? colorIdx(color) : 0
      const r = loc(idx, 0)
    }
  },
}

const _re = /(\d+),(\d+),(\d+)/
function extractColor(colorString) {
  if (colorString[0] === "#") {
    const num = parseInt(colorString.replace("#", "0x"))
    const r = (num & 0xff0000) >> 16
    const g = (num & 0x00ff00) >> 8
    const b = num & 0x0000ff
    return rgbaToUint32(r, g, b, 0xff)
  }
  const result = colorString.match(_re)
  return rgbaToUint32(result[1], result[2], result[3], _dotSettings.alpha)
}

async function drawDots(tsecs) {
  if (!_ready || !_styleGroups) return 0

  _drawFunction.before()

  let count = 0
  for (const { spec, items, sprite } of _styleGroups.dot) {
    const drawDotFunc = _drawFunction[sprite]
    _drawFunction.setColor(extractColor(spec.strokeStyle || spec.fillStyle))

    items.forEach((A) => {
      count += A.forEachDot(tsecs, drawDotFunc)
    })
  }
  _drawFunction.after()
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
