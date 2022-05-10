/*  Simplify
    Adapted from V. Agafonkin's simplify.js implementation of
    Douglas-Peucker simplification algorithm
*/

import BitSet from "../BitSet"

type Point = [number, number]
type PointAccessor = (i: number) => Point | Float32Array

/*
 * Simplifier.js is based on V. Agafonkin's package with the same name
 *   but rather than return a new array of points, it returns
 *   a BitSet mask of points selected by the algorithm.
 *
 *  points is a function p(i) that directly accesses the i-th point
 *  of our data set.
 */
export function simplify(points: PointAccessor, n: number, tolerance: number) {
  const sqTolerance = tolerance * tolerance

  let idxBitSet = simplifyRadialDist(points, n, sqTolerance)

  const idx = idxBitSet.array()
  const subset = (i: number) => points(idx[i])
  const idxBitSubset = simplifyDouglasPeucker(subset, idx.length, sqTolerance)

  idxBitSet = idxBitSet.new_subset(idxBitSubset)

  return idxBitSet
}

// basic distance-based simplification
function simplifyRadialDist(
  points: PointAccessor,
  n: number,
  sqTolerance: number
) {
  const selectedIdx = new BitSet(n)
  let i: number
  let point = points(0)
  let prevPoint = point

  selectedIdx.add(0)

  for (i = 1; i < n; i++) {
    point = points(i)
    const sqDist = getSqDist(point, prevPoint)
    if (sqDist > sqTolerance) {
      selectedIdx.add(i++)
      prevPoint = point
    }
  }

  if (!equal(point, prevPoint)) selectedIdx.add(i)

  return selectedIdx
}

// simplification using Ramer-Douglas-Peucker algorithm
function simplifyDouglasPeucker(
  points: PointAccessor,
  n: number,
  sqTolerance: number
) {
  const bitSet = new BitSet(n)

  bitSet.add(0)
  const first = points(0)

  bitSet.add(n - 1)
  const last = points(n - 1)

  simplifyDPStep(points, 0, n - 1, sqTolerance, bitSet, first, last)

  return bitSet
}

function simplifyDPStep(
  points: PointAccessor,
  firstIdx: number,
  lastIdx: number,
  sqTolerance: number,
  bitSet: BitSet,
  first: Point,
  last: Point
) {
  let maxSqDist = sqTolerance,
    index

  for (let idx = firstIdx + 1; idx < lastIdx; idx++) {
    const sqDist = getSqSegDist(points(idx), first, last)

    if (sqDist > maxSqDist) {
      index = idx
      maxSqDist = sqDist
    }
  }

  if (maxSqDist > sqTolerance) {
    if (index - firstIdx > 1) {
      const p = points(index)
      simplifyDPStep(points, firstIdx, index, sqTolerance, bitSet, first, p)
    }

    bitSet.add(index)

    if (lastIdx - index > 1) {
      const p = points(index)
      simplifyDPStep(points, index, lastIdx, sqTolerance, bitSet, p, last)
    }
  }
}

function equal(p1: Point, p2: Point) {
  return p1[0] == p2[0] && p1[1] == p2[1]
}

// square distance between 2 points
function getSqDist(p1: Point, p2: Point) {
  const dx = p1[0] - p2[0],
    dy = p1[1] - p2[1]

  return dx * dx + dy * dy
}

// square distance from a point to a segment
function getSqSegDist(p: Point, p1: Point, p2: Point) {
  let x = p1[0],
    y = p1[1],
    dx = p2[0] - x,
    dy = p2[1] - y

  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy)

    if (t > 1) {
      x = p2[0]
      y = p2[1]
    } else if (t > 0) {
      x += dx * t
      y += dy * t
    }
  }

  dx = p[0] - x
  dy = p[1] - y

  return dx * dx + dy * dy
}
