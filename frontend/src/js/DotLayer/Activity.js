/*
 * This module contains definitions for the Activity and ActivityCollection
 *  classes.
 */

import { LatLngBounds } from "../myLeaflet.js"
import * as Polyline from "./Codecs/Polyline.js"
import * as StreamRLE from "./Codecs/StreamRLE.js"
import * as ViewBox from "./ViewBox"
import * as DrawBox from "./DrawBox"
import * as Simplifier from "./Simplifier.js"
import { ATYPE } from "../strava.js"
import BitSet from "../BitSet.js"
import { RunningStatsCalculator } from "./stats.js"

/*
 * This is meant to be a LRU cache for stuff that should go away
 * if it is not used for a while. For now we just use a Map.
 */
const _lru = new Map()

function inBounds(p) {
  return ViewBox.contains(p) && DrawBox.update(p)
}

/**
 * We detect anomalous gaps in data by simple statistical analysis of
 * segment lengths.
 *
 * These gaps usually come up when there is a pause in recording
 * while the person in still moving. If the gap is big enough, it
 * results in a long straight line segment that is inaccurate
 * and looks bad.  Sometimes they result from bad GPS reception, in which
 * case they appear as random points far from the activity track.
 *
 * We consider the log of the square distance between two successive points.
 *
 * Any segment that has a Z-Score above ZSCORE_CUTOFF is considered
 * an outlier and removed from the path.
 *
 * @type {Number}
 */
const ZSCORE_CUTOFF = 5 // TODO: Consider IQR for this

/**
 * @class Activity
 */
export class Activity {
  constructor({
    _id,
    type,
    vtype,
    name,
    total_distance,
    elapsed_time,
    average_speed,
    ts,
    bounds,
    polyline,
    time,
    n,
  }) {
    this.id = +_id
    this.type = type
    this.vtype = vtype
    this.total_distance = total_distance
    this.elapsed_time = elapsed_time
    this.average_speed = average_speed
    this.name = name
    this._selected = false
    this.tr = null

    this.colors = {
      // path color is determined by activity type
      path: ATYPE.pathColor(type),

      // dot color is set by a color selecting algorithm later
      dot: null,
    }

    // timestamp comes from backend as a UTC-timestamp, local offset pair
    const [utc, offset] = ts
    this.ts = utc
    this.tsLocal = new Date((utc + offset * 3600) * 1000)

    this.llBounds = new LatLngBounds(bounds.SW, bounds.NE)
    this.pxBounds = ViewBox.latLng2pxBounds(this.llBounds)

    this.idxSet = {} // BitSets of indices of px for each level of zoom
    this.badSegIdx = {} // locations of gaps in data for each level of zoom
    this.segMask = null // BitSet indicating which segments are in view

    // decode polyline format into an Array of [lat, lng] points
    const points = new Float32Array(n * 2)
    const excludeMask = new BitSet(n)

    /*
     * We will compute some stats on interval lengths to
     *  detect anomalous big gaps in the data.
     */
    const dStats = new RunningStatsCalculator()
    const sqDists = []
    const project = ViewBox.latLng2px
    const latlngs = Polyline.decode(polyline)

    // Set the first point of points to be the projected first latlng pair
    points.set(project(latlngs.next().value), 0)

    let i = 0 // index of the i-th element of latlngs
    let j = 2 // index of the j-th element of points
    let p1 = points.subarray(0, j)
    for (const latLng of latlngs) {
      i++
      const p2 = project(latLng)
      const sd = sqDist(p1, p2)
      if (!sd) {
        /*  We ignore any two successive points with zero distance
         *  this might cause problems so look out for it
         */
        excludeMask.add(i)
        continue
      }
      // const logSd = Math.log10(sd)
      const logSd = Math.log(sd)
      dStats.update(logSd)
      sqDists.push(logSd)

      points.set(p2, j)
      p1 = points.subarray(j, j + 2)
      j = j + 2
    }

    if (sqDists.length + 1 === n) {
      this.px = points
      this.time = StreamRLE.transcode2CompressedBuf(time)
    } else {
      n = sqDists.length + 1
      this.px = points.slice(0, n * 2)

      // Some points were discarded so we need to adjust the time diffs
      const it = StreamRLE.decodeDiffList(time, 0, excludeMask)
      this.time = StreamRLE.encode2CompressedDiffBuf(it)

      // console.log(`${_id}: excluded ${excludeMask.size()} points`)
    }

    this.n = n

    const dMean = dStats.mean
    const dStdev = dStats.populationStdev
    // const zScores = []
    const devTol = ZSCORE_CUTOFF * dStdev
    const dOutliers = []
    for (let i = 0, len = n - 1; i < len; i++) {
      const dev = sqDists[i] - dMean
      // const zScore = dev / dStdev
      // zScores.push(zScore)
      // if (zScore > ZSCORE_CUTOFF) {
      if (dev > devTol) {
        dOutliers.push(i)
      }
    }

    if (dOutliers.length) {
      this.pxGaps = dOutliers
      // this.selected = true
      // const dist = hist(zScores, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      // console.log({dStats, zScores, dist, dOutliers})
    }
  }

