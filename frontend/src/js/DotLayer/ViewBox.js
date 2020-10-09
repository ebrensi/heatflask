/*
 *  ViewBox represents the the rectangle in which everything
 *  we are doing happens
 *  @module DotLayer/ViewBox
 *
 */

import { makePT } from "CRS.js"
import BitSet from "../BitSet.js"
import { DomUtil } from "leaflet"

let _map,
  _canvases,
  _sets,
  _pathColorGroups,
  _dotColorGroups,
  _pxOffset,
  _pxBounds,
  _itemsArray,
  _zoom,
  _zf

const latLng2px = makePT(0)

export function initialize(map, canvases, itemsArray) {
  _map = map
  _canvases = canvases
  _sets = {
    items: { current: new BitSet(), last: new BitSet() },
    colorGroups: { path: {}, dot: {} },
  }
  _pathColorGroups = { selected: null, unselected: null }
  _dotColorGroups = { selected: null, unselected: null }
  _pxOffset = [NaN, NaN]

  if (itemsArray) setItemsArray(itemsArray)
}

export function reset(itemsArray) {
  initialize(_map, _canvases, itemsArray)
}

export function getMapSize() {
  return _map.getSize()
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

export function tol(zoom) {
  return zoom ? 1 / 2 ** zoom : 1 / _zf
}

export function inView() {
  return _sets.items.current
}

export function updateView() {
  const sets = _sets,
    allItems = _itemsArray,
    inView = sets.items

  const temp = inView.current
  inView.current = inView.last.clear()
  inView.last = temp

  const currentInView = inView.current
  // update which items are in the current view
  for (let i = 0, len = allItems.length; i < len; i++) {
    if (overlaps(allItems[i].bounds)) currentInView.add(i)
  }

  // update items that have changed since last time
  const changed = inView.last.change(inView.current)
  changed.forEach((i) => {
    const A = allItems[i],
      emph = !!A.selected
    let pgroup = sets.colorGroups.path,
      dgroup = sets.colorGroups.dot

    if (!(emph in pgroup)) pgroup[emph] = {}
    pgroup = pgroup[emph]

    if (!(emph in dgroup)) dgroup[emph] = {}
    dgroup = dgroup[emph]

    // update pathColorGroup
    if (!(A.pathColor in pgroup)) pgroup[A.pathColor] = new BitSet().add(i)
    else pgroup[A.pathColor].flip(i)

    // update dotColorGroup
    if (!(A.dotColor in dgroup)) dgroup[A.dotColor] = new BitSet().add(i)
    else dgroup[A.dotColor].flip(i)
  })

  const groups = sets.colorGroups
  for (const type in groups) {
    // path or dot
    const typeGroup = groups[type]
    for (const emph in typeGroup) {
      const colorGroup = typeGroup[emph]
      let empty = true
      for (const color in colorGroup) {
        if (colorGroup[color].isEmpty()) delete colorGroup[color]
        else if (empty) empty = false
      }
      if (empty) delete typeGroup[emph]
    }
  }

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

export function calibrate() {
  // calibrate screen coordinates
  const m = _map,
    topLeft = m.containerPointToLayerPoint([0, 0]),
    setPosition = DomUtil.setPosition,
    canvases = _canvases

  for (let i = 0, len = canvases.length; i < len; i++)
    setPosition(canvases[i], topLeft)

  const pxOrigin = m.getPixelOrigin(),
    mapPanePos = m._getMapPanePos()
  _pxOffset = mapPanePos.subtract(pxOrigin)
}

export function update(calibrate = true) {
  const m = _map,
    zoom = m.getZoom(),
    latLngMapBounds = m.getBounds()

  const zoomChange = zoom != _zoom
  // stuff that (only) needs to be done on zoom change
  if (zoomChange) onZoomChange(zoom)

  if (calibrate) calibrate()

  _pxBounds = latLng2pxBounds(latLngMapBounds)

  return updateView()
}

export function onZoomChange(zoom) {
  _zoom = zoom
  _zf = 2 ** zoom
}

// this function operates in-place!
export function px2Container() {
  return (p) => {
    p[0] = _zf * p[0] + _pxOffset.x
    p[1] = _zf * p[1] + _pxOffset.y

    return p
  }
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
    transform = px2Container(),
    ul = transform([xmin, ymin]),
    x = ul[0] + 5,
    y = ul[1] + 5,
    lr = transform([xmax, ymax]),
    w = lr[0] - x - 10,
    h = lr[1] - y - 10,
    rect = { x: x, y: y, w: w, h: h }

  ctx.strokeRect(x, y, w, h)
  return rect
}
