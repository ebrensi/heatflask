/*
  DotLayer Efrem Rensi, 2020,
*/

import { Layer, Util, DomUtil, Browser, setOptions } from "leaflet"

import * as ViewBox from "./ViewBox.js"
import * as DrawBox from "./DrawBox.js"
// import * as WorkerPool from "./WorkerPool.js"

import BitSet from "../BitSet.js"
import options from "./options.js"

import { items } from "../Model.js"

/* In order to prevent path redraws from happening too often
 * and hogging up CPU cycles we set a minimum delay between redraws
 */
const MIN_REDRAW_DELAY = 100 // milliseconds
let _lastRedraw = 0

const TWO_PI = 2 * Math.PI
const TARGET_FPS = 25

export const DotLayer = Layer.extend({
  options: options,

  // -- initialized is called on prototype
  initialize: function (options) {
    this._timeOffset = 0
    setOptions(this, options)
    this._paused = this.options.startPaused
    this._timePaused = this.UTCnowSecs()
    this._items = items

    this._redrawCounter = 0
    // WorkerPool.initialize(this.options.numWorkers)
  },

  UTCnowSecs: function () {
    return performance.timing.navigationStart + performance.now()
  },

  //-------------------------------------------------------------
  onAdd: function (map) {
    this._map = map
    const size = map.getSize(),
      zoomAnimated = map.options.zoomAnimation && Browser.any3d

    const create = DomUtil.create,
      addClass = DomUtil.addClass,
      panes = map._panes,
      appendChild = (pane) => (obj) => panes[pane].appendChild(obj),
      canvases = []

    // dotlayer canvas
    this._dotCanvas = create("canvas", "leaflet-layer")
    this._dotCanvas.width = size.x
    this._dotCanvas.height = size.y
    this._dotCtx = this._dotCanvas.getContext("2d")
    addClass(
      this._dotCanvas,
      "leaflet-zoom-" + (zoomAnimated ? "animated" : "hide")
    )
    panes["shadowPane"]["style"]["pointerEvents"] = "none"
    appendChild("shadowPane")(this._dotCanvas)
    canvases.push(this._dotCanvas)

    /*
     * The Line Canvas is for activity paths, which are made up of a bunch of
     * segments.  We make two of them, the second of which is hidden using
     * style { display: none }.
     * when drawing paths, we draw to the hidden canvas and swap the references
     * so that the hidden one becomes visible and the previously visible one
     * gets hidden. That way, the user experiences no flicker due to the canvas being
     * cleared and then drawn to.
     */
    this._lineCanvas = createLineCanvas(map)
    appendChild("overlayPane")(this._lineCanvas)
    canvases.push(this._lineCanvas)

    this._lineCanvas2 = createLineCanvas(map)
    appendChild("overlayPane")(this._lineCanvas2)
    canvases.push(this._lineCanvas2)
    this._lineCanvas2.style.display = "none"

    if (this.options.debug) {
      // create Canvas for debugging canvas stuff
      this._debugCanvas = create("canvas", "leaflet-layer")
      this._debugCanvas.width = size.x
      this._debugCanvas.height = size.y
      this._debugCtx = this._debugCanvas.getContext("2d")
      addClass(
        this._debugCanvas,
        "leaflet-zoom-" + (zoomAnimated ? "animated" : "hide")
      )
      appendChild("overlayPane")(this._debugCanvas)
      canvases.push(this._debugCanvas)
    }

    // if (this.options.fps_display)
    //    this.fps_display = L.control.fps().addTo(this._map);

    ViewBox.initialize(this._map, canvases)
    map.on(this.getEvents(), this)
  },

  getEvents: function () {
    const loggit = (handler) => (e) => {
      console.log(e)
      handler && handler(e)
    }

    const events = {
      // movestart: loggit,
      move: this.onMove,
      moveend: this._redraw,
      // zoomstart: loggit,
      // zoom: loggit,
      // zoomend: loggit,
      // viewreset: loggit,
      resize: this._onLayerResize,
    }

    // if ( this._map.options.zoomAnimation && Browser.any3d ) {
    //     events.zoomanim =  this._animateZoom;
    // }

    return events
  },

  addTo: function (map) {
    map.addLayer(this)
    return this
  },

  //-------------------------------------------------------------
  onRemove: function (map) {
    map._panes.shadowPane.removeChild(this._dotCanvas)
    this._dotCanvas = null

    map._panes.overlayPane.removeChild(this._lineCanvas)
    this._lineCanvas = null

    if (this.options.debug) {
      map._panes.overlayPane.removeChild(this._debugCanvas)
      this._debugCanvas = null
    }

    map.off(this.getEvents(), this)
  },

  // --------------------------------------------------------------------

  // Call this function after items are added or reomved
  reset: function () {
    if (!this._items.size) return

    this._ready = false

    this._itemsArray = Array.from(this._items.values())
    this._itemIds = Array.from(this._items.keys())
    const n = this._itemsArray.length

    if (!n) return

    this.setDotColors()
    ViewBox.reset(this._itemsArray)
    this._ready = true
    this._redraw(true)

    if (!this._paused) this.animate()
  },

  //-------------------------------------------------------------
  _onLayerResize: function (resizeEvent) {
    const newWidth = resizeEvent.newSize.x,
      newHeight = resizeEvent.newSize.y,
      options = this.options

    for (const canvas of [this._dotCanvas, this._lineCanvas]) {
      canvas.width = newWidth
      canvas.height = newHeight
    }

    this.viewReset()
    this._redraw(true)
  },

  viewReset: function () {
    console.log("viewReset")
    this._dotCtxReset()
    this._debugCtxReset()
  },

  //-------------------------------------------------------------

  // -------------------------------------------------------------------
  _debugCtxReset: function () {
    if (!this.options.debug) return
    this._debugCtx.strokeStyle = "rgb(0,255,0,1)"
    this._debugCtx.lineWidth = 10
    this._debugCtx.setLineDash([10, 5])
  },

  _dotCtxReset: function () {
    const ctx = this._dotCtx
    if (this.options.dotShadows.enabled) {
      const shadowOpts = this.options.dotShadows,
        sx = (ctx.shadowOffsetX = shadowOpts.x),
        sy = (ctx.shadowOffsetY = shadowOpts.y)
      ctx.shadowBlur = shadowOpts.blur
      ctx.shadowColor = shadowOpts.color
    } else {
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0
      ctx.shadowBlur = 0
    }
  },

  onMove: function om(event) {
    this._dotRect = DrawBox.defaultRect()

    // prevent redrawing more often than necessary
    const ts = performance.now()

    if (ts - _lastRedraw < MIN_REDRAW_DELAY) return

    _lastRedraw = ts
    this._redraw(event)
  },

  _redraw: function (event) {
    if (!this._ready) return

    const timerLabel = `redraw_${this._redrawCounter++}`
    console.time(timerLabel)

    DrawBox.clear(this._dotCtx)

    DrawBox.reset()

    if (event) {
      this._drawingDots = false
      this._dotRect = DrawBox.defaultRect()
      ViewBox.update()
    }

    const inView = ViewBox.inView(),
      oldzoom = ViewBox.zoom

    const itemsArray = this._itemsArray,
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
      this._drawingDots = true

      // for (const A of fulfilled) {
      //   if (A.segMask.isEmpty()) {
      //     ViewBox.remove(itemsArray.indexOf(A))
      //   }
      // }

      // the whole viewable area
      const viewPort = DrawBox.defaultRect()

      if (this.options.debug) {
        DrawBox.clear(this._debugCtx, viewPort)
      }

      if (this.options.showPaths) {
        this.drawPaths()
      } else {
        this._lineCanvas.style.display = "none"
      }

      if (oldzoom != zoom) {
        this.updateDotSettings()
      } else if (this._paused) {
        this.drawDots()
      }

      console.timeEnd(timerLabel)

    // })
  },

  _drawPathsByColor: function (ctx, colorGroups, defaultColor) {
    const items = this._itemsArray

    for (const color in colorGroups) {
      const group = colorGroups[color]
      ctx.strokeStyle = color || defaultColor
      ctx.beginPath()
      group.forEach((i) => items[i].drawPathFromPointArray(ctx))
      ctx.stroke()
    }
  },

  // Draw all paths for the current items in such a way
  // that we group stroke-styles together in batch calls.
  drawPaths: function () {
    if (!this._ready) return

    const options = this.options,
      vb = ViewBox

    const cg = vb.pathColorGroups(),
      selected = cg.selected,
      unselected = cg.unselected

    const alphaScale = this.dotSettings.alphaScale

    console.time("drawPaths")
    const ctx = this._lineCanvas2.getContext("2d")

    if (selected) {
      ctx.lineWidth = options.unselected.pathWidth
      ctx.globalAlpha = options.unselected.pathOpacity * alphaScale
      this._drawPathsByColor(ctx, unselected, options.unselected.pathColor)

      // draw selected paths
      ctx.lineWidth = options.selected.pathWidth
      ctx.globalAlpha = options.selected.pathOpacity * alphaScale
      this._drawPathsByColor(ctx, selected, options.selected.pathColor)
    } else if (unselected) {
      // draw unselected paths
      ctx.lineWidth = options.normal.pathWidth
      ctx.globalAlpha = options.normal.pathOpacity * alphaScale
      this._drawPathsByColor(ctx, unselected, options.normal.pathColor)
    }

    if (options.debug) {
      this._debugCtxReset()
      DrawBox.draw(this._debugCtx)
      this._debugCtx.strokeStyle = "rgb(255,0,255,1)"
      ViewBox.drawPxBounds(this._debugCtx)
    }

    // swap line canvases
    const temp = this._lineCanvas
    this._lineCanvas = this._lineCanvas2
    this._lineCanvas2 = temp

    this._lineCanvas.style.display = ""
    temp.style.display = "none"
    DrawBox.clear(temp.getContext("2d"), DrawBox.defaultRect())

    console.timeEnd("drawPaths")
  },

  // --------------------------------------------------------------------

  makeCircleDrawFunc: function () {
    const ctx = this._dotCtx,
      dotSize = this.dotSettings._dotSize,
      transformDraw = ViewBox.makeTransform(function(x,y){
          ctx.arc(x, y, dotSize, 0, TWO_PI)
          ctx.closePath()
      })

    return transformDraw
  },

  makeSquareDrawFunc: function () {
    const ctx = this._dotCtx,
      dotSize = this.dotSettings._dotSize,
      dotOffset = dotSize / 2.0,
      transformDraw = ViewBox.makeTransform(function(x,y){
        ctx.rect(x - dotOffset, y - dotOffset, dotSize, dotSize)
      })

    return transformDraw
  },

  _drawDots: function (pointsIterator, drawDotFunc) {
    let count = 0
    for (const p of pointsIterator) {
      drawDotFunc(p)
      count++
    }
    return count
  },

  _drawDotsByColor: function (now, colorGroups, drawDot) {
    const ctx = this._dotCtx,
      itemsArray = this._itemsArray

    let count = 0

    for (const color in colorGroups) {
      const group = colorGroups[color]
      ctx.fillStyle = color || this.options.normal.dotColor
      ctx.beginPath()

      group.forEach((i) => {
        const A = itemsArray[i]
        // const dotLocs = A.dotPointsIterFromSegs(now);
        const dotLocs = A.dotPointsIterFromArray(now, this.getDotSettings())
        count += this._drawDots(dotLocs, drawDot)
      })

      ctx.fill()
    }
    return count
  },

  drawDots: function (now) {
    if (!this._ready) return
    return

    if (!now) now = this._timePaused || this.UTCnowSecs()

    const options = this.options,
      ctx = this._dotCtx,
      vb = ViewBox

    const colorGroups = vb.dotColorGroups()

    let unselected = colorGroups.unselected,
      selected = colorGroups.selected

    DrawBox.clear(ctx, this._dotRect)
    if (this._dotRect) this._dotRect = undefined

    let count = 0

    if (this._gifPatch) {
      unselected = { ...selected, ...unselected }
      selected = null
    }

    const alphaScale = this.dotSettings.alphaScale

    if (selected) {
      // draw normal activity dots
      ctx.globalAlpha = options.unselected.dotOpacity * alphaScale
      let drawDotFunc = this.makeSquareDrawFunc()
      count += this._drawDotsByColor(
        now,
        unselected,
        drawDotFunc,
        options.unselected.dotColor
      )

      // draw selected activity dots
      drawDotFunc = this.makeCircleDrawFunc()
      ctx.globalAlpha = options.selected.dotOpacity * alphaScale
      count += this._drawDotsByColor(
        now,
        selected,
        drawDotFunc,
        options.selected.dotColor
      )
    } else if (unselected) {
      // draw normal activity dots
      ctx.globalAlpha = options.normal.dotOpacity * alphaScale
      let drawDotFunc = this.makeSquareDrawFunc()
      count += this._drawDotsByColor(
        now,
        unselected,
        drawDotFunc,
        options.normal.dotColor
      )
    }

    return count
  },

  // --------------------------------------------------------------------
  animate: function () {
    this._drawingDots = true
    this._paused = false
    if (this._timePaused) {
      this._timeOffset = this.UTCnowSecs() - this._timePaused
      this._timePaused = null
    }
    this.lastCalledTime = 0
    this.minDelay = ~~(1000 / TARGET_FPS + 0.5)
    this._frame = Util.requestAnimFrame(this._animate, this)
  },

  // --------------------------------------------------------------------
  pause: function () {
    this._paused = true
  },

  // --------------------------------------------------------------------
  _animate: function () {
    if (!this._frame || !this._ready || !this._drawingDots) return

    this._frame = null

    let ts = this.UTCnowSecs(),
      now = ts - this._timeOffset

    if (this._paused || this._capturing) {
      // Ths is so we can start where we left off when we resume
      this._timePaused = ts
      return
    }

    if (now - this.lastCalledTime > this.minDelay) {
      this.lastCalledTime = now

      const t0 = performance.now()

      const count = this.drawDots(now)

      if (this.fps_display) {
        const elapsed = (performance.now() - t0).toFixed(0)
        this.fps_display.update(
          now,
          `z=${ViewBox.zoom}, dt=${elapsed} ms, n=${count}`
        )
      }
    }

    this._frame = Util.requestAnimFrame(this._animate, this)
  },

  //------------------------------------------------------------------------------
  _animateZoom: function (e) {
    const m = ViewBox._map,
      z = e.zoom,
      scale = m.getZoomScale(z)

    // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1
    const offset = Layer
      ? m._latLngToNewLayerPoint(m.getBounds().getNorthWest(), z, e.center)
      : m
          ._getCenterOffset(e.center)
          ._multiplyBy(-scale)
          .subtract(m._getMapPanePos())

    const setTransform = DomUtil.setTransform
    setTransform(this._dotCanvas, offset, scale)
    setTransform(this._lineCanvas, offset, scale)
  },

  // -------------------------------------------------------------------
  setItemSelect: function (selections) {
    let idx = 0,
      redraw = false

    const itemIds = this._itemIds,
      arr = this._itemsArray,
      vb = ViewBox

    for (const [id, selected] of Object.entries(selections)) {
      idx = itemIds.indexOf(+id)
      const A = arr[idx]
      A.selected = selected
      redraw |= vb.updateSelect(idx)
    }

    if (redraw) this._redraw()
  },

  setSelectRegion: function (pxBounds, callback) {
    let selectedIds = this.itemsInRegion(pxBounds)
    callback(selectedIds)
  },

  itemsInRegion: function (selectPxBounds) {
    const pxOffset = ViewBox.pxOffset,
      zf = ViewBox._zf

    // un-transform screen coordinates given by the selection
    // plugin to absolute values that we can compare ours to.
    selectPxBounds.min._subtract(pxOffset)._divideBy(zf)
    selectPxBounds.max._subtract(pxOffset)._divideBy(zf)

    const itemsArray = this._itemsArray,
      inView = ViewBox.inView()

    let selected = new BitSet()

    inView.forEach((i) => {
      const A = itemsArray[i]
      for (const seg of this.iterSegments(A)) {
        if (selectPxBounds.contains(seg.a)) {
          selected.add(i)
          break
        }
      }
    })

    if (!selected.isEmpty()) return selected.imap((i) => itemsArray[i].id)
  },

  // -----------------------------------------------------------------------

  setDotColors: function () {
    let items = this._itemsArray,
      numItems = items.length,
      i = 0

    this._colorPalette = this.ColorPalette.palette(
      numItems,
      this.options.dotAlpha
    )
    for (const item of items) item.dotColor = this._colorPalette[i++]
  },

  dotSettings: {
    C1: 1000000.0,
    C2: 200.0,
    dotScale: 1.0,
    alphaScale: 0.9,
  },

  getDotSettings: function () {
    return this.dotSettings
  },

  periodInSecs: function () {
    const ds = this.getDotSettings()
    return ds._period / (ds._timeScale * 1000)
  },

  updateDotSettings: function (settings, shadowSettings) {
    const ds = this.dotSettings
    if (settings) Object.assign(ds, settings)

    const vb = ViewBox,
      zf = vb._zf,
      zoom = vb.zoom
    ds._timeScale = ds.C2 / zf
    ds._period = ds.C1 / zf
    ds._dotSize = Math.max(1, ~~(ds.dotScale * Math.log(zoom) + 0.5))

    if (shadowSettings) {
      Object.assign(this.options.dotShadows, shadowSettings)
    }

    this._dotCtxReset()

    if (this._paused) this.drawDots()

    return ds
  },

  ColorPalette: {
    /*
        From "Making annoying rainbows in javascript"
        A tutorial by jim bumgardner
        */
    makeColorGradient: function (
      frequency1,
      frequency2,
      frequency3,
      phase1,
      phase2,
      phase3,
      center,
      width,
      len
    ) {
      let palette = new Array(len)

      if (center == undefined) center = 128
      if (width == undefined) width = 127
      if (len == undefined) len = 50

      for (let i = 0; i < len; ++i) {
        let r = Math.round(
            Math.sin(frequency1 * i + phase1) * width + center
          ).toString(16),
          g = Math.round(
            Math.sin(frequency2 * i + phase2) * width + center
          ).toString(16),
          b = Math.round(
            Math.sin(frequency3 * i + phase3) * width + center
          ).toString(16)

        palette[i] = `#${r}${g}${b}`
      }
      return palette
    },

    palette: function (n, alpha) {
      const center = 128,
        width = 127,
        steps = 10,
        frequency = (2 * Math.PI) / steps
      return this.makeColorGradient(
        frequency,
        frequency,
        frequency,
        0,
        2,
        4,
        center,
        width,
        n,
        alpha
      )
    },
  }
})

export const dotLayer = function (options) {
  return new DotLayer(options)
}


/* Auxilliary functions */

function createLineCanvas(map) {
  // create Canvas for polyline-ish things
  const size = map.getSize()
  const zoomAnimated = map.options.zoomAnimation && Browser.any3d
  const canvas = DomUtil.create("canvas", "leaflet-layer")
  canvas.width = size.x
  canvas.height = size.y
  const ctx = canvas.getContext("2d")
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  DomUtil.addClass(
    canvas,
    "leaflet-zoom-" + (zoomAnimated ? "animated" : "hide")
  )
  return canvas
}