  gapAt(idx) {
    const p = this.getPointAccessor()
    return sqDist(p(idx), p(idx + 1))
  }

  inMapBounds() {
    return ViewBox.overlaps(this.pxBounds)
  }

  /**
   * This returns a fuction that provides direct access to the
   * i-th point [x,y] of the location track at a given zoom level.
   *  For any zoom != 0  it uses an index of lookups, which takes
   *  up more memory than the iterator, but it is faster.
   *
   * Each point returned by the accessor function is a window into the
   * actual px array so modifying it will modify the the px array.
   *
   * @param  {Number} zoom
   * @return {function} the accessor function
   */
  getPointAccessor(zoom) {
    const px = this.px
    if (!zoom) {
      return function (i) {
        const j = i * 2
        return px.subarray(j, j + 2)
      }
    }

    const key = `I${this.id}:${zoom}`
    let idx = _lru.get(key)

    if (!idx) {
      const idxSet = this.idxSet[zoom]
      if (!idxSet) {
        throw new Error(`no idxSet[${zoom}]`)
      }
      idx = this.idxSet[zoom].array()
      _lru.set(key, idx)
    }

    return function (i) {
      const j = idx[i] * 2
      return px.subarray(j, j + 2)
    }
  }

  /**
   * A generator that yields points [x,y] of the location track at
   *  a given zoom level, in sequence.
   *
   * Each point yielded by the generator is a window into the
   * actual px array so modifying it will modify the the px array.
   *
   * @param {Number} zoom
   */
  pointsIterator(zoom) {
    if (!zoom) {
      return _pointsIterator(this.px)
    }

    const idxSet = this.idxSet[zoom]
    if (!idxSet) {
      throw new Error(`no idxSet[${zoom}]`)
    }
    return _pointsIterator(this.px, idxSet)
  }

  /**
   * returns an iterator of segment objects
   * (actually the same Object with different values)
   *
   * @param  {Number} zoom
   * @param  {BitSet} segMask
   * @return {Iterator}
   */
  *iterSegments(zoom, segMask) {
    zoom = zoom || ViewBox.zoom
    segMask = segMask || this.segMask
    const points = this.getPointAccessor(zoom)
    const seg = this.segmentBuf

    for (const i of segMask) {
      seg.a = points(i)
      seg.b = points(i + 1)
      yield seg
    }
  }

  /**
   * this returns an iterator of segments without needing
   *   a point accessor
   *
   * @param  {Number} zoom
   * @param  {BitSet} segMask
   * @return {Iterator}
   */
  *iterSegmentsFromPointsIterator(zoom, segMask) {
    zoom = zoom || ViewBox.zoom
    segMask = segMask || this.segMask

    const points = this.pointsIterator(zoom)
    const seg = this.segmentBuf
    let j = 0,
      obj = points.next()

    for (const i of segMask) {
      while (j++ < i) {
        obj = points.next()
      }

      seg.a = obj.value

      obj = points.next()
      seg.b = obj.value

      yield seg
    }
  }

