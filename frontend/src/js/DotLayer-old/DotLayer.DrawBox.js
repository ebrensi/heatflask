/* DrawBox represents the rectangular region that bounds
 *   all of our drawing on the canvas. We use it primarily
 *   to minimize how much we need to clear between frames
 *   of the animation.
 */

export const DrawBox = {
  _pad: 25,

  initialize: function (ViewBox) {
    this.ViewBox = ViewBox
    this.reset()
    this._defaultRect = new Float32Array([0, 0, 0, 0])
    this._rect = new Float32Array(4) // [x, y, w, h]
  },

  reset: function () {
    this._dim = undefined
    return this
  },

  update: function (point) {
    const x = point[0],
      y = point[1],
      d = this._dim || {}
    if (!d.xmin || x < d.xmin) d.xmin = x
    if (!d.xmax || x > d.xmax) d.xmax = x
    if (!d.ymin || y < d.ymin) d.ymin = y
    if (!d.ymax || y > d.ymax) d.ymax = y

    return (this._dim = d)
  },

  defaultRect: function () {
    const mapSize = this.ViewBox.getMapSize()
    this._defaultRect[2] = mapSize.x
    this._defaultRect[3] = mapSize.y
    return this._defaultRect
  },

  rect: function (pad) {
    pad = pad || this._pad
    const d = this._dim
    if (!d) return this.defaultRect()
    const c = this.ViewBox,
      mapSize = c.getMapSize(),
      transform = c.px2Container(),
      r = this._rect
    r[0] = d.xmin
    r[1] = d.ymin
    transform(r)
    r[0] = ~~Math.max(r[0] - pad, 0)
    r[1] = ~~Math.max(r[1] - pad, 0)

    r[2] = d.xmax
    r[3] = d.ymax
    transform(r.subarray(2, 4))
    r[2] = ~~Math.min(r[2] + pad, mapSize.x) - r[0]
    r[3] = ~~Math.min(r[3] + pad, mapSize.y) - r[1]

    return r
  },

  draw: function (ctx, rect) {
    const r = rect || this.rect()
    if (!r) return
    ctx.strokeRect(r[0], r[1], r[2], r[3])
    return this
  },

  clear: function (ctx, rect) {
    const r = rect || this.rect()
    if (!r) return
    ctx.clearRect(r[0], r[1], r[2], r[3])
    return this
  },
}
