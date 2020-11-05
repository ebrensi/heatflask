/*
  DotLayer Efrem Rensi, 2020,
*/

import { Layer, Util, DomUtil, Browser, setOptions } from "leaflet"

import * as ViewBox from "./ViewBox.js"
import * as DrawBox from "./DrawBox.js"
import * as ColorPalette from "./ColorPalette.js"
// import * as WorkerPool from "./WorkerPool.js"
import { infoBox } from "../MapAPI.js"

import BitSet from "../BitSet.js"
import {
  options as defaultOptions,
  dotSettings as _dotSettings,
} from "./Defaults.js"

import { vParams, items as _items } from "../Model.js"

/* In order to prevent path redraws from happening too often
 * and hogging up CPU cycles we set a minimum delay between redraws
 */
const MIN_REDRAW_DELAY = 100 // milliseconds
const TWO_PI = 2 * Math.PI
const TARGET_FPS = 25
const CONTINUOUS_REDRAWS = false
const _timeOrigin = performance.timing.navigationStart

const _lineCanvases = []
const _dotCanvases = []

let _map, _options, _itemsArray, _itemIds, _colorPalette
let _timePaused, _ready, _paused
let _drawingDots
let _gifPatch
let _dotRect
let _debugCanvas
let _lastRedraw = 0
let _timeOffset = 0
let _redrawCounter = 0
let fps_display
let _frame, _capturing
let _lastCalledTime, _minDelay

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
    _dotCanvases[1].style.display = "none"

    /*
     * The Line Canvas is for activity paths, which are made up of a bunch of
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
      _lineCanvases.push(canvas)
    }
    // [0] will always be the visible one and [1] will be hidden
    _lineCanvases[1].style.display = "none"

    if (_options.debug) {
      // create Canvas for debugging canvas stuff
      _debugCanvas = addCanvasOverlay("overlayPane")
    }

    // if (_options.fps_display)
    //    this.fps_display = L.control.fps().addTo(_map);

    ViewBox.setMap(_map)
    map.on(assignEventHandlers(), this)
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
      map._panes.overlayPane.removeChild(_lineCanvases[i])
    }
    _lineCanvases.length = 0

    if (_options.debug) {
      map._panes.overlayPane.removeChild(_debugCanvas)
      _debugCanvas = null
    }

    map.off(assignEventHandlers(), this)
  },

  // --------------------------------------------------------------------

  // Call this function after items are added or removed
  reset: function () {
    if (!_items.size) return

    _ready = false

    _itemsArray = Array.from(_items.values())
    _itemIds = Array.from(_items.keys())
    const n = _itemsArray.length

    if (!n) return

    setDotColors()
    ViewBox.setItemsArray(_itemsArray)
    ViewBox.calibrate()
    ViewBox.update()
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

  // -------------------------------------------------------------------
  setItemSelect: function (selections) {
    let idx = 0,
      selectionsChanged = false

    const itemIds = _itemIds,
      vb = ViewBox

    for (const [id, selected] of Object.entries(selections)) {
      idx = itemIds.indexOf(+id)
      const A = _itemsArray[idx]
      A.selected = selected
      selectionsChanged |= vb.updateSelect(idx)
    }

    if (selectionsChanged) redraw()
  },

  setSelectRegion: function (pxBounds, callback) {
    let selectedIds = this.itemsInRegion(pxBounds)
    callback(selectedIds)
  },

  itemsInRegion: function (selectPxBounds) {
    // un-transform screen coordinates given by the selection
    // plugin to absolute values that we can compare ours to.
    ViewBox.unTransform(selectPxBounds.min)
    ViewBox.unTransform(selectPxBounds.max)

    const inView = ViewBox.inView()

    let selected = new BitSet()

    inView.forEach((i) => {
      const A = _itemsArray[i]
      for (const seg of this.iterSegments(A)) {
        if (selectPxBounds.contains(seg.a)) {
          selected.add(i)
          break
        }
      }
    })

    if (!selected.isEmpty()) return selected.imap((i) => _itemsArray[i].id)
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
    // move: onMove2,
    moveend: onMoveEnd,
    // zoomstart: loggit,
    // zoom: loggit,
    zoom: _onZoom,
    // zoomend: loggit,
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

function onMove2(e) {
  if (!ViewBox.zoom) return
  const level = vParams.baselayer._level
  const layerTransform = level.el.style.transform
  const canvasTransform = _dotCanvases[0].style.transform
  console.log(`layer: ${layerTransform}\ncanvas: ${canvasTransform}`)
}

const num = /(-?\d+\.?\d*)/.source
const re = new RegExp(
  `translate3d\\(${num}px, ${num}px, ${num}px\\) scale\\(${num}\\)`
)
// const transformregexp = /translate3d\((-?\d+\.?\d*)px, (-?\d+\.?\d*)px, (-?\d+\.?\d*)px\) scale\((-?\d+\.?\d*)\)/
function getTransformFromString(str) {
  const result = str.match(re)
  if (!result) return
  const offset = result.slice(1, 3).map(Number)
  const scale = Number(result[4])
  return { offset, scale }
}

function _onZoom(e) {
  if (!_map || !ViewBox.zoom) return

  if (e.pinch || e.flyTo) {
    const newZoom = _map.getZoom()
    const newCenter = _map.getCenter()
    const origin = _map.getBounds().getNorthWest()
    const offset = _map._latLngToNewLayerPoint(origin, newZoom, newCenter)
    const scale = _map.getZoomScale(newZoom)

    ViewBox.setCSStransform(offset, scale)
    // const level = vParams.baselayer._level
    // const layerTransformString = level.el.style.transform
    // const transform = getTransformFromString(layerTransformString)
    // if (!transform) return
    // ViewBox.setPinchTransform(transform)
  }
}

/*
 * This gets called continuously as the user pans or zooms
 */
