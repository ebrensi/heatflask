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
import { quartiles } from "../appUtil.js"
import { dotSettings } from "./Defaults.js"
/*
 * This is meant to be a LRU cache for stuff that should go away
 * if it is not used for a while. For now we just use a Map.
 */
const _lru = new Map()

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
const ZSCORE_CUTOFF = 5

// Alternatively we can use IQR for outlier detection
// It is slower since we must sort the values
const IQR_MULT = 3

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

    // stdev (Z-score) method for determining outliers
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

    // // IQR method for determining outliers (it appears to be much slower)
    // const { q3, iqr } = quartiles(sqDists)
    // const upperFence = q3 + IQR_MULT * iqr
    // const dOutliers2 = []
    // for (let i = 0, len = n - 1; i < len; i++) {
    //   if (sqDists[i] > upperFence) {
    //     dOutliers2.push(i)
    //   }
    // }

    if (dOutliers.length) {
      this.pxGaps = dOutliers
      // console.log({dOutliers, dOutliers2})

      // this.selected = true
      // const dist = hist(zScores, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
      // console.log({dStats, zScores, dist, dOutliers})
    }
  }

  /**
   * The square distance between to successive points in this.px
   * @param  {number} idx
   * @return {number}
   */
  gapAt(idx) {
    const p = this.getPointAccessor()
    return sqDist(p(idx), p(idx + 1))
  }

  /**
   * Indicates whether this Activity is at least paritally in the current view
   */
  inMapBounds() {
    return ViewBox.overlaps(this.pxBounds)
  }

  /**
   * Indicates whther this Activity is completely in the current view
   * (so we don't need to compute a segMask)
   */
  containedInMapBounds() {
    const pxB = this.pxBounds
    const southWest = pxB.subarray(0, 2)
    const northEast = pxB.subarray(2, 4)
    return ViewBox.contains(southWest) && ViewBox.contains(northEast)
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
        // throw new Error(`no idxSet[${zoom}]`)
        // console.log(`${this.id}: no idxSet[${zoom}]`)
        return
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

  /**
   * Construct the reduced idxSet for a given zoom-level. An idxSet is a
   * set of indices indicating the subset of px that we will use at the
   * given zoom level.
   * @param  {number} zoom [description]
   */
  makeIdxSet(zoom) {
    if (!Number.isFinite(zoom)) {
      throw new TypeError("zoom must be a number")
    }

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
  updateSegMask() {
    const zoom = ViewBox.zoom

    /* Later we will compare this segMask with the last one so that we only draw or erase
     * parts of the path that have come into view or are no longer on screen
     */
    if (!this.segMask) this.segMask = new BitSet()

    // console.log(this.id + "----- updating segmask ---------")
    if (this.containedInMapBounds()) {
      /*
       * If this activity is completely contained in the ViewBox then we
       * already know every segment is included.  Explicitly creating a full
       * segMask and updating DrawBox with the bounds saves some work.
       */
      const pxB = this.pxBounds
      const southWest = pxB.subarray(0, 2)
      const northEast = pxB.subarray(2, 4)
      DrawBox.update(southWest)
      DrawBox.update(northEast)

      if (this._containedInMapBounds) {
        // console.log(~~performance.now() + " still contained")
        return this.segMask
      }

      const n = this.idxSet[zoom].size()
      this.segMask.clear().resize(n)
      this.segMask.words.fill(~0, 0, n >> 5)
      this.segMask.words[n >> 5] = 2 ** (n % 32) - 1
      this._containedInMapBounds = true
      // console.log(~~performance.now() + " contained")
    } else {
      this._containedInMapBounds = false
      const points = this.getPointAccessor(zoom)
      const n = this.idxSet[zoom].size()
      const segMask = this.segMask.clear().resize(n)

      let p = points(0)
      let pIn = ViewBox.contains(p)
      if (pIn) DrawBox.update(p)
      for (let i = 0; i < n - 1; i++) {
        const nextp = points(i + 1)
        const nextpIn = ViewBox.contains(nextp)
        if (nextpIn) DrawBox.update(nextp)

        /*
         * If either endpoint of the segment is contained in ViewBox
         * bounds then include this segment index and update
         * DrawBox with both endpoints
         */
        if (pIn) {
          segMask.add(i)
          if (!nextpIn) DrawBox.update(nextp)
        } else if (nextpIn) {
          segMask.add(i)
          if (!pIn) DrawBox.update(p)
        }
        pIn = nextpIn
        p = nextp
      }
    }

    if (zoom in this.badSegIdx) {
      const badSegIdx = this.badSegIdx[zoom]
      for (const idx of badSegIdx) {
        this.segMask.remove(idx)
      }
    }

    if (!this._containedInMapBounds)
      // console.log(~~performance.now() + " " + this.segMask.toString(1))

    if (this.segMask.isEmpty()) return

    return this.segMask
  }

  resetSegMask() {
    if (!this.lastSegMask) {
      this.lastSegMask = new BitSet()
      this._segMaskUpdates = new BitSet()
    }
    this.lastSegMask.clear()
    this._containedInMapBounds = undefined
  }

  /**
   * We use this for partial redraws
   * @return {BitSet} The set of segments that have become visible
   * since the last draw.
   */
  getSegMaskUpdates() {
    if (!this.segMask.difference_size(this.lastSegMask)) {
      // console.log(~~performance.now() + " no new segs")
      this.segMask.clone(this.lastSegMask)
      return
    }

    const newSegs = this.segMask.new_difference(
      this.lastSegMask,
      this._segMaskUpdates
    )

    // console.log(~~performance.now() + " update")
    // console.log("lsm: " + this.lastSegMask.toString(1))
    // console.log(" sm: " + this.segMask.toString(1))
    // console.log("new: " + newSegs.toString(1))
    /*
     * We include an edge segment (at the edge of the screen)
     * even if it was in the last draw
     */
    const lsm = this.lastSegMask
    let lastSeg
    newSegs.forEach((s) => {
      const beforeGap = lastSeg && lastSeg + 1
      const afterGap = s && s - 1
      if (lastSeg !== afterGap) {
        if (beforeGap && lsm.has(beforeGap)) newSegs.add(beforeGap)
        if (afterGap && lsm.has(afterGap)) newSegs.add(afterGap)
      }
      lastSeg = s
    })
    // lastSegMask = segMask
    this.segMask.clone(this.lastSegMask)
    return newSegs
  }

  /**
   * execute a function func(x1, y1, x2, y2) on each currently in-view
   * segment (x1,y1) -> (x2, y2) of this Activity. The default is to
   * only use segments that have changed since the last segMask update.
   * Set forceAll to force all currently viewed segments.
   * @param  {function} func func(x1, y1, x2, y2)
   * @param  {BitSet} [segMask] the set of segments
   */
  forEachSegment(func, segMask) {
    if (!segMask) segMask = this.segMask
    if (!segMask) return 0

    let count = 0
    const points = this.getPointAccessor(ViewBox.zoom)
    if (!points) return 0

    segMask.forEach((i) => {
      const p1 = points(i)
      const p2 = points(i + 1)
      func(p1[0], p1[1], p2[0], p2[1])
      count++
    })
    return count
  }

  /**
   * execute a function func(x,y) on each dot point of this Activity
   * given time now (in seconds since epoch) and dot Specs.
   * @param  {number} now
   * @param  {Object} ds
   * @param  {function} func
   * @param  {BitSet} [segMask] a set of segments over which to place dots
   * @returns {number} number of dot points
   */
  forEachDot(nowInSecs, func, segMask) {
    const ds = { T: dotSettings._period, timeScale: dotSettings._timeScale }
    const { T, timeScale } = ds
    const start = this.ts
    const zoom = ViewBox.zoom
    const points = this.getPointAccessor(zoom)
    if (!points) return 0

    if (!segMask) segMask = this.segMask
    if (!segMask) return 0

    const i0 = segMask.min()
    const times = this.getTimesArray(zoom)
    const timeOffset = (timeScale * (nowInSecs - (start + times[i0]))) % T

    let count = 0
    segMask.forEach((i) => {
      const t_a = times[i]
      const t_b = times[i + 1]
      const lowest = Math.ceil((t_a - timeOffset) / T)
      const highest = Math.floor((t_b - timeOffset) / T)

      if (lowest <= highest) {
        const p_a = points(i)
        const p_b = points(i + 1)

        const t_ab = t_b - t_a
        const vx = (p_b[0] - p_a[0]) / t_ab
        const vy = (p_b[1] - p_a[1]) / t_ab

        for (let j = lowest; j <= highest; j++) {
          const t = j * T + timeOffset
          const dt = t - t_a
          if (dt > 0) {
            const x = p_a[0] + vx * dt
            const y = p_a[1] + vy * dt
            func(x, y)
            count++
          }
        }
      }
    })
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
