/*
  DotLayer Efrem Rensi, 2020,
*/

import { Layer, Util, DomUtil, Browser, setOptions } from "../myLeaflet.js"
import { Control } from "../myLeaflet.js"

import * as ViewBox from "./ViewBox.js"
import * as DrawBox from "./DrawBox.js"
import * as ActivityCollection from "./ActivityCollection.js"
import { MAP_INFO } from "../Env.js"
// import * as WorkerPool from "./WorkerPool.js"

import {
  options as defaultOptions,
  dotSettings as _dotSettings,
} from "./Defaults.js"

/* In order to prevent path redraws from happening too often
 * and hogging up CPU cycles we set a minimum delay between redraws
 */
const FORCE_FULL_REDRAW = false
const CONTINUOUS_REDRAWS = false
const MIN_REDRAW_DELAY = 1000 // milliseconds
const TWO_PI = 2 * Math.PI
const TARGET_FPS = 30

// For canvases
const VISIBLE = 0
const HIDDEN = 1

const _timeOrigin = performance.timing.navigationStart
const _pathCanvases = []
const _dotCanvases = []

const _drawFunction = {
  square: null,
  circle: null,
}

// for debug display
const _fpsRegister = []
let _fpsSum = 0
let _roundCount, _duration

let _map, _options
let _timePaused, _ready, _paused
let _drawingDots
let _gifPatch
let _debugCanvas
let _dotStyleGroups
let _lastRedraw = 0
let _timeOffset = 0
let _redrawCounter = 0
let _frame, _capturing
let _lastCalledTime, _minDelay
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
    for (let i = 0; i < 2; i++) {
      const canvas = addCanvasOverlay("shadowPane")
      _dotCanvases.push(canvas)
    }
    _dotCanvases[HIDDEN].style.display = "none"

    /*
     * The Path Canvas is for activity paths, which are made up of a bunch of
     * segments.  We make two of them, the second of which is hidden using
     * style { display: none }.
     * when drawing paths, we draw to the hidden canvas and swap the references
     * so that the hidden one becomes visible and the previously visible one
     * gets hidden. That way, the user experiences no flicker due to the canvas being
     * cleared and then drawn to.
     */
    for (let i = 0; i < 2; i++) {
      const canvas = addCanvasOverlay("overlayPane")
      const ctx = canvas.getContext("2d")
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      _pathCanvases.push(canvas)
    }
    // [0] will always be the visible one and [1] will be hidden
    _pathCanvases[HIDDEN].style.display = "none"

    if (_options.debug) {
      // create Canvas for debugging canvas stuff
      _debugCanvas = addCanvasOverlay("overlayPane")
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
    for (let i = 0; i < 2; i++) {
      map._panes.shadowPane.removeChild(_dotCanvases[i])
    }
    _dotCanvases.length = 0

    for (let i = 0; i < 2; i++) {
      map._panes.overlayPane.removeChild(_pathCanvases[i])
    }
    _pathCanvases.length = 0

    if (_options.debug) {
      map._panes.overlayPane.removeChild(_debugCanvas)
      _debugCanvas = null
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
    // if (_timePaused) {
    //   _timeOffset = UTCnowSecs() - _timePaused
    //   _timePaused = null
    // }
    _lastCalledTime = 0
    _minDelay = ~~(1000 / TARGET_FPS + 0.5)
    _frame = Util.requestAnimFrame(_animate, this)
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
  const loggit = (handler) => (e) => {
    console.log(e)
    handler && handler(e)
  }

  const events = {
    // movestart: loggit,
    moveend: onMoveEnd,
    // zoomstart: loggit,
    zoom: _onZoom,
    zoomend: onZoomEnd,
    // viewreset: loggit,
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

function _onZoom(e) {
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
 * This gets called continuously as the user pinch-pans or zooms
 */
function onMove(event) {
  // prevent redrawing more often than necessary
  const ts = Date.now()

  if (ts - _lastRedraw < MIN_REDRAW_DELAY || _zoomChanged || !ViewBox.zoom) return

  _lastRedraw = ts
  onMoveEnd(event)
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

/*
 * This gets called after a pan or zoom is done.
 * Leaflet moves the pixel origin so we need to reset the CSS transform
 */
function onMoveEnd(event) {
  ViewBox.updateBounds()
  // console.log("onmoveend")

  if (_zoomChanged || FORCE_FULL_REDRAW) {
    ViewBox.calibrate()
  } else {
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
    const Dx2 = Dx1 + D.w + 0.5
    const DxLeft = Math.max(0, Dx1)
    const DxRight = Math.min(Dx2, V.w)
    const Cx = DxLeft - dVx
    const Cw = DxRight - DxLeft

    const dVy = V_.y - V.y
    const Dy1 = D.y + dVy
    const Dy2 = Dy1 + D.h + 0.5
    const DyTop = Math.max(0, Dy1)
    const DyBottom = Math.min(Dy2, V.h)
    const Cy = DyTop - dVy
    const Ch = DyBottom - DyTop

    // We only do this if any of the DrawBox is still on screen
    if (DxLeft < V.w && DxRight > 0 && DyTop < V.h && DyBottom > 0) {
      const copyRect = { x: Cx, y: Cy, w: Cw, h: Ch }
      const pasteRect = { x: DxLeft, y: DyTop, w: Cw, h: Ch }

      const debugCtx = _debugCanvas.getContext("2d")
      debugCtx.strokeStyle = "#222222"
      DrawBox.draw(debugCtx, copyRect) // draw source rect
      debugCtx.fillText("Copy", copyRect.x + 20, copyRect.y + 20)

      debugCtx.strokeStyle = "#000000"
      DrawBox.draw(debugCtx, pasteRect) // draw dest rect
      debugCtx.fillText("Paste", pasteRect.x + 20, pasteRect.y + 20)

      console.time("moveDrawBox")
      // move paths
      const pathCtx = _pathCanvases[VISIBLE].getContext("2d")
      const paths = DrawBox.copy(pathCtx, copyRect)
      DrawBox.clear(pathCtx, D)
      DrawBox.paste(pathCtx, paths, DxLeft, DyTop)

      // move Dots
      const dotCtx = _dotCanvases[VISIBLE].getContext("2d")
      const dots = DrawBox.copy(dotCtx, copyRect)
      DrawBox.clear(dotCtx, D)
      DrawBox.paste(dotCtx, dots, DxLeft, DyTop)
      console.timeEnd("moveDrawBox")
    }
  }

  DrawBox.reset()
  redraw(event)
}

function dotCtxReset() {
  for (let i = 0; i < 2; i++) {
    const ctx = _dotCanvases[i].getContext("2d")
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
}

function onResize(resizeEvent) {
  ViewBox.resize(resizeEvent.newSize)
  viewReset()
  redraw()
}

function viewReset() {
  // console.log("viewReset")
  dotCtxReset()
}

function redraw() {
  if (!_ready) return

  const groups = ActivityCollection.updateGroups(
    _zoomChanged || FORCE_FULL_REDRAW
  )
  _dotStyleGroups = groups.dot

  if (_options.showPaths) {
    drawPaths(groups.path)
  }

  if (_paused) {
    drawDots()
  }

  if (_options.debug) {
    drawBoundsBoxes()
  }
  _zoomChanged = false
}

function drawBoundsBoxes() {
  const ctx = _debugCanvas.getContext("2d")
  ViewBox.clear(ctx)
  ctx.lineWidth = 4
  ctx.setLineDash([6, 5])
  ctx.strokeStyle = "rgb(0,255,0,0.8)"
  DrawBox.draw(ctx)
  ctx.strokeStyle = "rgb(255,0,255,1)"
  ViewBox.draw(ctx)
}

function drawPaths(pathStyleGroups) {
  if (!_ready) return

  const alphaScale = _dotSettings.alphaScale

  console.time("drawPaths")
  const ctx = _pathCanvases[0].getContext("2d")
  if (_zoomChanged || FORCE_FULL_REDRAW) {
    DrawBox.draw(_debugCanvas.getContext("2d"), _lastPathDrawBox)
    DrawBox.clear(ctx, _lastPathDrawBox || DrawBox.defaultRect())
  }
  let count = 0

  for (const { spec, items } of pathStyleGroups) {
    Object.assign(ctx, spec)
    ctx.globalAlpha = spec.globalAlpha * alphaScale
    ctx.beginPath()
    for (const A of items) {
      count += A.drawPath(ctx)
    }
    ctx.stroke()
  }
  console.timeEnd("drawPaths")
  _lastPathDrawBox = DrawBox.getScreenRect()
  console.log(`drew ${count} segments`)
  return count
}

/*
 * Functions for Drawing Dots
 */
function updateDrawDotFuncs() {
  const ctx = _dotCanvases[1].getContext("2d")
  const size = _dotSettings._dotSize

  _drawFunction.circle = ViewBox.makeTransform(function (x, y) {
    ctx.arc(x, y, size, 0, TWO_PI)
    ctx.closePath()
  })

  const dotOffset = size / 2.0
  _drawFunction.square = ViewBox.makeTransform(function (x, y) {
    ctx.rect(x - dotOffset, y - dotOffset, size, size)
  })
}

function drawDots(now) {
  if (!_ready) return

  if (!now) now = _timePaused || Date.now()

  updateDrawDotFuncs()

  const alphaScale = _dotSettings.alphaScale

  // We write to the currently hidden canvas
  const ctx = _dotCanvases[1].getContext("2d")

  if (_paused) console.time("drawDots")

  let count = 0
  for (const { spec, items, sprite } of _dotStyleGroups) {
    const drawDot = _drawFunction[sprite]
    Object.assign(ctx, spec)
    ctx.globalAlpha = spec.globalAlpha * alphaScale
    ctx.beginPath()
    items.forEach(
      (A) => (count += A.dotPointsFromArray(now, _dotSettings, drawDot))
    )
    ctx.fill()
  }

  swapCanvases(_dotCanvases)
  DrawBox.clear(
    _dotCanvases[HIDDEN].getContext("2d"),
    _lastDotDrawBox || DrawBox.defaultRect()
  )
  _lastDotDrawBox = DrawBox.getScreenRect()

  if (_paused) {
    console.timeEnd("drawDots")
    console.log(`drew ${count} dots`)
  }
  return count
}


function swapCanvases(canvases) {
  canvases[VISIBLE].style.display = "none" // hide the currently visible canvas
  canvases[HIDDEN].style.display = "" // show the new currentlly hidden canvas
  canvases.reverse() // swap the references
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

  const now = ts + _timeOrigin

  // let ts = UTCnowSecs(),
  //   now = ts - _timeOffset

  if (_paused || _capturing) {
    // Ths is so we can start where we left off when we resume
    _timePaused = ts
    return
  }

  if (now - _lastCalledTime > _minDelay) {
    _lastCalledTime = now

    const t0 = Date.now()
    const count = drawDots(now)

    if (MAP_INFO) {
      const dt = Date.now() - t0
      _fpsSum += dt
      _fpsRegister.push(dt)
      if (_fpsRegister.length === 30) {
        const roundCount = 10 * Math.round(count / 10)
        const duration = Math.round(_fpsSum / 30)
        _fpsSum -= _fpsRegister.shift()
        if (roundCount !== _roundCount && duration !== _duration) {
          _infoBox.innerHTML = `${duration} ms, ${count} pts`
        }
        _roundCount = roundCount
        _duration = duration
      }
    }
  }

  _frame = Util.requestAnimFrame(_animate, this)
}

function _animateZoom(e) {
  const newZoom = e.zoom
  const newCenter = e.center
  const scale = _map.getZoomScale(newZoom)

  const origin = _map.getBounds().getNorthWest()
  const offset = _map._latLngToNewLayerPoint(origin, newZoom, newCenter)

  ViewBox.setCSStransform(offset, scale)
}