function onMove(event) {
  _dotRect = DrawBox.defaultRect()

  // prevent redrawing more often than necessary
  const ts = Date.now()

  if (ts - _lastRedraw < MIN_REDRAW_DELAY) return

  _lastRedraw = ts
  redraw(event)
}

/*
 * This gets called after a pan or zoom is done.
 * Leaflet moves the pixel origin so we need to reset the CSS transform
 */
function onMoveEnd(event) {
  ViewBox.calibrate()

  console.log(`calibrated`)
  const layerTransform = vParams.baselayer._level.el.style.transform
  const canvasTransform = _dotCanvases[0].style.transform
  console.log(`layer: ${layerTransform}, canvas: ${canvasTransform}`)

  redraw(event)
}

function debugCtxReset() {
  if (!_options.debug) return

  const ctx = _debugCanvas.getContext("2d")
  ctx.strokeStyle = "rgb(0,255,0,1)"
  ctx.lineWidth = 10
  ctx.setLineDash([10, 5])
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
  ViewBox.resize(resizeEvent.newSize.x, resizeEvent.newSize.y)

  viewReset()
  redraw(true)
}

function viewReset() {
  console.log("viewReset")
  dotCtxReset()
  debugCtxReset()
}

function redraw(event) {
  if (!_ready) return

  const timerLabel = `redraw_${_redrawCounter++}`
  console.time(timerLabel)

  DrawBox.reset()
  DrawBox.clear(_dotCanvases[1].getContext("2d"))
  DrawBox.clear(_dotCanvases[0].getContext("2d"))

  if (event) {
    _drawingDots = false
    _dotRect = DrawBox.defaultRect()
    ViewBox.update()
  }

  const inView = ViewBox.inView(),
    oldzoom = ViewBox.zoom

  const itemsArray = _itemsArray,
    zoom = ViewBox.zoom

  // const promises = []

  let timeSimp = 0
  let timeSeg = 0
  let tpaths,
    timePaths,
    tdots,
    timeDots = 0

  inView.forEach((i) => {
    const A = itemsArray[i]

    const t0 = Date.now()
    A.simplify(zoom)
    const tsimp = Date.now()
    timeSimp += tsimp - t0

    A.makeSegMask()
    const tseg = Date.now()
    timeSeg += tseg - tsimp

    if (A.segMask.isEmpty()) {
      ViewBox.remove(itemsArray.indexOf(A))
    }
    // promises.push(A.simplify(zoom).then((A) => A.makeSegMask()))
  })

  // Promise.all(promises).then((fulfilled) => {
  _drawingDots = true

  // for (const A of fulfilled) {
  //   if (A.segMask.isEmpty()) {
  //     ViewBox.remove(itemsArray.indexOf(A))
  //   }
  // }

  // the whole viewable area
  const viewPort = DrawBox.defaultRect()

  if (_options.debug) {
    DrawBox.clear(_debugCanvas.getContext("2d"), viewPort)
  }

  if (_options.showPaths) {
    const t1 = Date.now()
    drawPaths()
    tpaths = Date.now()
    timePaths = tpaths - t1
  } else {
    _lineCanvases[0].style.display = "none"
  }

  if (oldzoom != zoom) {
    updateDotSettings()
  } else if (_paused) {
    drawDots()
    tdots = Date.now()
    timeDots = tdots - tpaths
  }

  const tot = timeDots + timeSimp + timeSeg + timePaths
  console.log(
    `simplify: ${timeSimp}\nmask: ${timeSeg}\npaths: ${timePaths}\ndots: ${timeDots}\ntot: ${tot}`
  )
  console.timeEnd(timerLabel)

  if (_options.debug) {
    const dctx = _debugCanvas.getContext("2d")
    debugCtxReset()
    DrawBox.draw(dctx)
    dctx.strokeStyle = "rgb(255,0,255,1)"
    ViewBox.drawPxBounds(dctx)
  }
  // })
}

/*
 * Functions for drawing Paths
 */
