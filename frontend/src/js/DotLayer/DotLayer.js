/*
  DotLayer Efrem Rensi, 2020,
*/

import { Layer, Util, DomUtil, Browser, setOptions } from "leaflet"

import * as ViewBox from "./ViewBox.js"
import * as DrawBox from "./DrawBox.js"
import * as ColorPalette from "./ColorPalette.js"
// import * as WorkerPool from "./WorkerPool.js"

import BitSet from "../BitSet.js"
import defaultOptions from "./options.js"

import { items as _items } from "../Model.js"

/* In order to prevent path redraws from happening too often
 * and hogging up CPU cycles we set a minimum delay between redraws
 */
const MIN_REDRAW_DELAY = 100 // milliseconds
const TWO_PI = 2 * Math.PI
const TARGET_FPS = 25

const _lineCanvases = []
const _dotCanvases = []

let _map, _options, _itemsArray, _itemIds, _colorPalette
let _timePaused, _ready, _paused
let _drawingDots
let _gifPatch

let _dotCanvas
let _dotCtx
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

  // -- initialized is called on prototype
  initialize: function (options) {
    setOptions(this, options)
    _options = this.options
    _paused = _options.startPaused
    _timePaused = UTCnowSecs()
    // WorkerPool.initialize(_options.numWorkers)
  },

  //-------------------------------------------------------------
  onAdd: function (map) {
    _map = map
    ViewBox.canvases.length = 0

    // dotlayer canvas
    _dotCanvas = addCanvasOverlay("shadowPane")
    _dotCtx = _dotCanvas.getContext("2d")

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
    map._panes.shadowPane.removeChild(_dotCanvas)
    _dotCanvas = null

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
    if (_timePaused) {
      _timeOffset = UTCnowSecs() - _timePaused
      _timePaused = null
    }
    _lastCalledTime = 0
    _minDelay = ~~(1000 / TARGET_FPS + 0.5)
    _frame = Util.requestAnimFrame(_animate, this)
  },

  // --------------------------------------------------------------------
  pause: function () {
    _paused = true
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

function UTCnowSecs() {
  return performance.timing.navigationStart + performance.now()
}

function assignEventHandlers() {
  const loggit = (handler) => (e) => {
    console.log(e)
    handler && handler(e)
  }

  const events = {
    // movestart: loggit,
    // move: onMove,
    moveend: redraw,
    // zoomstart: loggit,
    // zoom: loggit,
    // zoomend: loggit,
    // viewreset: loggit,
    resize: onResize,
  }

  if ( _map.options.zoomAnimation && Browser.any3d ) {
      events.zoomanim =  animateZoom;
  }

  return events
}

function debugCtxReset() {
  if (!_options.debug) return

  const ctx = _debugCanvas.getContext("2d")
  ctx.strokeStyle = "rgb(0,255,0,1)"
  ctx.lineWidth = 10
  ctx.setLineDash([10, 5])
}

function dotCtxReset() {
  const ctx = _dotCtx
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

function onMove(event) {
  _dotRect = DrawBox.defaultRect()

  // prevent redrawing more often than necessary
  const ts = performance.now()

  if (ts - _lastRedraw < MIN_REDRAW_DELAY) return

  _lastRedraw = ts
  redraw(event)
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

  DrawBox.clear(_dotCtx)

  DrawBox.reset()

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

  inView.forEach((i) => {
    const A = itemsArray[i]
    A.simplify(zoom)
    A.makeSegMask()
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
    drawPaths()
  } else {
    _lineCanvases[0].style.display = "none"
  }

  if (oldzoom != zoom) {
    updateDotSettings()
  } else if (_paused) {
    drawDots()
  }

  console.timeEnd(timerLabel)

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

  console.time("drawPaths")
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

  if (options.debug) {
    const dctx = _debugCanvas.getContext("2d")
    debugCtxReset()
    DrawBox.draw(dctx)
    dctx.strokeStyle = "rgb(255,0,255,1)"
    ViewBox.drawPxBounds(dctx)
  }

  // swap line canvases
  const temp = _lineCanvases[0]
  _lineCanvases[0] = _lineCanvases[1]
  _lineCanvases[1] = temp

  _lineCanvases[0].style.display = ""
  temp.style.display = "none"
  DrawBox.clear(temp.getContext("2d"), DrawBox.defaultRect())

  console.timeEnd("drawPaths")
}

/*
 * Functions for Drawing Dots
 */
function makeCircleDrawFunc() {
  const ctx = _dotCtx,
    dotSize = _dotSettings._dotSize,
    transformDraw = ViewBox.makeTransform(function (x, y) {
      ctx.arc(x, y, dotSize, 0, TWO_PI)
      ctx.closePath()
    })

  return transformDraw
}

function makeSquareDrawFunc() {
  const ctx = _dotCtx,
    dotSize = _dotSettings._dotSize,
    dotOffset = dotSize / 2.0,
    transformDraw = ViewBox.makeTransform(function (x, y) {
      ctx.rect(x - dotOffset, y - dotOffset, dotSize, dotSize)
    })

  return transformDraw
}

function _drawDots(pointsIterator, drawDotFunc) {
  let count = 0
  for (const p of pointsIterator) {
    drawDotFunc(p)
    count++
  }
  return count
}

function drawDotsByColor(now, colorGroups, drawDot) {
  const ctx = _dotCtx
  let count = 0

  for (const color in colorGroups) {
    const group = colorGroups[color]
    ctx.fillStyle = color || _options.normal.dotColor
    ctx.beginPath()

    group.forEach((i) => {
      const A = _itemsArray[i]
      // const dotLocs = A.dotPointsIterFromSegs(now);
      const dotLocs = A.dotPointsIterFromArray(now, getDotSettings())
      count += _drawDots(dotLocs, drawDot)
    })

    ctx.fill()
  }
  return count
}

function drawDots(now) {
  if (!_ready) return

  if (!now) now = _timePaused || UTCnowSecs()

  const options = _options,
    ctx = _dotCtx,
    vb = ViewBox

  const colorGroups = vb.dotColorGroups()

  let unselected = colorGroups.unselected,
    selected = colorGroups.selected

  DrawBox.clear(ctx, _dotRect)
  if (_dotRect) _dotRect = undefined

  let count = 0

  if (_gifPatch) {
    unselected = { ...selected, ...unselected }
    selected = null
  }

  const alphaScale = _dotSettings.alphaScale

  if (selected) {
    // draw normal activity dots
    ctx.globalAlpha = options.unselected.dotOpacity * alphaScale
    let drawDotFunc = makeSquareDrawFunc()
    count += drawDotsByColor(
      now,
      unselected,
      drawDotFunc,
      options.unselected.dotColor
    )

    // draw selected activity dots
    drawDotFunc = makeCircleDrawFunc()
    ctx.globalAlpha = options.selected.dotOpacity * alphaScale
    count += drawDotsByColor(
      now,
      selected,
      drawDotFunc,
      options.selected.dotColor
    )
  } else if (unselected) {
    // draw normal activity dots
    ctx.globalAlpha = options.normal.dotOpacity * alphaScale
    let drawDotFunc = makeSquareDrawFunc()
    count += drawDotsByColor(
      now,
      unselected,
      drawDotFunc,
      options.normal.dotColor
    )
  }

  return count
}



/*
 * Dot colors and settings
 *
 */
function setDotColors() {
    let numItems = _itemsArray.length,
      i = 0

    _colorPalette = ColorPalette.makePalette(numItems, _options.dotAlpha)
    for (const item of _itemsArray) item.dotColor = _colorPalette[i++]
  }

const _dotSettings = {
    C1: 1000000.0,
    C2: 200.0,
    dotScale: 1.0,
    alphaScale: 0.9,
  }

function  getDotSettings() {
  return _dotSettings
}

function periodInSecs() {
  const ds = getDotSettings()
  return ds._period / (ds._timeScale * 1000)
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
function _animate() {
  if (!_frame || !_ready || !_drawingDots) return

  _frame = null

  let ts = UTCnowSecs(),
    now = ts - _timeOffset

  if (_paused || _capturing) {
    // Ths is so we can start where we left off when we resume
    _timePaused = ts
    return
  }

  if (now - _lastCalledTime > _minDelay) {
    _lastCalledTime = now

    const t0 = performance.now()

    const count = drawDots(now)

    if (fps_display) {
      const elapsed = (performance.now() - t0).toFixed(0)
      fps_display.update(
        now,
        `z=${ViewBox.zoom}, dt=${elapsed} ms, n=${count}`
      )
    }
  }

  _frame = Util.requestAnimFrame(_animate, this)
}

function animateZoom(e) {
  const z = e.zoom,
    scale = _map.getZoomScale(z)

  // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1
  const offset = Layer
    ? _map._latLngToNewLayerPoint(
        _map.getBounds().getNorthWest(),
        z,
        e.center
      )
    : _map
        ._getCenterOffset(e.center)
        ._multiplyBy(-scale)
        .subtract(_map._getMapPanePos())

  const setTransform = DomUtil.setTransform
  setTransform(_dotCanvas, offset, scale)
  setTransform(_lineCanvases[0], offset, scale)
}
