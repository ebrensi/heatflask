/*
  DotLayer Efrem Rensi, 2020,
*/

import { Layer, DomUtil, Browser, setOptions } from "../myLeaflet.js"
import { Control } from "../myLeaflet.js"

import * as ViewBox from "./ViewBox.js"
import * as DrawBox from "./DrawBox.js"
import * as ActivityCollection from "./ActivityCollection.js"
import { MAP_INFO } from "../Env.js"
import { queueTask } from "../appUtil.js"

// import * as WorkerPool from "./WorkerPool.js"

import {
  options as defaultOptions,
  dotSettings as _dotSettings,
} from "./Defaults.js"

export {_dotSettings as dotSettings}

/* In order to prevent path redraws from happening too often
 * and hogging up CPU cycles we set a minimum delay between redraws
 */
const FORCE_FULL_REDRAW = true
const CONTINUOUS_REDRAWS = false
const MIN_REDRAW_DELAY = 0 // milliseconds
const TWO_PI = 2 * Math.PI
const TARGET_FPS = 30

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
let _dotStyleGroups, _pathStyleGroups
let _lastRedraw = 0
let _timeOffset = 0
let _frame, _capturing
let _lastCalledTime
let _fpsInterval
let _zoomChanged
let _lastPathDrawBox, _lastDotDrawBox


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

    if (_options.debug) {
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

    if (_options.debug) {
      map._panes[debugCanvasPane].removeChild(debugCanvas)
      debugCanvas = null
    }

    map.off(assignEventHandlers(), this)
  },

  // --------------------------------------------------------------------
  redraw: redraw,

  // Call this function after items are added or removed
  reset: function () {
    if (!ActivityCollection.items.size) return

    _ready = false

    ActivityCollection.reset()
    ViewBox.updateZoom()
    ViewBox.calibrate()
    ViewBox.updateBounds()
    updateDotSettings()

    _ready = true
    redraw(true)

    if (!_paused) this.animate()
  },

  // --------------------------------------------------------------------
  animate: function () {
    _drawingDots = true
    _paused = false
    if (_timePaused) {
      _timeOffset = Date.now() - _timePaused
      _timePaused = null
    }
    _lastCalledTime = performance.now()
    _fpsInterval = 1000 / TARGET_FPS
    console.log(`fpsInterval: ${_fpsInterval}`)
    _frame = window.requestAnimationFrame(_animate)
  },

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
    viewreset: onViewReset,
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
  _zoomChanged = true

  if (e.pinch || e.flyTo) {
    const zoom = _map.getZoom()
    const center = _map.getCenter()
    _animateZoom({ zoom, center })
  }
}

/*
 * This gets called after zooming stops, but before onMoveEnd
 */
function onZoomEnd() {
  // console.log("onzoomend")
  const oldRoundedZoom = ViewBox.zoom
  ViewBox.updateZoom()
  _zoomChanged = 1

  // The zoom has changed but if we are still at the same integer zoom level
  // then we don't need to redraw because we are not changing to a different idxSet
  if (ViewBox.zoom !== oldRoundedZoom) {
    _zoomChanged = 2
  }
}

function moveDrawBox() {
  const t0 = Date.now()

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

  console.log(`moveDrawBox: ${D.w}x${D.h} -- ${Date.now() - t0}ms`)
}

/*
 * This gets called continuously as the user pans or zooms (without pinch)
 */
function onMove() {
  // prevent redrawing more often than necessary
  const ts = Date.now()
  if (ts - _lastRedraw < MIN_REDRAW_DELAY || _zoomChanged || !ViewBox.zoom) {
    return
  }

  // const cd = cc++
  // console.log(cd + ": onmove")
  // setTimeout(() => console.log(cd+": macroTask after onmove"), 0)
  // window.queueMicrotask(() => console.log(cd+": microTask after onmove"))
  // new Promise(resolve => {
  //   console.log(cd+": promise before resolve")
  //   resolve(cd)
  // }).then(result => console.log(cd+": promise after resolve -- "+result))
  // window.requestAnimationFrame(() => console.log(cd+": rAF after onmove"))

  _lastRedraw = ts
  onMoveEnd()
}

/*
 * This gets called after a pan or zoom is done.
 * Leaflet moves the pixel origin so we need to reset the CSS transform
 */