  timesIterator(zoom) {
    if (!zoom) {
      return StreamRLE.decodeCompressedDiffBuf(this.time)
    } else {
      const idxSet = this.idxSet[zoom]
      if (!idxSet) {
        throw new Error(`no idxSet[${zoom}]`)
      }
      return StreamRLE.decodeCompressedDiffBuf2(this.time, idxSet)
    }
  }

  getTimesArray(zoom) {
    const key = `T${this.id}:${zoom}`
    let arr = _lru.get(key)

    if (!arr) {
      arr = Uint16Array.from(this.timesIterator(zoom))
      _lru.set(key, arr)
    }
    return arr
  }

  simplify(zoom) {
    if (!Number.isFinite(zoom)) {
      throw new TypeError("zoom must be a number")
    }

    // prevent another instance of this function from doing this
    this.idxSet[zoom] = null

    const tol = ViewBox.tol(zoom)
    const idxBitSet = Simplifier.simplify(
      this.getPointAccessor(),
      this.px.length / 2,
      tol
    )
    this.idxSet[zoom] = idxBitSet

    /*
     * this.pxGaps contains the index of the start point of every segment
     *  detemined to have an abnormally large gap.  The simplified index
     *  set for this zoom-level (idxSet[zoom]) may not contain that index,
     *  so we search backwards until we find the index for the start point
     *  of the segment that contains the gap.
     */
    if (this.pxGaps) {
      const gapLocs = []
      for (let i = this.pxGaps.length - 1; i >= 0; i--) {
        let gapStart = this.pxGaps[i]
        while (!idxBitSet.has(gapStart)) {
          gapStart--
        }
        gapLocs.push(gapStart)
      }

      /*
       * Now we have the index of this.px at the start of a gap,
       *  but we need an index in terms of the reduced (simplified)
       *  index set.  We want j such that gapStart is the j-th element
       *  (set-bit) of idxBitSet.
       */
      gapLocs.sort()
      const badSegIdx = (this.badSegIdx[zoom] = [])

      const idxIter = idxBitSet.imap()
      let nextIdx = idxIter.next()
      let j = 0
      for (const pxIdx of gapLocs) {
        while (!nextIdx.done && nextIdx.value < pxIdx) {
          nextIdx = idxIter.next()
          j++
        }
        badSegIdx.push(j)
      }
    }
    return this
  }

  /*
   * A segMask is a BitSet containing the index of the start-point of
   *  each segment that is in view and is not bad.  A segment is
   *  considered to be in view if one of its points is in the current
   *  view. A "bad" segment is one that represents a gap in GPS data.
   *  The indices are relative to the current zoom's idxSet mask,
   *  so that the i-th good segment corresponds to the i-th member of
   *  this idxSet.
   */
  makeSegMask() {
    const zoom = ViewBox.zoom
    const points = this.pointsIterator(zoom)

    const segMask = (this.segMask = (this.segMask || new BitSet()).clear())

    let p = points.next().value,
      pIn = inBounds(p),
      s = 0

    for (const nextp of points) {
      const nextpIn = inBounds(nextp)
      if (pIn || nextpIn) {
        segMask.add(s)

        // Make sure that the drawBox includes both points
        if (!pIn) {
          DrawBox.update(p)
        } else if (!nextpIn) {
          DrawBox.update(nextp)
        }
      }
      pIn = nextpIn
      p = nextp
      s++
    }

    if (zoom in this.badSegIdx) {
      const badSegIdx = this.badSegIdx[zoom]
      for (const idx of badSegIdx) {
        segMask.remove(idx)
      }
    }
    return segMask
  }

