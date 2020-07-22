import BitSet from "./BitSet";

/*
    Adapted from V. Agafonkin's simplify.js implementation of
    Douglas-Peucker simplification algorithm
*/

/*
 * Simplifier.js is based on V. Agafonkin's package with the same name
 *   but rather than return a new array of points, it returns
 *   a BitSet mask of points selected by the algorithm.
 *
 *  points is a function p(i) that directly accesses the i-th point
 *  of our data set.  we must assume that the point we get is
 *  a pointer to he same memory location every time, so we need to make copy
 *  ourselves.
 */

export default function (points, n, tolerance) {
  const sqTolerance = tolerance * tolerance;

  let idxBitSet = simplifyRadialDist(points, n, sqTolerance);

  const idx = idxBitSet.array(),
    subset = (i) => points(idx[i]),
    idxBitSubset = simplifyDouglasPeucker(subset, idx.length, sqTolerance);

  idxBitSet = idxBitSet.new_subset(idxBitSubset);

  return idxBitSet;
}

// basic distance-based simplification
function simplifyRadialDist(points, n, sqTolerance) {
  const selectedIdx = new BitSet(),
    prevPoint = new Float32Array(2);

  let point = points(0),
    i;
  prevPoint[0] = point[0];
  prevPoint[1] = point[1];
  selectedIdx.add(0);

  for (i = 1; i < n; i++) {
    point = points(i);
    if (getSqDist(point, prevPoint) > sqTolerance) {
      selectedIdx.add(i++);
      prevPoint[0] = point[0];
      prevPoint[1] = point[1];
    }
  }

  if (!equal(point, prevPoint)) selectedIdx.add(i);

  return selectedIdx;
}

// simplification using Ramer-Douglas-Peucker algorithm
function simplifyDouglasPeucker(points, n, sqTolerance) {
  const bitSet = new BitSet(),
    buffer = new Float32Array(4),
    p1 = buffer.subarray(0, 2),
    p2 = buffer.subarray(2, 4);

  bitSet.add(0);
  const first = points(0);
  p1[0] = first[0];
  p1[1] = first[1];

  bitSet.add(n - 1);
  const last = points(n - 1);
  p2[0] = last[0];
  p2[1] = last[1];

  simplifyDPStep(points, 0, n - 1, sqTolerance, bitSet, p1, p2);

  return bitSet;
}

function simplifyDPStep(
  points,
  firstIdx,
  lastIdx,
  sqTolerance,
  bitSet,
  p1,
  p2
) {
  let maxSqDist = sqTolerance,
    index;

  for (let idx = firstIdx + 1; idx < lastIdx; idx++) {
    const sqDist = getSqSegDist(points(idx), p1, p2);

    if (sqDist > maxSqDist) {
      index = idx;
      maxSqDist = sqDist;
    }
  }

  if (maxSqDist > sqTolerance) {
    if (index - firstIdx > 1) {
      const p = points(index);
      p2[0] = p[0];
      p2[1] = p[1];
      simplifyDPStep(points, firstIdx, index, sqTolerance, bitSet, p1, p2);
    }

    bitSet.add(index);

    if (lastIdx - index > 1) {
      const p = points(index);
      p1[0] = p[0];
      p1[1] = p[1];
      simplifyDPStep(points, index, lastIdx, sqTolerance, bitSet, p1, p2);
    }
  }
}

function equal(p1, p2) {
  return p1[0] == p2[0] && p1[1] == p2[1];
}

// square distance between 2 points
function getSqDist(p1, p2) {
  const dx = p1[0] - p2[0],
    dy = p1[1] - p2[1];

  return dx * dx + dy * dy;
}

// square distance from a point to a segment
function getSqSegDist(p, p1, p2) {
  let x = p1[0],
    y = p1[1],
    dx = p2[0] - x,
    dy = p2[1] - y;

  if (dx !== 0 || dy !== 0) {
    const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);

    if (t > 1) {
      x = p2[0];
      y = p2[1];
    } else if (t > 0) {
      x += dx * t;
      y += dy * t;
    }
  }

  dx = p[0] - x;
  dy = p[1] - y;

  return dx * dx + dy * dy;
}
