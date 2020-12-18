/*
  DotLayer Efrem Rensi, 2020,
*/

import { Layer, DomUtil, Browser, setOptions } from "../myLeaflet.js"
import { Control } from "../myLeaflet.js"

import * as ViewBox from "./ViewBox.js"
import * as DrawBox from "./DrawBox.js"
import * as ActivityCollection from "./ActivityCollection.js"
import { MAP_INFO } from "../Env.js"
import { nextTask, nextAnimationFrame } from "../appUtil.js"
import { DEBUG_BORDERS } from "../Env.js"
// import * as WorkerPool from "./WorkerPool.js"

import {
  options as defaultOptions,
  dotSettings as _dotSettings,
} from "./Defaults.js"

export { _dotSettings as dotSettings }

/* In order to prevent path redraws from happening too often
 * and hogging up CPU cycles we set a minimum delay between redraws
 */
const FORCE_FULL_REDRAW = true
const CONTINUOUS_REDRAWS = false
const MIN_REDRAW_DELAY = 1000 // milliseconds
const TWO_PI = 2 * Math.PI
const TARGET_FPS = 30
const MAX_POINTS_IN_SPLIT_FRAME = 500

const _timeOrigin = performance.timing.navigationStart

const _drawFunction = {
  square: null,
  circle: null,
}

let dotCanvas, pathCanvas, debugCanvas
const dotCanvasPane = "shadowPane"
const pathCanvasPane = "overlayPane"
const debugCanvasPane = "overlayPane"

// for debug display
const _fpsRegister = []
let _fpsSum = 0
let _roundCount, _duration

let _map, _options
let _timePaused, _ready, _paused
let _drawingDots
let _gifPatch
let _dotStyleGroups
let _lastRedraw = 0
let _timeOffset = 0
let _lastCalledTime
let _fpsInterval
let _lastDotDrawBox

/*
 * Display for debugging
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

    /*
     * The Path Canvas is for activity paths, which are made up of a bunch of
     * segments.
     */
    pathCanvas = addCanvasOverlay(pathCanvasPane)
    const ctx = pathCanvas.getContext("2d")
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

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

  // --------------------------------------------------------------------
  redraw: redraw,

  // Call this function after items are added or removed
  reset: async function () {
    if (!ActivityCollection.items.size) return

    _ready = false

    ActivityCollection.reset()
    updateDotSettings()
    _ready = true
    await redraw(true)

    if (!_paused) this.animate()
  },

  // --------------------------------------------------------------------
  animate: animate,

  // --------------------------------------------------------------------
  pause: function () {
    _paused = true
    _timePaused = Date.now()
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
    // movestart: loggit,
    moveend: onMoveEnd,
    // zoomstart: loggit,
    zoom: onZoom,
    zoomend: onZoomEnd,
    // viewreset: onViewReset,
    resize: onResize,
  }

  if (CONTINUOUS_REDRAWS) {
    events.move = onMove
  }

  if (_map.options.zoomAnimation && Browser.any3d) {
    events.zoomanim = _animateZoom
  }

  return events
}

