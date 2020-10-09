/** DrawBox represents the rectangular region that bounds
 *   all of our drawing on the canvas. We use it primarily
 *   to minimize how much we need to clear between frames
 *   of the animation.
 *   @module  DotLayer/DrawBox
 */

const _pad = 25

let _ViewBox, _defaultRect, _rect, _dim

export function initialize(ViewBox) {
  _ViewBox = ViewBox
  reset()
  _defaultRect = new Float32Array([0, 0, 0, 0])
  _rect = new Float32Array(4) // [x, y, w, h]
}

export function reset() {
  _dim = undefined
  return this
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
  const mapSize = _ViewBox.getMapSize()
  _defaultRect[2] = mapSize.x
  _defaultRect[3] = mapSize.y
  return _defaultRect
}

export function rect(pad) {
  pad = pad || _pad
  const d = _dim

  if (!d) return defaultRect()
  const c = _ViewBox,
    mapSize = c.getMapSize(),
    transform = c.px2Container(),
    r = _rect

  r[0] = d.xmin
  r[1] = d.ymin
  transform(r)
  r[0] = ~~Math.max(r[0] - pad, 0)
  r[1] = ~~Math.max(r[1] - pad, 0)
  // (r[0], r[1]) is upper-left corner

  r[2] = d.xmax
  r[3] = d.ymax
  transform(r.subarray(2, 4))
  r[2] = ~~Math.min(r[2] + pad, mapSize.x) - r[0]
  r[3] = ~~Math.min(r[3] + pad, mapSize.y) - r[1]
  // r[2], r[3] are width and height
  return r
}

export function draw(ctx, rect) {
  const r = rect || rect()
  if (!r) return
  ctx.strokeRect(r[0], r[1], r[2], r[3])
}

export function clear(ctx, rect) {
  const r = rect || rect()
  if (!r) return
  ctx.clearRect(r[0], r[1], r[2], r[3])
}
