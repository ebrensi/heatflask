/*
 *  ViewBox represents the the rectangular region visible to the user, on which
 *  we draw our visualization.
 *
 */

import { makePT } from "./CRS.js"
import { DomUtil, Control } from "../myLeaflet.js"
import { MAP_INFO } from "../Env.js"

const _canvases = []

const _pad = 2

// private module-scope variable
let _map, _baseTranslation

// exported module-scope variables
let _pxOrigin, _pxOffset, _mapPanePos, _zoom, _zf, _scale
const _transform = [1, 0, 1, 0]
let xmin, xmax, ymin, ymax
let _width, _height

const _boundsObj = new Float32Array(4)

export {
  _canvases as canvases,
  _pxOrigin as pxOrigin,
  _pxOffset as pxOffset,
  _transform as transform,
  _zoom as zoom,
  _zf as zf,
}

/**
 * Project a [lat, lng] point to [x,y] in absolute rectangular coordinates
 * at baseline scale (zoom=0).  From there we only need to scale and
 * shift points for a given zoom level and map position.
 *
 * This function operates in-place! It modifies whatever you pass into it.
 *
 * @type {function}
 */
export const latLng2px = makePT(0)

/*
 * Sets the Map object to be used.
 * TODO: Find a way to elimintate the need for this.  We do it this way
 * for now, to avoid the circular dependency if we import map from ../mapAPI.js
 */
export function setMap(map) {
  _map = map
  if (MAP_INFO) {
    new InfoViewer().addTo(map)
  }
}

// The dimensions of the ViewBox (also, the underlying canvases and the map)
// as a Leaflet Point object
export function getSize() {
  const size = _map.getSize()
  _width = size.x
  _height = size.y
  return size
}

// This function clips x and y points to visible region
export function clip(x, y) {
  if (x < 0) x = 0
  else if (x > _width) x = _width
  if (y < 0) y = 0
  else if (y > _height) y = _height
  return [x, y]
}

// resize the canvases
export function resize(newSize) {
  const { x, y } = newSize || getSize()
  for (const canvas of _canvases) {
    canvas.width = x
    canvas.height = y
  }
}

// Tolerance for Simplify for current or given zoom level
export function tol(z) {
  return z ? 1 / 2 ** z : 1 / _zf
}

/**
 * update our internal bounds with those from the associated map
 * @return {Boolean} whether the bounds have changed
 */
export function updateBounds() {
  const latLngMapBounds = _map.getBounds()

  const b = latLng2pxBounds(latLngMapBounds, _boundsObj)
  const changed =
    b[0] !== xmin || b[1] !== ymax || b[2] !== xmax || b[3] !== ymin
  if (changed) {
    ;[xmin, ymax, xmax, ymin] = b
    return true
  }
}

/**
 * update our internal zoom level/scale.  we keep track of the rounded integer zoom level,
 * and the scale of fractial zoom from that integer level
 *
 * @return {number} undefined if no change, 1 if only scale changed,
 *                  2 if integer zoom-level change
 */
export function updateZoom() {
  const z = _map.getZoom()
  const newRoundedZoom = Math.round(z)
  const newScale = _map.getZoomScale(z, newRoundedZoom)
  let changed

  if (newRoundedZoom !== _zoom) changed = 2
  else if (newScale !== _scale) changed = 1

  if (changed) {
    _zoom = newRoundedZoom
    _scale = newScale
    _zf = 2 ** _zoom
    return changed
  }
}

export function setCSStransform(offset, scale) {
  for (let i = 0; i < _canvases.length; i++) {
    DomUtil.setTransform(_canvases[i], offset, scale)
  }
}

/*
 * this needs to be called on move-end
 * It sets the baseline CSS transformation for the dot and line canvases
 */
export function calibrate() {
  _pxOrigin = _map.getPixelOrigin()
  _mapPanePos = _map._getMapPanePos()
  _pxOffset = _mapPanePos.subtract(_pxOrigin)
  _baseTranslation = _map.containerPointToLayerPoint([0, 0])
  setCSStransform(_baseTranslation)

  // This array is available as ViewBox.transform
  // for [a1, b1, a2, b2] = _transform,
  // Tx = b1 + a1 * x
  // Ty = b2 + a2 * y
  _transform[0] = _transform[2] = _zf * _scale
  _transform[1] = _pxOffset.x
  _transform[3] = _pxOffset.y

  if (MAP_INFO) {
    updateDebugDisplay()
  }

  return _mapPanePos
}

// Display some debug info on the screen
function updateDebugDisplay() {
  if (MAP_INFO && _pxOffset) {
    const { x: ox, y: oy } = _pxOffset.round()
    const { x: tx, y: ty } = _baseTranslation

    _infoBox.innerHTML =
      `<b>ViewBox:</b> zoom: ${_zoom.toFixed(2)}<br>` +
      `offset: ${ox}, ${oy}<br>` +
      `scale: ${_scale.toFixed(3)}<br>` +
      `trans: ${tx.toFixed(3)}, ${ty.toFixed(3)}<br>`
  }
}

/* Untransform a Leaflet point in place */
export function unTransform(leafletPoint) {
  leafletPoint._subtract(_pxOffset)._divideBy(_zf * _scale)
}

// returns an ActivityBounds object (Float32Array) representing a
// bounding box in absolute px coordinates
export function latLng2pxBounds(llBounds, pxObj) {
  pxObj = pxObj || new Float32Array(4)

  const { _southWest: sw, _northEast: ne } = llBounds

  pxObj[0] = sw.lat // xmin
  pxObj[1] = sw.lng // ymax
  pxObj[2] = ne.lat // xmax
  pxObj[3] = ne.lng // ymin
  latLng2px(pxObj.subarray(0, 2))
  latLng2px(pxObj.subarray(2, 4))
  return pxObj
}

// indicate whether the ViewBox overlaps the region defined by an
// ActivityBounds object
export function overlaps(activityBounds) {
  const [Axmin, Aymax, Axmax, Aymin] = activityBounds
  const xOverlaps = Axmax > xmin && Axmin < xmax
  const yOverlaps = Aymin < ymax && Aymax > ymin
  return xOverlaps && yOverlaps
}

// indicate whether the ViewBox contains a point (given as an array [x,y])
export function contains(point) {
  const [x, y] = point
  return xmin <= x && x <= xmax && ymin <= y && y <= ymax
}

// draw an outline of the ViewBox on the screen (for debug purposes)
export function draw(ctx) {
  const { x: w, y: h } = getSize()
  ctx.strokeRect(_pad, _pad, w - 2 * _pad, h - 2 * _pad)
}

// clear the entire ViewBox (for a given context)
export function clear(ctx) {
  const { x: w, y: h } = getSize()
  ctx.clearRect(0, 0, w, h)
}

// Get the ViewBox position/dimensions in Leaflet pane-coordinates
export function getPaneRect() {
  const { x, y } = _mapPanePos
  const { x: w, y: h } = getSize()
  return { x, y, w, h }
}

// Debug info box
let _infoBox
const InfoViewer = Control.extend({
  onAdd: function () {
    _infoBox = DomUtil.create("div")
    _infoBox.style.width = "200px"
    _infoBox.style.padding = "5px"
    _infoBox.style.background = "rgba(50,240,50,0.6)"
    _infoBox.style.textAlign = "left"
    _infoBox.innerHTML = "ViewBox infoBox"
    return _infoBox
  },
})