function drawPathsByColor(ctx, colorGroups, defaultColor) {
  for (const color in colorGroups) {
    const group = colorGroups[color]
    ctx.strokeStyle = color || defaultColor
    ctx.beginPath()
    group.forEach((i) => _itemsArray[i].drawPathFromPointArray(ctx))
    ctx.stroke()
  }
}

// Draw all paths for the current items in such a way
// that we group stroke-styles together in batch calls.
function drawPaths() {
  if (!_ready) return

  const options = _options,
    vb = ViewBox

  const cg = vb.pathColorGroups(),
    selected = cg.selected,
    unselected = cg.unselected

  const alphaScale = _dotSettings.alphaScale

  const ctx = _lineCanvases[1].getContext("2d")

  if (selected) {
    ctx.lineWidth = options.unselected.pathWidth
    ctx.globalAlpha = options.unselected.pathOpacity * alphaScale
    drawPathsByColor(ctx, unselected, options.unselected.pathColor)

    // draw selected paths
    ctx.lineWidth = options.selected.pathWidth
    ctx.globalAlpha = options.selected.pathOpacity * alphaScale
    drawPathsByColor(ctx, selected, options.selected.pathColor)
  } else if (unselected) {
    // draw unselected paths
    ctx.lineWidth = options.normal.pathWidth
    ctx.globalAlpha = options.normal.pathOpacity * alphaScale
    drawPathsByColor(ctx, unselected, options.normal.pathColor)
  }

  // swap line canvases
  const temp = _lineCanvases[0]
  _lineCanvases[0] = _lineCanvases[1]
  _lineCanvases[1] = temp

  _lineCanvases[0].style.display = ""
  temp.style.display = "none"
  DrawBox.clear(temp.getContext("2d"), DrawBox.defaultRect())
}

/*
 * Functions for Drawing Dots
 */
function makeCircleDrawFunc(ctx) {
  const size = _dotSettings._dotSize
  const transformDraw = ViewBox.makeTransform(function (x, y) {
    ctx.arc(x, y, size, 0, TWO_PI)
    ctx.closePath()
  })
  return transformDraw
}

function makeSquareDrawFunc(ctx) {
  const size = _dotSettings._dotSize
  const dotOffset = size / 2.0
  const transformDraw = ViewBox.makeTransform(function (x, y) {
    ctx.rect(x - dotOffset, y - dotOffset, size, size)
  })
  return transformDraw
}

function drawDotsByColor(now, colorGroups, ctx, drawDot) {
  let count = 0

  for (const color in colorGroups) {
    const group = colorGroups[color]
    ctx.fillStyle = color || _options.normal.dotColor
    ctx.beginPath()

    group.forEach((i) => {
      const A = _itemsArray[i]
      // const dotLocs = A.dotPointsIterFromSegs(now);
      A.dotPointsFromArray(now, _dotSettings, drawDot)
    })

    ctx.fill()
  }
  return count
}

function drawDots(now) {
  if (!_ready) return

  if (!now) now = _timePaused || Date.now()

  // We write to the currently hidden canvas
  const ctx = _dotCanvases[1].getContext("2d")

  const cg = ViewBox.dotColorGroups()

  const selected = _gifPatch ? null : cg.selected
  const unselected = _gifPatch
    ? { ...cg.selected, ...cg.unselected }
    : cg.unselected

  const alphaScale = _dotSettings.alphaScale

  // Clear the area to draw on if it hasn't already been cleared
  DrawBox.clear(ctx, _dotRect)
  _dotRect = undefined

  let count = 0

  if (selected) {
    // draw normal activity dots
    const drawSquare = makeSquareDrawFunc(ctx)
    ctx.globalAlpha = _options.unselected.dotOpacity * alphaScale
    count += drawDotsByColor(now, unselected, ctx, drawSquare)

    // draw selected activity dots
    const drawCircle = makeCircleDrawFunc(ctx)
    ctx.globalAlpha = _options.selected.dotOpacity * alphaScale
    count += drawDotsByColor(now, selected, ctx, drawCircle)
  } else if (unselected) {
    // draw normal activity dots
    const drawSquare = makeSquareDrawFunc(ctx)
    ctx.globalAlpha = _options.normal.dotOpacity * alphaScale
    count += drawDotsByColor(now, unselected, ctx, drawSquare)
  }

  // swap canvases
  const temp = _dotCanvases[0]
  temp.style.display = "none"
  _dotCanvases[1].style.display = ""

  _dotCanvases[0] = _dotCanvases[1]
  _dotCanvases[1] = temp

  return count
}

/*
 * Dot colors and settings
 *
 */
function setDotColors() {
  let numItems = _itemsArray.length,
    i = 0

  _colorPalette = ColorPalette.makePalette(numItems)
  for (const item of _itemsArray) item.dotColor = _colorPalette[i++]
}

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

    // const t0 = Date.now()

    drawDots(now)

    // if (fps_display) {
    //   const elapsed = (Date.now() - t0).toFixed(0)
    //   fps_display.update(
    //     now,
    //     `z=${ViewBox.zoom}, dt=${elapsed} ms, n=${count}`
    //   )
    // }
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
