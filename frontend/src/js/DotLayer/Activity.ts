/*
 * This module contains definitions for the Activity and ActivityCollection
 *  classes.
 */
import { LatLngBounds } from "leaflet"
import { simplify as simplifyPath } from "./Simplifier"
import { latLng2pxBounds, latLng2px } from "./ViewBox"
import { RunningStatsCalculator } from "./stats"
import { BitSet } from "../BitSet"

import type { Bounds } from "../Bounds"
import { ImportedActivity, ACTIVITY_FIELDNAMES as A } from "../DataImport"
import { ActivityType, activity_pathcolor } from "../Strava"

import {
  compress as VByteCompress,
  compressedSizeInBytes as cSize,
} from "../VByte"

interface SegMask extends BitSet {
  zoom?: number
}

type tuple2 = [number, number] | Float32Array
type segFunc = (x0: number, y0: number, x1: number, y1: number) => void
type pointFunc = (x: number, y: number) => void

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
 */
const ZSCORE_CUTOFF = 5

export class Activity {
  id: number
  type: ActivityType
  total_distance: number
  elapsed_time: number
  name: string
  selected: boolean
  ts: number
  tsLocal: Date
  llBounds: LatLngBounds
  pxBounds: Bounds
  colors: { path: string; dot: string }

  px: Float32Array
  time: ArrayBuffer

  // segment specs
  idxSet: { [zoom: number]: BitSet }
  badSegIdx: { [zoom: number]: number[] }
  segMask: SegMask
  lastSegMask: SegMask
  _segMaskUpdates: SegMask
  pxGaps: number[]

  _containedInMapBounds: boolean

  // average_speed: number
  // tr: HTMLTableRowElement
  // idx?: number

  constructor(a: ImportedActivity) {
    const offset = a[A.UTC_LOCAL_OFFSET]
    const bounds = a[A.LATLNG_BOUNDS]

    this.id = a[A.ID]
    this.type = <ActivityType>a[A.TYPE]
    this.total_distance = a[A.DISTANCE_METERS]
    this.elapsed_time = a[A.TIME_SECONDS]
    this.name = a[A.NAME]
    this.ts = a[A.UTC_START_TIME]
    this.tsLocal = new Date((this.ts + offset * 3600) * 1000)
    this.llBounds = new LatLngBounds(bounds.SW, bounds.NE)
    this.pxBounds = latLng2pxBounds(this.llBounds)

    this.colors = {
      // path color is determined by activity type
      path: activity_pathcolor(this.type),

      // dot color is set by a color selecting algorithm later
      dot: null,
    }

    // this.selected = false
    // this.tr = null

    this.idxSet = {} // BitSets of indices of px for each level of zoom
    this.badSegIdx = {} // locations of gaps in data for each level of zoom
    // this.segMask = null // BitSet indicating which segments are in view
    // this.pxGaps = null

    // decode polyline format into an Array of [lat, lng] points
    let n = a.streams.time.length
    if (a.streams.altitude.length != n || a.streams.latlng.length / 2 !== n)
      throw "length mismatch"

    const points = new Float32Array(n * 2)
    const excluded = new BitSet(n)

    /*
     * We will compute some stats on interval lengths to
     *  detect anomalous big gaps in the data.
     */
    const dStats = new RunningStatsCalculator()
    const sqDists = []

    const latlngs = a.streams.latlng

    // Set the first point of points to be the projected first latlng pair
    points.set(latLng2px(latlngs.subarray(0, 2)), 0)

    let j = 2 // index of the j-th element of points
    let p1 = points.subarray(0, 2)
    for (let i = 1; i < n; i++) {
      const loc = 2 * i
      const latlng = latlngs.subarray(loc, loc + 2)
      const p2 = latLng2px(latlng)
      const sd = sqDist(p1, p2)
      if (!sd) {
        /*  We ignore any two successive points with zero distance
         *  this might cause problems so look out for it
         */
        excluded.add(i)
        continue
      }
      const logSd = Math.log(sd)
      dStats.update(logSd)
      sqDists.push(logSd)

      points.set(p2, j)
      p1 = points.subarray(j, j + 2)
      j = j + 2
    }

    if (excluded.isEmpty()) {
      this.px = points
      // transcode returns a generator so we need to
      // go through one to get the size
      const size = cSize(a.streams.time)
      this.time = VByteCompress(a.streams.time, size)
    } else {
      console.log("excluded", excluded.array())
      // n = sqDists.length + 1
      // this.px = points.slice(0, n * 2)

      // // Some points were discarded so we need to adjust the time diffs
      // const newTimes = decode(time, 0, excluded)
      // const transcoded = encode(newTimes)
      // this.time = VByteCompress(transcoded, n)

      // console.log(`${_id}: excluded ${excludeMask.size()} points`)
    }

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

    if (dOutliers.length) {
      this.pxGaps = dOutliers
      // console.log({dOutliers, dOutliers2})
    }
  }

