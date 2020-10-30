/*
 *  ViewBox represents the the rectangle in which everything
 *  we are doing happens
 *  @module DotLayer/ViewBox
 *
 */

import { makePT } from "./CRS.js"
import BitSet from "../BitSet.js"
import { DomUtil } from "leaflet"

const _canvases = []

const _sets = {
  items: { current: new BitSet(), last: new BitSet() },
  colorGroups: { path: {}, dot: {} },
}
const _pathColorGroups = { selected: null, unselected: null }
const _dotColorGroups = { selected: null, unselected: null }

// private module-scope variable
let _map, _pxBounds, _itemsArray, _baseTransform

// exported module-scope variables
let _pxOrigin, _pxOffset, _mapPanePos, _zoom, _center, _zf

export {
  _canvases as canvases,
  _pxOrigin as pxOrigin,
  _pxOffset as pxOffset,
  _center as center,
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

export function pathColorGroups() {
  const cgroups = _sets.colorGroups.path
  _pathColorGroups.selected = cgroups[true]
  _pathColorGroups.unselected = cgroups[false]
  return _pathColorGroups
}

export function dotColorGroups() {
  const cgroups = _sets.colorGroups.dot
  _dotColorGroups.selected = cgroups[true]
  _dotColorGroups.unselected = cgroups[false]
  return _dotColorGroups
}

export function setItemsArray(itemsArray) {
  _itemsArray = itemsArray
}

export function setMap(map) {
  _map = map
}

export function tol(_zoom) {
  return _zoom ? 1 / 2 ** _zoom : 1 / _zf
}

export function inView() {
  return _sets.items.current
}


/*
 * Determine boundaries of the current view and which items are in it
 *
 * This can be done only on move-end, or it can be continuously as the user
 * pans and zooms around but we want to avoind calling it too often
 * as that might be too much computation
 */
export function update() {

    const z = _map.getZoom()
    const latLngMapBounds = _map.getBounds()

    if (z !== _zoom) {
      _zoom = z
      _zf = 2**z
    }

  _center = _map.getCenter()
  _pxBounds = latLng2pxBounds(latLngMapBounds)

  const inView = _sets.items
  const temp = inView.current
  inView.current = inView.last.clear()
  inView.last = temp

  const currentInView = inView.current
  // update which items are in the current view
  for (let i = 0, len = _itemsArray.length; i < len; i++) {
    if (overlaps(_itemsArray[i].pxBounds)) {
      currentInView.add(i)
    }
  }

  // update items that have changed since last time
  const changed = inView.last.change(inView.current)
  changed.forEach((i) => {
    const A = _itemsArray[i],
      selected = !!A.selected

    let pgroup = _sets.colorGroups.path,
      dgroup = _sets.colorGroups.dot

    if (!(selected in pgroup)) {
      pgroup[selected] = {}
    }
    pgroup = pgroup[selected]

    if (!(selected in dgroup)) {
      dgroup[selected] = {}
    }
    dgroup = dgroup[selected]

    // update pathColorGroup
    if (!(A.pathColor in pgroup)) {
      pgroup[A.pathColor] = new BitSet().add(i)
    } else {
      pgroup[A.pathColor].flip(i)
    }

    // update dotColorGroup
    if (!(A.dotColor in dgroup)) {
      dgroup[A.dotColor] = new BitSet().add(i)
    } else {
      dgroup[A.dotColor].flip(i)
    }
  })

  const groups = _sets.colorGroups
  for (const type in groups) {
    // path or dot
    const typeGroup = groups[type]
    for (const emph in typeGroup) {
      const colorGroup = typeGroup[emph]
      let empty = true
      for (const color in colorGroup) {
        if (colorGroup[color].isEmpty()) {
          delete colorGroup[color]
        } else if (empty) {
          empty = false
        }
      }
      if (empty) {
        delete typeGroup[emph]
      }
    }
  }

  // TODO: make segmasks here while we're at it

  // return the current state of inclusion
  return currentInView
}

// note this only removes A from colorGroups but it stays in
// itemsViewBox:ViewBox:, so that we won't keep adding it every time
// update() is called.
export function remove(i) {
  const A = _itemsArray[i],
    cg = _sets.colorGroups,
    emph = !!A.selected
  cg.path[emph][A.pathColor].remove(i)
  cg.dot[emph][A.dotColor].remove(i)
  inView().remove(i)
}

export function updateSelect(i) {
  const A = _itemsArray[i],
    cg = _sets.colorGroups,
    emph = !!A.selected

  if (inView().has(i)) {
    if (!cg.path[emph]) cg.path[emph] = {}

    if (!cg.dot[emph]) cg.dot[emph] = {}

    if (!cg.path[emph][A.pathColor]) cg.path[emph][A.pathColor] = new BitSet()

    if (!cg.dot[emph][A.dotColor]) cg.dot[emph][A.dotColor] = new BitSet()

    cg.path[emph][A.pathColor].add(i)
    cg.path[!emph][A.pathColor].remove(i)

    cg.dot[emph][A.dotColor].add(i)
    cg.dot[!emph][A.dotColor].remove(i)
    return true
  }
}


function setCSStransform(offset, scale) {
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
  const transform = _pxOrigin.multiplyBy(scale).subtract(newPxOrigin)
  // setCSStransform(transform.round(), scale)
  setCSStransform(_baseTransform.add(transform).round(), scale)
}

export function calibrate() {
  /* this needs to be called on move-end
   *
   * It sets the baseline CSS transformation for the dot and line canvases
   */
  _baseTransform = _map.containerPointToLayerPoint([0, 0])

  _pxOrigin = _map.getPixelOrigin()
  _mapPanePos = _map._getMapPanePos()

  _pxOffset = _mapPanePos.subtract(_pxOrigin)

  console.log(`base: ${_baseTransform}, offset: ${_pxOffset}`)

  setCSStransform(_baseTransform.round())
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
  const ox = _pxOffset.x,
    oy = _pxOffset.y
  if (func) {
    return function (x, y) {
      return func(_zf * x + ox, _zf * y + oy)
    }
  }

  return function (x, y) {
    return [_zf * x + ox, _zf * y + oy]
  }
}

/* Untransform a Leaflet point in place */
export function unTransform(leafletPoint) {
  leafletPoint._subtract(_pxOffset)._divideBy(_zf)
}

export function latLng2pxBounds(llBounds, pxObj) {
  if (!pxObj) pxObj = new Float32Array(4)

  const sw = llBounds._southWest,
    ne = llBounds._northEast

  pxObj[0] = sw.lat // xmin
  pxObj[1] = sw.lng // ymax
  pxObj[2] = ne.lat // xmax
  pxObj[3] = ne.lng // ymin
  latLng2px(pxObj.subarray(0, 2))
  latLng2px(pxObj.subarray(2, 4))
  return pxObj
}

export function overlaps(activityBounds) {
  const mb = _pxBounds,
    ab = activityBounds,
    xOverlaps = ab[2] > mb[0] && ab[0] < mb[2],
    yOverlaps = ab[3] < mb[1] && ab[1] > mb[3]
  return xOverlaps && yOverlaps
}

export function contains(point) {
  const mb = _pxBounds,
    x = point[0],
    y = point[1],
    xmin = mb[0],
    xmax = mb[2],
    ymin = mb[3],
    ymax = mb[1]

  return xmin <= x && x <= xmax && ymin <= y && y <= ymax
}

export function drawPxBounds(ctx, pxBounds) {
  const b = pxBounds || _pxBounds,
    xmin = b[0],
    xmax = b[2],
    ymin = b[3],
    ymax = b[1],
    transform = makeTransform(),
    ul = transform(xmin, ymin),
    x = ul[0] + 5,
    y = ul[1] + 5,
    lr = transform(xmax, ymax),
    w = lr[0] - x - 10,
    h = lr[1] - y - 10

  ctx.strokeRect(x, y, w, h)
  return { x, y, w, h }
}