  drawPathFromSegIter(ctx) {
    const segs = this.iterSegments(),
      transform = ViewBox.px2Container(),
      seg = segs.next().value,
      a = seg.a,
      b = seg.b

    do {
      transform(a)
      ctx.moveTo(a[0], a[1])

      transform(b)
      ctx.lineTo(b[0], b[1])
    } while (!segs.next().done)
  }

  drawPathFromPointArray(ctx) {
    const points = this.getPointAccessor(ViewBox.zoom),
      transformedMoveTo = ViewBox.makeTransform((x, y) => ctx.moveTo(x, y)),
      transformedLineTo = ViewBox.makeTransform((x, y) => ctx.lineTo(x, y))

    this.segMask.forEach((i) => {
      const p1 = points(i)
      const p2 = points(i + 1)
      transformedMoveTo(p1[0], p1[1])
      transformedLineTo(p2[0], p2[1])
    })
  }

  dotPointsFromSegs(now, ds, func) {
    const T = ds._period,
      start = this.ts

    // segments yields the same object seg every time with
    // the same views a and b to the same memory buffer.
    //  So we only need to define the references once.
    const segments = this.iterSegments(),
      seg = segments.next().value,
      p_a = seg.a,
      p_b = seg.b

    const times = this.iterTimeIntervals(),
      timeInterval = times.next().value

    const timeOffset = (ds._timeScale * (now - (start + timeInterval.a))) % T

    // let count = 0;

    do {
      const t_a = timeInterval.a,
        t_b = timeInterval.b,
        lowest = Math.ceil((t_a - timeOffset) / T),
        highest = Math.floor((t_b - timeOffset) / T)

      if (lowest <= highest) {
        // console.log(`${t_a}, ${t_b}`);
        const t_ab = t_b - t_a,
          vx = (p_b[0] - p_a[0]) / t_ab,
          vy = (p_b[1] - p_a[1]) / t_ab

        // console.log(`${p_a}, ${p_b}`);
        for (let j = lowest; j <= highest; j++) {
          const t = j * T + timeOffset,
            dt = t - t_a
          // console.log(t);
          if (dt > 0) {
            const x = p_a[0] + vx * dt
            const y = p_a[1] + vy * dt
            func(x, y)
            // count++;
          }
        }
      }
    } while (!segments.next().done && !times.next().done)

    // return count
  }

  dotPointsFromArray(now, ds, func) {
    const T = ds._period
    const start = this.ts
    const zoom = ViewBox.zoom
    const points = this.getPointAccessor(zoom)
    const times = this.getTimesArray(zoom)
    const i0 = this.segMask.min()
    const timeOffset = (ds._timeScale * (now - (start + times[i0]))) % T

    let count = 0

    for (const i of this.segMask) {
      const t_a = times[i],
        t_b = times[i + 1],
        lowest = Math.ceil((t_a - timeOffset) / T),
        highest = Math.floor((t_b - timeOffset) / T)

      if (lowest <= highest) {
        const p_a = points(i)
        const p_b = points(i + 1)

        const t_ab = t_b - t_a,
          vx = (p_b[0] - p_a[0]) / t_ab,
          vy = (p_b[1] - p_a[1]) / t_ab

        for (let j = lowest; j <= highest; j++) {
          const t = j * T + timeOffset,
            dt = t - t_a
          if (dt > 0) {
            const x = p_a[0] + vx * dt
            const y = p_a[1] + vy * dt
            func(x, y)
            count++
          }
        }
      }
    }
    return count
  }
}

/* helper functions */
function* _pointsIterator(px, idxSet) {
  if (!idxSet) {
    for (let i = 0, len = px.length / 2; i < len; i++) {
      const j = i * 2
      yield px.subarray(j, j + 2)
    }
  } else {
    for (const i of idxSet) {
      const j = i * 2
      yield px.subarray(j, j + 2)
    }
  }
}

function sqDist(p1, p2) {
  const [x1, y1] = p1
  const [x2, y2] = p2
  return (x2 - x1) ** 2 + (y2 - y1) ** 2
}