  /**
   * The square distance between to successive points in this.px
   */
  gapAt(idx: number): number {
    return sqDist(this.pointAccessor(idx), this.pointAccessor(idx + 1))
  }

  /**
   * This returns a fuction that provides direct access to the
   * i-th point [x,y] of this.px
   *
   * Each point returned by the accessor function is a window into the
   * actual px array so modifying it will modify the the px array.
   */
  pointAccessor(i: number): Float32Array {
    const j = i << 1
    return this.px.subarray(j, j + 2)
  }

  /**
   * Construct the reduced idxSet for a given zoom-level. An idxSet is a
   * set of indices indicating the subset of px that we will use at the
   * given zoom level.
   */
  makeIdxSet(zoom: number): Activity {
    if (!Number.isFinite(zoom)) {
      throw new TypeError("zoom must be a number")
    }

    if (zoom in this.idxSet) return

    const idxBitSet = simplifyPath(
      (i) => this.pointAccessor(i),
      this.px.length / 2,
      1 / 2 ** zoom
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
      const gapLocs: number[] = []
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
  updateSegMask(viewportPxBounds: Bounds, zoom: number): SegMask {
    /* Later we will compare this segMask with the last one so that
     *  we only draw or erase parts of the path that have come
     *  into view or are no longer on screen
     */
    if (!this.segMask) {
      this.segMask = new BitSet()
      this.lastSegMask = new BitSet()
      this._segMaskUpdates = new BitSet()
    } else {
      this.lastSegMask = this.segMask.clone(this.lastSegMask)
      this.lastSegMask.zoom = this.segMask.zoom
    }

    this.segMask.zoom = zoom

    // console.log(this.id + "----- updating segmask ---------")
    if (viewportPxBounds.containsBounds(this.pxBounds)) {
      /*
       * If this activity is completely contained in the viewport then we
       * already know every segment is included and we quickly create a full segMask
       */
      if (this._containedInMapBounds && zoom === this.lastSegMask.zoom) {
        // This is still contained (and was last time)
        this._segMaskUpdates.clear()
        return this.segMask
      }

      this._containedInMapBounds = true
      const nSegs = this.idxSet[zoom].size() - 1
      const segMask = this.segMask.clear().resize(nSegs)
      for (let i = 0; i < nSegs; i++) segMask.add(i)
      // const nWords = (nSegs + 32) >>> 5
      // this.segMask.words.fill(~0, 0, nWords-1)
      // this.segMask.words[nWords - 1] = 2 ** (nWords % 32) - 1
    } else {
      this._containedInMapBounds = false
      const idxSet = this.idxSet[zoom]
      const nPoints = idxSet.size()
      const nSegs = nPoints - 1
      const segMask = this.segMask.clear().resize(nSegs)
      const seekIdx = idxSet.iterator()
      let lastAdded = -1

      for (let i = 0; i < nSegs; i++) {
        const idx = seekIdx(i)
        const p = this.pointAccessor(idx)
        if (viewportPxBounds.contains(p[0], p[1])) {
          // The viewport contains this point so we include
          // the segments before and after it
          if (lastAdded !== i - 1) segMask.add(i - 1)
          segMask.add((lastAdded = i))
        }
      }

      // Check the last point
      if (lastAdded !== nSegs - 1) {
        const p = this.pointAccessor(seekIdx(nSegs))
        if (viewportPxBounds.contains(p[0], p[1])) segMask.add(nSegs - 1)
      }
    }

    if (zoom in this.badSegIdx) {
      const badSegIdx = this.badSegIdx[zoom]
      for (const idx of badSegIdx) this.segMask.remove(idx)
    }

    if (!this._containedInMapBounds && this.segMask.isEmpty()) {
      this._segMaskUpdates.clear()
      return
    }

    /*
     * Now we have a current and a last segMask
     */
    const zoomLevelChanged = this.segMask.zoom !== this.lastSegMask.zoom
    if (zoomLevelChanged) {
      this.segMask.clone(this._segMaskUpdates)
      this._segMaskUpdates.zoom = this.segMask.zoom
    } else {
      const newSegs = this.segMask.difference(
        this.lastSegMask,
        this._segMaskUpdates
      )
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
    }

    if (!this.segMask.isEmpty()) return this.segMask
  }

  /**
   * execute a function func(x1, y1, x2, y2) on each currently in-view
   * segment (x1,y1) -> (x2, y2) of this Activity. drawDiff specifies to
   * only use segments that have changed since the last segMask update.
   * Set forceAll to force all currently viewed segments.
   */
  forEachSegment(func: segFunc, drawDiff: boolean): number {
    const segMask = drawDiff ? this._segMaskUpdates : this.segMask
    if (!segMask) return 0

    let count = 0
    const zoom = segMask.zoom
    const idx = this.idxSet[zoom].iterator()
    let lasti: number
    let lastidx2: number
    let lastp2: Float32Array

    segMask.forEach((i) => {
      const reuse = i === lasti + 1
      lasti = i

      const idx1 = reuse ? lastidx2 : idx(i)
      const idx2 = (lastidx2 = idx(i + 1))

      const p1 = reuse ? lastp2 : this.pointAccessor(idx1)
      const p2 = (lastp2 = this.pointAccessor(idx2))
      if (p2[0] || p2[1]) func(p1[0], p1[1], p2[0], p2[1])
      count++
    })
    return count
  }

  /**
   * execute a function func(x,y) on each dot point of this Activity
   * given time now (in seconds since epoch) and dot Specs.
   */
  forEachDot(
    func: pointFunc,
    nowInSecs: number,
    T: number,
    drawDiff: boolean
  ): number {
    const segMask = drawDiff ? this._segMaskUpdates : this.segMask
    if (!segMask) return 0

    const zoom = segMask.zoom
    const time = uncompressVByteRLEIterator(this.time, this.ts)
    const idx = this.idxSet[zoom].iterator()

    // we do this because first time is always 0 and time(0) corresponds
    //  to pointAccessor(1)
    let lasti: number
    let lastIdx1: number
    let lasttb = 0

    let count = 0
    // segMask[i] gives the idx of the start of the i-th segment
    segMask.forEach((i) => {
      const reuse = i === lasti + 1
      lasti = i

      const idx0 = reuse ? lastIdx1 : idx(i)
      const idx1 = (lastIdx1 = idx(i + 1))

      if (idx1 === undefined) return

      const ta = reuse ? lasttb : time(idx0)
      const tb = (lasttb = time(idx1))

      const kLow = Math.ceil((nowInSecs - tb) / T)
      const kHigh = Math.floor((nowInSecs - ta) / T)

      if (kLow > kHigh) return

      const [pax, pay] = this.pointAccessor(idx0)
      const [pbx, pby] = this.pointAccessor(idx1)

      const tab = tb - ta
      const vx = (pbx - pax) / tab
      const vy = (pby - pay) / tab

      for (let k = kLow; k <= kHigh; k++) {
        const t = nowInSecs - k * T
        const dt = t - ta
        func(pax + vx * dt, pay + vy * dt)
        count++
      }
    })
    return count
  }
}

function sqDist(p1: tuple2, p2: tuple2) {
  const [x1, y1] = p1
  const [x2, y2] = p2
  return (x2 - x1) ** 2 + (y2 - y1) ** 2
}

/**
 * Returns a function that returns the next encoded member each time
 * it is called.  Optionally it can be called with the index of the next
 * number to return.
 *
 * Another way to describe it is that this returns a sort of element-array
 * S where S(i) is the i-th element, but i must be larger every time S(i)
 * is called.
 */
function uncompressVByteRLEIterator(
  buf: ArrayBuffer,
  runningSum = 0
): (i: number) => number {
  const inbyte = new Int8Array(buf)
  const end = inbyte.length
  let pos = 0
  let reps = 0
  let si = 0
  let v = 0

  return (targetPos: number) => {
    for (;;) {
      do {
        runningSum += v
        if (si++ === targetPos || targetPos === undefined) return runningSum //{ v: runningSum, i: si }
      } while (--reps > 0)

      if (pos >= end) throw RangeError

      for (;;) {
        // get the next value
        let c = inbyte[pos++]
        v = c & 0x7f
        if (c < 0) {
          c = inbyte[pos++]
          v |= (c & 0x7f) << 7
          if (c < 0) {
            c = inbyte[pos++]
            v |= (c & 0x7f) << 14
            if (c < 0) {
              c = inbyte[pos++]
              v |= (c & 0x7f) << 21
              if (c < 0) {
                c = inbyte[pos++]
                v |= c << 28
              }
            }
          }
        }

        // 0 followed by the number of reps specifies a run of repeats
        if (v === 0) reps = NaN
        else if (isNaN(reps)) reps = v
        else break
      }
    }
  }
}
