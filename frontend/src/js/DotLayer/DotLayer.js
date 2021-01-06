/*
  DotLayer Efrem Rensi, 2020,
*/

import { Layer, DomUtil, Browser, setOptions } from "../myLeaflet.js"
import { Control } from "../myLeaflet.js"

import * as ViewBox from "./ViewBox.js"
import * as DrawBox from "./DrawBox.js"
import * as ActivityCollection from "./ActivityCollection.js"
import * as PixelGraphics from "./PixelGraphics.js"
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
    dotCanvas.imageData = dotCanvas.getContext("2d").createImageData(dw, dh)
    makeDrawDotFuncs.imageDataTest()

    /*
     * The Path Canvas is for activity paths, which are made up of a bunch of
     * segments.
     */
    pathCanvas = addCanvasOverlay(pathCanvasPane)
    const { width: pw, height: ph } = pathCanvas
    pathCanvas.imageData = pathCanvas.getContext("2d").createImageData(pw, ph)
    PixelGraphics.setImageData(pathCanvas.imageData)

    if (DEBUG_BORDERS) {
      // create Canvas for debugging canvas stuff
      debugCanvas = addCanvasOverlay(debugCanvasPane)
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
  dotCanvas.imageData = dotCanvas.getContext("2d").createImageData(dw, dh)
  makeDrawDotFuncs.imageDataTest()
  dotCtxUpdate()

  /*
   * The Path Canvas is for activity paths, which are made up of a bunch of
   * segments.
   */
  const { width: pw, height: ph } = pathCanvas
  pathCanvas.imageData = pathCanvas.getContext("2d").createImageData(pw, ph)
  PixelGraphics.setImageData(pathCanvas.imageData)
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
  // Get the current draw rectangle in screen coordinates (relative to map pane position)
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
    imageDataMoveRect(canvas.imageData, D, dVx, dVy)
    DrawBox.clear(canvas.getContext("2d"), D)
  }
}

/*
 * This function moves the pixels from one rectangular region
 *  of an imageData object to another, possibly overlapping
 *  rectanglular region of equal size.
 */
function imageDataMoveRect(imageData, rect, shiftX, shiftY) {
  const { width, height, data } = imageData
  const r = rect
  const buf32 = new Uint32Array(data.buffer)

  const [dx0, dy0] = ViewBox.clip(r.x + shiftX, r.y + shiftY)
  const [dx1, dy1] = ViewBox.clip(r.x + r.w + shiftX, r.y + r.h + shiftY)
  let s, d

  // We only define desatination rect if it is on-screen
  if (dx0 !== dx1 && dy0 !== dy1) {
    d = { x: dx0, y: dy0, w: dx1 - dx0, h: dy1 - dy0 }
    s = { x: dx0 - shiftX, y: dy0 - shiftY, w: d.w, h: d.h }
  } else {
    /* if there is no destination rectangle (nothing in view)
     *  we just clear the source rectangle and exit
     */
    imageDataClearRect(imageData, rect)
    return
  }

  if (DEBUG_BORDERS) {
    const debugCtx = debugCanvas.getContext("2d")
    debugCtx.strokeStyle = "#000000"
    DrawBox.draw(debugCtx, s, "source") // draw source rect
    DrawBox.draw(debugCtx, d, "dest") // draw dest rect
  }

  const moveRow = (row) => {
    const sOffset = (s.y + row) * width
    const sRowStart = sOffset + s.x
    const sRowEnd = sRowStart + s.w
    const rowData = buf32.subarray(sRowStart, sRowEnd)

    const dOffset = (d.y + row) * width
    const dRowStart = dOffset + d.x
    buf32.set(rowData, dRowStart)

    // erase the whole source rect row
    const rStart = sOffset + r.x
    const rEnd = rStart + r.w
    buf32.fill(0, rStart, rEnd) // clear the source row
  }

  /* We only bother copying if the destination rectangle is within
   * the imageData bounds
   */
  if (d.y < s.y) {
    /* if the source rectangle is below the destination
       then we copy rows from the top down */
    for (let row = 0; row < s.h; row++) moveRow(row)

    const clearRegion = { x: r.x, y: r.y, w: r.w, h: r.h - s.h }
    if (DEBUG_BORDERS) {
      DrawBox.draw(debugCanvas, clearRegion, "clear") // draw source rect
    }

    imageDataClearRect(imageData, clearRegion)
  } else if (d.y > s.y) {
    /* otherwise we copy from the bottom row up */
    for (let row = s.h - 1; row >= 0; row--) moveRow(row)

    // and clear what's left of source rectangle
    const clearRegion = { x: r.x, y: r.y + s.h, w: r.w, h: r.h - s.h }
    if (DEBUG_BORDERS) {
      DrawBox.draw(debugCanvas, clearRegion, "clear") // draw source rect
    }

    imageDataClearRect(imageData, clearRegion)
  } else {
    /* In the rare case that the source and dest rectangles are
     *  horizontally adjacent to each other, we cannot copy rows directly
     *  because the rows may overlap. We have to use an intermediate buffer,
     *  ideally an unused block of the same imageData arraybuffer.
     */
    let bufOffset
    // use the first row of imagedata if it is available
    if (d.y > 0) bufOffset = 0
    // or the last row
    else if (d.y + d.h < r.h) bufOffset = (r.h - 1) * width

    const rowBuf =
      bufOffset === undefined
        ? new Uint32Array(d.w) // Worst-case scenario: allocate new memory
        : buf32.subarray(bufOffset, bufOffset + d.w)

    for (let y = d.y, n = d.y + d.h; y < n; y++) {
      const offset = y * width
      const sRowStart = offset + s.x
      const sRowEnd = sRowStart + s.w
      const dRowStart = offset + d.x

      const rowData = buf32.subarray(sRowStart, sRowEnd)
      rowBuf.set(rowData)
      buf32.set(rowBuf, dRowStart)
    }
    // now clear the row buffer if it is part of imageData
    if (bufOffset !== undefined) rowBuf.fill(0)

    // and clear the remaining part of source rectangle
    const clearRegion =
      s.x < d.x
        ? { x: s.x, y: s.y, w: d.x - s.x, h: s.h }
        : { x: d.x + d.w, y: s.y, w: s.x - d.x, h: s.h }
    if (DEBUG_BORDERS) {
      DrawBox.draw(debugCanvas, clearRegion, "clear")
    }

    imageDataClearRect(imageData, clearRegion)
  }
}

