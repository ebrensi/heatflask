/*
 *  DrawBox represents the rectangular region that bounds
 *   all of our drawing on the canvas. We use it primarily
 *   to minimize how much we need to clear between frames
 *   of the animation.
 */

import * as ViewBox from "./ViewBox.js"

const _pad = 25
let xmin, xmax, ymin, ymax

export function reset() {
  xmin = xmax = ymin = ymax = undefined
}

export function update(point) {
  const [x, y] = point

  if (!xmin || x < xmin) xmin = x
  if (!xmax || x > xmax) xmax = x
  if (!ymin || y < ymin) ymin = y
  if (!ymax || y > ymax) ymax = y
  return true
}

export function defaultRect() {
  const mapSize = ViewBox.getMapSize()
  return { x: 0, y: 0, w: mapSize.x, h: mapSize.y }
}

export function rect(pad) {
  pad = pad || _pad

  if (xmin === undefined) return defaultRect()
  const mapSize = ViewBox.getMapSize()
  const transform = ViewBox.makeTransform()

  // upper-left corner
  const [Txmin, Tymin] = transform(xmin, ymin)
  const x = ~~Math.max(Txmin - pad, 0)
  const y = ~~Math.max(Tymin - pad, 0)

  // width and height
  const [Txmax, Tymax] = transform(xmax, ymax)
  const w = ~~Math.min(Txmax + pad, mapSize.x) - x
  const h = ~~Math.min(Tymax + pad, mapSize.y) - y

  return { x, y, w, h }
}

export function draw(ctx) {
  const { x, y, w, h } = rect()
  ctx.strokeStyle = "rgb(0,255,0,1)"
  ctx.strokeRect(x, y, w, h)
}

export function clear(ctx) {
  const { x, y, w, h } = rect()
  ctx.clearRect(x, y, w, h)
}