function onMoveEnd() {
  ViewBox.updateBounds()

  // console.log("onmoveend")

  if (_zoomChanged || FORCE_FULL_REDRAW || DrawBox.isEmpty()) {
    const D = DrawBox.getScreenRect()
    ViewBox.calibrate()
    const canvasesToClear = [pathCanvas, dotCanvas]
    for (const canvas of canvasesToClear) {
      DrawBox.clear(canvas.getContext("2d"), D)
    }
  } else {
    moveDrawBox()
  }

  DrawBox.reset()

  setTimeout(redraw)
}

function redraw(forceFull) {
  if (!_ready) return

  if (_zoomChanged || FORCE_FULL_REDRAW || forceFull) {
    ActivityCollection.resetSegMasks()
  }

  ActivityCollection.updateGroups()

  queueTask(updateDrawDotFuncs.default)

  queueTask(() => {
    const {dot, path} = ActivityCollection.getGroups()
    _pathStyleGroups = path
    _dotStyleGroups = dot
  })

  if (_options.showPaths) {
    const drawEverySegment = _zoomChanged
    queueTask(() => window.requestAnimationFrame(() => {

      drawPaths(_pathStyleGroups, drawEverySegment)
    }))
  }

  if (_paused) {
    queueTask(() => window.requestAnimationFrame(drawDots))
  }

  if (_options.debug) {
    queueTask(() => window.requestAnimationFrame(drawBoundsBoxes))
  }

  _zoomChanged = false
}

function drawPaths(pathStyleGroups, forceFullRedraw ) {
  if (!_ready) return

  const alphaScale = _dotSettings.alphaScale

  const t0 = Date.now()

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
  console.log(`drawPaths: ${count} segments -- ${Date.now() - t0}ms`)
  return count
}

/*
 * Functions for Drawing Dots
 */

const updateDrawDotFuncs = {

  default: function() {
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

  putImageData: function() {
    const ctx = dotCanvas.getContext("2d")
    const size = _dotSettings._dotSize
    if (!_dotStyleGroups) return

    // Make sprite sheet
    const bufferCanvas = document.createElement("canvas")
    const bufCtx = bufferCanvas.getContext("2d")

    const items = ActivityCollection.items
    const colorSet = new Set(Array.from(items.values()).map(A => A.colors.dot))
    const colorsArray = Array.from(colorSet)
    const colorIdx = {}
    const n = colorsArray.length
    for (let i=0; i<n; i++) {
      const color = colorsArray[i]
      colorIdx[color] = i
    }
    bufferCanvas.width = n
    bufferCanvas.height = 2 * size


  }
}

function drawDots(now, dotStyleGroups) {
  if (!_ready || !_dotStyleGroups) return 0

  const alphaScale = _dotSettings.alphaScale
  const styleGroups = dotStyleGroups || _dotStyleGroups.values()

  if (!now) now = _timePaused || Date.now()

  const ctx = dotCanvas.getContext("2d")

  DrawBox.clear(ctx, _lastDotDrawBox || DrawBox.defaultRect())

  let count = 0
  for (const { spec, items, sprite } of styleGroups) {
    const drawDotFunc = _drawFunction[sprite]
    Object.assign(ctx, spec)
    ctx.globalAlpha = spec.globalAlpha * alphaScale
    ctx.beginPath()
    items.forEach((A) => (count += A.forEachDot(now, drawDotFunc)))
    ctx.fill()
  }

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

  if (_paused) {
    drawDots()
  }

  return ds
}

/*
 * Animation
 */
function _animate(ts) {
  if (!_frame || !_ready || !_drawingDots) return

  _frame = null

  if (_paused || _capturing) {
    // Ths is so we can start where we left off when we resume
    _timePaused = ts
    return
  }

  const frameDelay = ts - _lastCalledTime
  if (frameDelay > _fpsInterval) {
    _lastCalledTime = ts

    // draw the dots
    const count = drawDots(ts + _timeOrigin - _timeOffset)

    if (MAP_INFO) {
      updateInfoBox(frameDelay, count)
    }
  }

  _frame = window.requestAnimationFrame(_animate)
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
    _infoBox.innerHTML = `${duration} ms (${Math.round(1000/duration)}fps), ${count} pts`
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