const imageDataClearRect = (imageData, { x, y, w, h }) => {
  const { width, data } = imageData
  const buf32 = new Uint32Array(data.buffer)
  for (let row = y; row < y + h; row++) {
    const offset = row * width
    buf32.fill(0, offset + x, offset + x + w)
  }
}

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
      imageDataClearRect(canvas.imageData, oldDrawBoxDim)
    }
  } else {
    // const t0 = Date.now()
    moveDrawBox()
    drawPathImageData()
    // console.log(`moveDrawBox: ${D.w}x${D.h} -- ${Date.now() - t0}ms`)
  }

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

function drawSegment(x0, y0, x1, y1) {
  const [tx0, ty0] = ViewBox.transform(x0, y0)
  const [tx1, ty1] = ViewBox.transform(x1, y1)
  if (!tx0 || !ty0 || !tx1 || !ty1) return

  PixelGraphics.drawSegment(
    Math.round(tx0),
    Math.round(ty0),
    Math.round(tx1),
    Math.round(ty1)
  )
}

function drawPathImageData() {
  const { x: Dx, y: Dy, w: Dw, h: Dh } = DrawBox.getScreenRect()
  const pathCtx = pathCanvas.getContext("2d")
  const pathImageData = pathCanvas.imageData
  pathCtx.putImageData(pathImageData, 0, 0, Dx, Dy, Dw, Dh)
}

async function drawPaths(forceFullRedraw) {
  if (!_ready) return

  // const alphaScale = _dotSettings.alphaScale
  const drawAll = forceFullRedraw || FORCE_FULL_REDRAW

  let count = 0
  let frameCount = 0
  for (const { spec, items } of _styleGroups.path) {
    PixelGraphics.setColor(extractColor(spec.strokeStyle))
    PixelGraphics.setWidth(spec.lineWidth)
    for (const A of items) {
      const segMask = drawAll ? A.segMask : A.getSegMaskUpdates()
      if (segMask) {
        frameCount += A.forEachSegment(drawSegment, segMask)
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
    const imageData = dotCanvas.imageData
    const { width, height } = imageData
    const buf32 = new Uint32Array(imageData.data.buffer) // deal with endianness!
    const ctx = dotCanvas.getContext("2d")
    let drawColor

    _drawFunction.before = () => {
      if (_lastDotDrawBox) {
        imageDataClearRect(imageData, _lastDotDrawBox)
        if (_options.dotShadows.enabled) {
          DrawBox.clear(ctx, _lastDotDrawBox)
        }
      } else {
        buf32.fill(0)
        DrawBox.clear(ctx)
      }
    }

    _drawFunction.setColor = (color) => {
      drawColor = color
    }

    _drawFunction.square = (x, y) => {
      const size = ds._dotSize
      const dotOffset = size / 2
      const color = drawColor

      const p = ViewBox.transform(x, y)
      const tx = (p[0] - dotOffset + 0.5) | 0
      const ty = (p[1] - dotOffset + 0.5) | 0

      const xStart = tx < 0 ? 0 : tx // Math.max(0, tx)
      const xEnd = Math.min(tx + size, width)

      const yStart = ty < 0 ? 0 : ty
      const yEnd = Math.min(ty + size, height)

      for (let row = yStart; row < yEnd; row++) {
        const offset = row * width
        const colStart = offset + xStart
        const colEnd = offset + xEnd
        buf32.fill(color, colStart, colEnd)
      }
    }

    _drawFunction.circle = (x, y) => {
      const r = ds._dotSize
      const color = drawColor

      const p = ViewBox.transform(x, y)

      const tx = (p[0] + 0.5) | 0
      const ty = (p[1] + 0.5) | 0

      const r2 = r * r
      for (let cy = -r + 1; cy < r; cy++) {
        const offset = (cy + ty) * width
        const cx = Math.sqrt(r2 - cy * cy)
        const colStart = (offset + tx - cx) | 0
        const colEnd = (offset + tx + cx) | 0
        buf32.fill(color, colStart, colEnd)
      }
    }

    _drawFunction.after = () => {
      const D = DrawBox.getScreenRect()
      _lastDotDrawBox = D
      if (_options.dotShadows.enabled) {
        createImageBitmap(imageData, D.x, D.y, D.w, D.h).then((img) =>
          ctx.drawImage(img, D.x, D.y)
        )
      } else {
        ctx.putImageData(imageData, 0, 0, D.x, D.y, D.w, D.h)
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
