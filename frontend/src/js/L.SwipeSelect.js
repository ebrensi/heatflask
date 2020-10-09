/*
 * swipeselect
 *
 */

import * as L from "leaflet"

function touchHandler(event) {
  // Add touch support by converting touch events to mouse events
  // Source: http://stackoverflow.com/a/6362527/725573

  const touches = event.changedTouches,
    first = touches[0]
  let type = ""

  switch (event.type) {
    case "touchstart":
      type = "mousedown"
      break
    case "touchmove":
      type = "mousemove"
      break
    case "touchend":
      type = "mouseup"
      break
    default:
      return
  }

  //Convert the touch event into it's corresponding mouse event
  const simulatedEvent = document.createEvent("MouseEvent")
  simulatedEvent.initMouseEvent(
    type,
    true,
    true,
    window,
    1,
    first.screenX,
    first.screenY,
    first.clientX,
    first.clientY,
    false,
    false,
    false,
    false,
    0 /*left*/,
    null
  )

  first.target.dispatchEvent(simulatedEvent)
  event.preventDefault()
}

// // make touch events simulate mouse events via _touchHandler
// document.addEventListener("touchstart", touchHandler, true);
// document.addEventListener("touchmove", touchHandler, true);
// document.addEventListener("touchend", touchHandler, true);
// document.addEventListener("touchcancel", touchHandler, true);

export const SwipeSelect = L.Class.extend({
  includes: L.Evented.prototype,

  options: {},

  initialize: function (options, doneSelecting, whileSelecting) {
    L.Util.setOptions(this, options)
    this.onmousemove = whileSelecting
    this.onmouseup = doneSelecting
  },

  addTo: function (map) {
    this.map = map

    const size = map.getSize()

    this.drag = false

    this.canvas = L.DomUtil.create("canvas", "leaflet-layer")
    const canvas = this.canvas
    map._panes.markerPane.appendChild(canvas)

    canvas.width = size.x
    canvas.height = size.y

    this.ctx = canvas.getContext("2d")
    this.ctx.globalAlpha = 0.3
    this.ctx.fillStyle = "red"

    this.map.dragging.disable()

    canvas.onmousedown = function (event) {
      this.mapManipulation(false)

      const topLeft = this.map.containerPointToLayerPoint([0, 0])
      L.DomUtil.setPosition(this.canvas, topLeft)

      this.mapPanePos = this.map._getMapPanePos()

      this.rect = { corner: new L.Point(event.pageX, event.pageY) }
      this.dragging = true
    }.bind(this)

    canvas.onmousemove = function (event) {
      if (this.dragging) {
        const r = this.rect,
          currentPoint = new L.Point(event.pageX, event.pageY)

        r.size = currentPoint.subtract(r.corner)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
        this.ctx.fillRect(r.corner.x, r.corner.y, r.size.x, r.size.y)

        this.onmousemove && this.onmousemove(this.getBounds())
      }
    }.bind(this)

    canvas.onmouseup = function () {
      this.dragging = false
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height)
      this.mapManipulation(true)

      this.onmouseup & this.onmouseup(this.getBounds())
    }.bind(this)

    //   // make touch events simulate mouse events via touchHandler
    //   canvas.addEventListener("touchstart", touchHandler, true);
    //   canvas.addEventListener("touchmove", touchHandler, true);
    //   canvas.addEventListener("touchend", touchHandler, true);
    //   canvas.addEventListener("touchcancel", touchHandler, true);
  },

  getBounds: function () {
    const r = this.rect,
      corner1 = r.corner,
      corner2 = r.corner.add(r.size),
      pxBounds = new L.Bounds(corner1, corner2),
      ll1 = this.map.containerPointToLatLng(corner1),
      ll2 = this.map.containerPointToLatLng(corner2),
      llBounds = new L.LatLngBounds(ll1, ll2)

    return { pxBounds: pxBounds, latLngBounds: llBounds }
  },

  remove: function () {
    if (!this.canvas) {
      return
    }
    this.map._panes.markerPane.removeChild(this.canvas)
    this.canvas = null
  },

  // enable or disable pan/zoom
  mapManipulation: function (state = false) {
    const map = this.map
    if (state) {
      map.dragging.enable()
      map.touchZoom.enable()
      map.doubleClickZoom.enable()
      map.scrollWheelZoom.enable()
    } else {
      map.dragging.disable()
      map.touchZoom.disable()
      map.doubleClickZoom.disable()
      map.scrollWheelZoom.disable()
    }
  },
})

export function swipeselect(...args) {
  return new SwipeSelect(...args)
}
