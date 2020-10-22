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

export const DotLayer = Layer.extend({
  _pane: "shadowPane",
  two_pi: 2 * Math.PI,
  target_fps: 25,
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
    let size = map.getSize(),
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
    panes[this._pane]["style"]["pointerEvents"] = "none"
    appendChild(this._pane)(this._dotCanvas)
    canvases.push(this._dotCanvas)

    // create Canvas for polyline-ish things
    this._lineCanvas = create("canvas", "leaflet-layer")
    this._lineCanvas.width = size.x
    this._lineCanvas.height = size.y
    this._lineCtx = this._lineCanvas.getContext("2d")
    this._lineCtx.lineCap = "round"
    this._lineCtx.lineJoin = "round"
    addClass(
      this._lineCanvas,
      "leaflet-zoom-" + (zoomAnimated ? "animated" : "hide")
    )
    appendChild("overlayPane")(this._lineCanvas)
    canvases.push(this._lineCanvas)

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
      // move: this.onMove,
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

    this._redraw(true)
  },

  viewReset: function () {
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
    const ts = performance.now(),
      lr = om.lastRedraw || 0

    if (ts - lr < 1000) return

    om.lastRedraw = ts
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

    const promises = []

    inView.forEach((i) => {
      const A = itemsArray[i]
      promises.push(A.simplify(zoom).then((A) => A.makeSegMask()))
    })

    Promise.all(promises).then((fulfilled) => {
      this._drawingDots = true

      for (const A of fulfilled) {
        if (A.segMask.isEmpty()) {
          ViewBox.remove(itemsArray.indexOf(A))
        }
      }

      // the whole viewable area
      const viewPort = DrawBox.defaultRect()

      if (this.options.debug) {
        DrawBox.clear(this._debugCtx, viewPort)
      }

      if (this.options.showPaths) {
        this.drawPaths()
      } else {
        DrawBox.clear(this._lineCtx, viewPort)
      }

      if (oldzoom != zoom) {
        this.updateDotSettings()
      } else if (this._paused) {
        this.drawDots()
      }

      console.timeEnd(timerLabel)
      // if (ns)
      //     console.log(`simplify: ${ns} -> ${ns2} in ${~~(t1-t0)}:  ${(ns-ns2)/(t1-t0)}`)
    })
  },

  _drawPathsByColor: function (colorGroups, defaultColor) {
    const ctx = this._lineCtx,
      items = this._itemsArray

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

    const ctx = this._lineCtx,
      options = this.options,
      vb = ViewBox

    const cg = vb.pathColorGroups(),
      selected = cg.selected,
      unselected = cg.unselected

    const alphaScale = this.dotSettings.alphaScale

    DrawBox.clear(ctx, DrawBox.defaultRect())

    if (selected) {
      ctx.lineWidth = options.unselected.pathWidth
      ctx.globalAlpha = options.unselected.pathOpacity * alphaScale
      this._drawPathsByColor(unselected, options.unselected.pathColor)

      // draw selected paths
      ctx.lineWidth = options.selected.pathWidth
      ctx.globalAlpha = options.selected.pathOpacity * alphaScale
      this._drawPathsByColor(selected, options.selected.pathColor)
    } else if (unselected) {
      // draw unselected paths
      ctx.lineWidth = options.normal.pathWidth
      ctx.globalAlpha = options.normal.pathOpacity * alphaScale
      this._drawPathsByColor(unselected, options.normal.pathColor)
    }

    if (options.debug) {
      this._debugCtxReset()
      DrawBox.draw(this._debugCtx)
      this._debugCtx.strokeStyle = "rgb(255,0,255,1)"
      ViewBox.drawPxBounds(this._debugCtx)
    }
  },

  // --------------------------------------------------------------------

  makeCircleDrawFunc: function () {
    const two_pi = this.two_pi,
      ctx = this._dotCtx,
      dotSize = this.dotSettings._dotSize,
      transformDraw = ViewBox.makeTransform(function(x,y){
          ctx.arc(x, y, dotSize, 0, two_pi)
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
    this.minDelay = ~~(1000 / this.target_fps + 0.5)
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
      len,
      alpha
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
  },

  /*
    badSegTimes: function(llt, ttol) {
        const n = llt.length / 3,
              time = i => llt[3*i+2],
              arr = [];

        let max = 0;

        for (let i=1, tprev=time(0); i<n; i++) {
            let t = time(i),
                dt = t - tprev;

            if (dt > ttol)
                arr.push(tprev);

            if (dt > max)
                max = dt;

            tprev = t;
        }
        arr.sort((a,b) => a-b);
        return arr.length? arr : null
    },

    binarySearch: function(map, x, start, end) {
        if (start > end) return false;

        let mid = Math.floor((start + end) / 2);

        if (map(mid) === x) return mid;

        if(map(mid) > x)
            return binarySearch(map, x, start, mid-1);
        else
            return binarySearch(map, x, mid+1, end);
    }
    */
  // end of DotLayer definition
})

export const dotLayer = function (options) {
  return new DotLayer(options)
}
