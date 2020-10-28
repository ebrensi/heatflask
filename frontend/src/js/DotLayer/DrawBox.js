/** DrawBox represents the rectangular region that bounds
 *   all of our drawing on the canvas. We use it primarily
 *   to minimize how much we need to clear between frames
 *   of the animation.
 *   @module  DotLayer/DrawBox
 */

import * as ViewBox from "./ViewBox.js"

let _dim

const _pad = 25
const _defaultRect = new Float32Array([0, 0, 0, 0])
const _rect = new Float32Array(4) // [x, y, w, h]

export function reset() {
  _dim = undefined
}

export function update(point) {
  const x = point[0],
    y = point[1],
    d = _dim || {}
  if (!d.xmin || x < d.xmin) d.xmin = x
  if (!d.xmax || x > d.xmax) d.xmax = x
  if (!d.ymin || y < d.ymin) d.ymin = y
  if (!d.ymax || y > d.ymax) d.ymax = y

  return (_dim = d)
}

export function defaultRect() {
  const mapSize = ViewBox.getMapSize()
  _defaultRect[2] = mapSize.x
  _defaultRect[3] = mapSize.y
  return _defaultRect
}

export function rect(pad) {
  pad = pad || _pad
  const d = _dim

  if (!d) return defaultRect()
  const mapSize = ViewBox.getMapSize(),
    transform = ViewBox.makeTransform()

  // upper-left corner
  const UL = transform(d.xmin, d.ymin)
  _rect[0] = ~~Math.max(UL[0] - pad, 0)
  _rect[1] = ~~Math.max(UL[1] - pad, 0)

  // width and height
  const WH = transform(d.xmax, d.ymax)
  _rect[2] = ~~Math.min(WH[0] + pad, mapSize.x) - _rect[0]
  _rect[3] = ~~Math.min(WH[1] + pad, mapSize.y) - _rect[1]

  return _rect
}

export function draw(ctx, r) {
  r = r || rect()
  if (!r) return
  ctx.strokeRect(r[0], r[1], r[2], r[3])
}

export function clear(ctx, r) {
  r = r || rect()
  if (!r) return
  ctx.clearRect(r[0], r[1], r[2], r[3])
}
