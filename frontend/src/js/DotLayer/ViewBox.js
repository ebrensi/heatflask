/*
 *  ViewBox represents the the rectangular region occupied by the canvases
 *
 */

import { makePT } from "./CRS.js"
import { DomUtil, Control } from "../myLeaflet.js"
import { MAP_INFO } from "../Env.js"

const _canvases = []

const _pad = 5 // padding for

// private module-scope variable
let _map, _baseTranslation

// exported module-scope variables
let _pxOrigin, _pxOffset, _mapPanePos, _zoom, _zf, _scale

let xmin, xmax, ymin, ymax

export {
  _canvases as canvases,
  _pxOrigin as pxOrigin,
  _pxOffset as pxOffset,
  _zoom as zoom,
  _zf as zf,
}

/**
 * Project a [lat, lng] point to [x,y] in rectangular coordinates
 * at baseline scale (_zoom=0).  From there we only need to scale and
 * shift points for a given zoom level and map position.
 *
 * This function operates in-place! It modifies whatever you pass into it.
 *
 * @type {function}
 */
export const latLng2px = makePT(0)

export function getMapSize() {
  return _map.getSize()
}

export function resize(width, height) {
  for (const canvas of _canvases) {
    canvas.width = width
    canvas.height = height
  }
}

export function setMap(map) {
  _map = map
  if (MAP_INFO) {
    new InfoViewer().addTo(map)
  }
}

export function tol(_zoom) {
  return _zoom ? 1 / 2 ** _zoom : 1 / _zf
}

/*
 * Determine boundaries of the current view and which items are in it
 *
 * This can be done only on move-end, or it can be continuously as the user
 * pans and zooms around but we want to avoind calling it too often
 * as that might be too much computation
 */
export function updateBounds() {
  const latLngMapBounds = _map.getBounds()
  ;[xmin, ymax, xmax, ymin] = latLng2pxBounds(latLngMapBounds)

  if (MAP_INFO) {
    updateDebugDisplay()
  }
}

export function updateZoom() {
  const z = _map.getZoom()
  _zoom = Math.round(z)
  _scale = _map.getZoomScale(z, _zoom)
  _zf = 2 ** _zoom
}

export function setCSStransform(offset, scale) {
  for (let i = 0; i < _canvases.length; i++) {
    DomUtil.setTransform(_canvases[i], offset, scale)
  }
}

/*
 * apply an additional CSS transform to another center and zoom
 * This is used for pinch pan and zoom on mobile devices
 */
export function CSStransformTo(newCenter, newZoom) {
  const newPxOrigin = _map._getNewPixelOrigin(newCenter, newZoom)
  const scale = _map.getZoomScale(newZoom, _zoom)
  const translation = _pxOrigin.multiplyBy(scale).subtract(newPxOrigin)
  const newTranslation = _baseTranslation.multiplyBy(scale).add(translation)
  // setCSStransform(transform.round(), scale)
  setCSStransform(newTranslation.round(), scale)
}

export function setPinchTransform({ offset, scale }) {
  const newTranslation = _baseTranslation.multiplyBy(scale).add(offset)
  setCSStransform(newTranslation.round(), scale)
}

export function calibrate() {
  /* this needs to be called on move-end
   *
   * It sets the baseline CSS transformation for the dot and line canvases
   */
  _pxOrigin = _map.getPixelOrigin()
  _mapPanePos = _map._getMapPanePos()

  _pxOffset = _mapPanePos.subtract(_pxOrigin)

  _baseTranslation = _map.containerPointToLayerPoint([0, 0])
  setCSStransform(_baseTranslation.round())
}

function updateDebugDisplay() {
  if (MAP_INFO && _pxOffset) {
    const { x: ox, y: oy } = _pxOffset.round()
    const { x: tx, y: ty } = _baseTranslation.round()
    const f = (v, num) => v.toFixed(num)

    const tf = makeTransform((x, y) => `${f(x, 0)}, ${f(y, 0)}`)

    _infoBox.innerHTML =
      `<b>ViewBox:</b> zoom: ${_zoom.toFixed(2)}<br>` +
      `offset: ${ox}, ${oy}<br>` +
      `scale: ${_scale.toFixed(3)}<br>` +
      `trans: ${tx}, ${ty}<br>` +
      // + `pxBounds:<br>SW: ${f(x1,4)}, ${f(y1, 4)}<br>NE: ${f(x2,4)}, ${f(y2,4)}<br>`
      `NW: ${tf(xmin, ymin)}<br>SE: ${tf(xmax, ymax)}`
  }
}

/**
 * returns a function that transforms given x,y coordinates
 * to the current screen coordinate system
 *
 * Since this function will be called a lot we have made an
 * attempt at optimization: if the user supplies a function
 * that takes two arguments, the function will be called with
 * the transformed coordinates so we can avoid creating a new
 * Array every time we perform the transformation.
 */
export function makeTransform(func) {
  const { x: ox, y: oy } = _pxOffset
  const mult = _zf * _scale

  if (func) {
    return function (x, y) {
      return func(mult * x + ox, mult * y + oy)
    }
  }

  return function (x, y) {
    return [mult * x + ox, mult * y + oy]
  }
}

/* Untransform a Leaflet point in place */
export function unTransform(leafletPoint) {
  leafletPoint._subtract(_pxOffset)._divideBy(_zf * _scale)
}

export function latLng2pxBounds(llBounds, pxObj) {
  if (!pxObj) pxObj = new Float32Array(4)

  const { _southWest: sw, _northEast: ne } = llBounds

  pxObj[0] = sw.lat // xmin
  pxObj[1] = sw.lng // ymax
  pxObj[2] = ne.lat // xmax
  pxObj[3] = ne.lng // ymin
  latLng2px(pxObj.subarray(0, 2))
  latLng2px(pxObj.subarray(2, 4))
  return pxObj
}

export function overlaps(activityBounds) {
  const ab = activityBounds
  const xOverlaps = ab[2] > xmin && ab[0] < xmax
  const yOverlaps = ab[3] < ymax && ab[1] > ymin
  return xOverlaps && yOverlaps
}

export function contains(point) {
  const [x, y] = point
  return xmin <= x && x <= xmax && ymin <= y && y <= ymax
}

function getTPxBounds() {
  const transform = makeTransform()

  const ul = transform(xmin, ymin)
  const lr = transform(xmax, ymax)
  return { ul, lr }
}

export function drawPxBounds(ctx, pxBounds) {
  const { ul, lr } = getTPxBounds(pxBounds)
  const x = ul[0] + _pad
  const y = ul[1] + _pad
  const w = lr[0] - x - 2 * _pad
  const h = lr[1] - y - 2 * _pad

  ctx.strokeRect(x, y, w, h)
  return { x, y, w, h }
}

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