function dotCtxReset() {
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

function onResize(resizeEvent) {
  ViewBox.resize(resizeEvent.newSize)
  // onViewReset()
  redraw(true)
}

function onViewReset() {
  console.log("viewReset")
  // dotCtxReset()
}

function onZoom(e) {
  if (!_map || !ViewBox.zoom) return

  // console.log("onzoom")

  if (e.pinch || e.flyTo) {
    const zoom = _map.getZoom()
    const center = _map.getCenter()
    _animateZoom({ zoom, center })
    console.log(e)
  }
}

/*
 * This gets called after zooming stops, but before onMoveEnd
 */
function onZoomEnd() {
  // console.log("onzoomend")
}

/*
 * This gets called continuously as the user pans or zooms (without pinch)
 */
async function onMove() {
  // prevent redrawing more often than necessary
  const ts = Date.now()
  if (ts - _lastRedraw < MIN_REDRAW_DELAY) {
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
  // const t0 = Date.now()

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
  const dVx = V_.x - V.x
  const Dx1 = D.x + dVx
  const Dx2 = Dx1 + D.w
  const DxLeft = Math.max(0, Dx1)
  const DxRight = Math.min(Dx2, V.w)
  const Cx = ~~(DxLeft - dVx)
  const Cw = ~~(0.5 + DxRight - DxLeft)

  const dVy = V_.y - V.y
  const Dy1 = ~~(D.y + dVy)
  const Dy2 = Dy1 + D.h
  const DyTop = Math.max(0, Dy1)
  const DyBottom = Math.min(Dy2, V.h)
  const Cy = ~~(DyTop - dVy)
  const Ch = ~~(0.5 + DyBottom - DyTop)

  // We copy if any of the DrawBox is still on screen
  if (DxLeft < V.w && DxRight > 0 && DyTop < V.h && DyBottom > 0) {
    // const copyRect = { x: Cx, y: Cy, w: Cw, h: Ch }
    // const pasteRect = { x: DxLeft, y: DyTop, w: Cw, h: Ch }
    // const debugCtx = _debugCanvas.getContext("2d")
    // debugCtx.strokeStyle = "#222222"
    // DrawBox.draw(debugCtx, copyRect) // draw source rect
    // debugCtx.fillText("Copy", copyRect.x + 20, copyRect.y + 20)
    // debugCtx.strokeStyle = "#000000"
    // DrawBox.draw(debugCtx, pasteRect) // draw dest rect
    // debugCtx.fillText("Paste", pasteRect.x + 20, pasteRect.y + 20)

    const canvasesToMove = [pathCanvas]
    for (const canvas of canvasesToMove) {
      const ctx = canvas.getContext("2d")
      const imageData = ctx.getImageData(Cx, Cy, Cw, Ch)
      DrawBox.clear(ctx, D)
      ctx.putImageData(imageData, DxLeft, DyTop)
    }

    DrawBox.clear(dotCanvas.getContext("2d"), D)
  } else {
    // If none of the last DrawBox is still on screen we just clear it
    const canvasesToClear = [pathCanvas, dotCanvas]
    for (const canvas of canvasesToClear) {
      DrawBox.clear(canvas.getContext("2d"), D)
    }
  }

  // console.log(`moveDrawBox: ${D.w}x${D.h} -- ${Date.now() - t0}ms`)
}

async function redraw(force) {
  if (!_ready) return

  await nextTask()

  const boundsChanged = ViewBox.updateBounds()
  const zoomChanged = ViewBox.updateZoom()
  if (!force && !boundsChanged && !zoomChanged) {
    return
  }

  // // make sure we are in a new task
  // await nextTask()

  // console.log("onmoveend")
  updateDotSettings()
  const fullRedraw = zoomChanged || FORCE_FULL_REDRAW || force

  // Recalibrate the DrawBox (and possible move it)
  if (fullRedraw) {
    const oldDrawBoxDim = DrawBox.getScreenRect()
    ViewBox.calibrate()
    const canvasesToClear = [pathCanvas, dotCanvas]
    for (const canvas of canvasesToClear) {
      DrawBox.clear(canvas.getContext("2d"), oldDrawBoxDim)
    }
  } else {
    moveDrawBox()
  }

  DrawBox.reset()

  if (fullRedraw) {
    ActivityCollection.resetSegMasks()
  }

  const styleGroups = await ActivityCollection.updateGroups()
  _dotStyleGroups = styleGroups.dot

  updateDrawDotFuncs.default()

  if (DEBUG_BORDERS) {
    drawBoundsBoxes()
  }

  if (_options.showPaths) {
    await nextAnimationFrame()
    drawPaths(styleGroups.path, fullRedraw)
  }

  if (_paused) {
    await nextAnimationFrame()
    drawDots(null, styleGroups.dot, true)
  }
}

function drawPaths(pathStyleGroups, forceFullRedraw) {
  if (!_ready) return

  const alphaScale = _dotSettings.alphaScale
  const drawAll = forceFullRedraw || FORCE_FULL_REDRAW

  const ctx = pathCanvas.getContext("2d")
  let count = 0
  const transformedMoveTo = ViewBox.makeTransform((x, y) => ctx.moveTo(x, y))
  const transformedLineTo = ViewBox.makeTransform((x, y) => ctx.lineTo(x, y))
  const drawSegment = (x1, y1, x2, y2) => {
    transformedMoveTo(x1, y1)
    transformedLineTo(x2, y2)
  }

  for (const { spec, items } of pathStyleGroups) {
    Object.assign(ctx, spec)
    ctx.globalAlpha = spec.globalAlpha * alphaScale
    ctx.beginPath()
    for (const A of items) {
      count += A.forEachSegment(drawSegment, drawAll)
    }
    ctx.stroke()
  }
  return count
}

/*
 * Functions for Drawing Dots
 * size is the length of the square and the radius of the circle
 */

const updateDrawDotFuncs = {
  default: function () {
    const ctx = dotCanvas.getContext("2d")
    const size = _dotSettings._dotSize
    const dotOffset = size / 2.0

    _drawFunction.circle = ViewBox.makeTransform(function (x, y) {
      ctx.arc(x, y, size, 0, TWO_PI)
      ctx.closePath()
    })

    _drawFunction.square = ViewBox.makeTransform(function (x, y) {
      ctx.rect(x - dotOffset, y - dotOffset, size, size)
    })
  },

  putImageData: function () {
    const ctx = dotCanvas.getContext("2d")
    const size = _dotSettings._dotSize
    if (!_dotStyleGroups) return

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
    const gloc = (color, selected) => {
      const idx = colorIdx[color]
      const sel = selected ? 1 : 0
      return loc(idx, sel)
    }

    for (let i = 0; i < n; i++) {
      bufCtx.fillStyle = colorsArray[i]

      const { x0, y0, w0, h0 } = loc(i, 0)
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
  },
}

async function drawDots(ts, dotStyleGroups, split) {
  if (!_ready || !_dotStyleGroups) return 0

  const alphaScale = _dotSettings.alphaScale
  const styleGroups = dotStyleGroups || _dotStyleGroups.values()

  ts = ts || _timePaused || performance.now()

  const ctx = dotCanvas.getContext("2d")

  DrawBox.clear(ctx, _lastDotDrawBox || DrawBox.defaultRect())

  let count = 0
  let thisFrameCount = 0
  for (const { spec, items, sprite } of styleGroups) {
    const drawDotFunc = _drawFunction[sprite]
    Object.assign(ctx, spec)
    ctx.globalAlpha = spec.globalAlpha * alphaScale
    ctx.beginPath()
    items.forEach(
      (A) => (thisFrameCount += A.forEachDot(ts + _timeOffset, drawDotFunc))
    )
    ctx.fill()

    if (split && thisFrameCount > MAX_POINTS_IN_SPLIT_FRAME) {
      ts = await nextAnimationFrame()
      count += thisFrameCount
      thisFrameCount = 0
    }
  }

  count += thisFrameCount
  _lastDotDrawBox = DrawBox.getScreenRect()
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
function updateDotSettings(settings, shadowSettings) {
  const ds = _dotSettings
  if (settings) Object.assign(ds, settings)

  const vb = ViewBox,
    zf = vb.zf,
    zoom = vb.zoom
  ds._timeScale = ds.C2 / zf
  ds._period = ds.C1 / zf
  ds._dotSize = Math.max(1, ~~(ds.dotScale * Math.log(zoom) + 0.5))

  if (shadowSettings) {
    Object.assign(_options.dotShadows, shadowSettings)
  }

  dotCtxReset()
  return ds
}

/*
 * Animation
 */
async function animate() {
  // this prevents accidentally running multiple animation loops
  if (_drawingDots || !_ready) return

  _drawingDots = true
  _paused = false

  if (_timePaused) {
    _timeOffset = _timeOrigin - (Date.now() - _timePaused)
    _timePaused = null
  } else {
    _timeOffset = _timeOrigin
  }
  _lastCalledTime = performance.now()
  _fpsInterval = 1000 / TARGET_FPS
  // console.log(`fpsInterval: ${_fpsInterval}`)

  while (!_paused) {
    const ts = await nextAnimationFrame()
    const frameDelay = ts - _lastCalledTime
    if (frameDelay > _fpsInterval) {
      _lastCalledTime = ts

      // draw the dots
      const count = await drawDots(ts)

      if (MAP_INFO) {
        updateInfoBox(frameDelay, count)
      }
    }
  }

  _drawingDots = false
  _timePaused = performance.now() + _timeOffset
}

// let infoBoxUpdateCounter = 0
function updateInfoBox(dt, count) {
  _fpsSum += dt
  _fpsRegister.push(dt)
  if (_fpsRegister.length !== 30) return

  const roundCount = 10 * Math.round(count / 10)
  const duration = Math.round(_fpsSum / 30)
  _fpsSum -= _fpsRegister.shift()
  if (roundCount !== _roundCount && duration !== _duration) {
    _infoBox.innerHTML = `${duration} ms (${Math.round(
      1000 / duration
    )}fps), ${count} pts`
  }
  _roundCount = roundCount
  _duration = duration
}

function _animateZoom(e) {
  const newZoom = e.zoom
  const newCenter = e.center
  const scale = _map.getZoomScale(newZoom)

  const origin = _map.getBounds().getNorthWest()
  const offset = _map._latLngToNewLayerPoint(origin, newZoom, newCenter)

  ViewBox.setCSStransform(offset, scale)
}
