/*
 * This module contains definitions for the Activity and ActivityCollection
 *  classes.
 */
import { LngLatBounds } from "maplibre-gl"
import { simplify as simplifyPath } from "./Simplifier"
import { makePT, pxPerMeter } from "./CRS"
import { Bounds } from "../Bounds"
import { RunningStatsCalculator } from "./stats"
import { BitSet } from "../BitSet"

import { ImportedActivity, ACTIVITY_FIELDNAMES as A } from "../DataImport"
import { ActivityType, activity_pathcolor } from "../Strava"

interface SegMask extends BitSet {
  zoom?: number
}

type tuple2 = [number, number] | Float32Array

/** Seconds since the UNIX epoch. Mirrors the backend's Types.epoch. It was
 * referenced by timeAt() and update_dotlocs() without ever being declared,
 * which tsc reports as "Cannot find name 'epoch'". */
type epoch = number

/** [lat, lng] -> zoom-0 world pixels, in place. Typed loosely because the
 * tracks are converted through Float32Array windows. */
const latLng2px = <(p: [number, number] | Float32Array) => void>(
  (<unknown>makePT(0))
)

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
  /** undefined for index entries made before moving time was stored */
  moving_time?: number
  name: string
  selected: boolean
  ts: number
  tsLocal: Date
  llBounds: LngLatBounds
  pxBounds: Bounds

  /** World pixels per metre of height, at this activity's latitude */
  zScale: number
  /** Metres added to the recorded altitude so the track sits on the terrain
   * model rather than wherever the GPS or barometer put it. See
   * HeatflaskLayer.calibrateAltitudes. */
  altOffset: number
  /** The zoom level altOffset was measured at, or undefined if never */
  altCalibratedZoom?: number
  colors: { path: string; dot: string }

  streams: {
    px: Float32Array
    altitude: Int16Array
    time: Uint32Array
  }

  // segment specs
  idxSet: { [zoom: number]: BitSet }
  /** idxSet[zoom] as a plain array: idxArray[zoom][i] is its i-th member.
   * update_dotlocs runs every frame and needs random access, which the BitSet
   * only gives through a forward-seeking closure. */
  idxArray: { [zoom: number]: Uint32Array }
  badSegIdx: { [zoom: number]: number[] }
  segMask: SegMask
  pxGaps: null | number[]

  _containedInMapBounds: boolean

  // average_speed: number
  // tr: HTMLTableRowElement
  /** index of this Activity in ActivityCollection's itemsArray, assigned by
   * ActivityCollection.reset(). Was declared only in a comment. */
  idx?: number

  constructor(a: ImportedActivity) {
    const offset = a[A.UTC_LOCAL_OFFSET]
    const bounds = a[A.LATLNG_BOUNDS]

    this.id = a[A.ID]
    this.type = <ActivityType>a[A.TYPE]
    this.total_distance = a[A.DISTANCE_METERS]
    this.elapsed_time = a[A.TIME_SECONDS]
    this.moving_time = a[A.MOVING_SECONDS]
    this.name = a[A.NAME]
    this.ts = a[A.UTC_START_TIME]
    /* ts and offset are epoch *seconds* (the backend stores
     * int(to_datetime(start_date).timestamp())), but Date() takes
     * milliseconds -- without the factor every activity dated to
     * 21 January 1970. */
    this.tsLocal = new Date((this.ts + offset) * 1000)
    /* The backend sends corners as [lat, lng]; MapLibre wants [lng, lat] */
    this.llBounds = new LngLatBounds(
      [bounds.SW[1], bounds.SW[0]],
      [bounds.NE[1], bounds.NE[0]]
    )
    this.pxBounds = new Bounds()
    for (const corner of [bounds.SW, bounds.NE]) {
      const p = <[number, number]>[corner[0], corner[1]]
      latLng2px(p)
      this.pxBounds.update(p[0], p[1])
    }
    this.zScale = pxPerMeter(this.llBounds.getCenter().lat)
    this.altOffset = 0

    this.colors = {
      // path color is determined by activity type
      path: activity_pathcolor(this.type),

      // dot color is set by a color selecting algorithm later
      dot: null,
    }

    // this.selected = false
    // this.tr = null

    this.idxSet = {} // BitSets of indices of px for each level of zoom
    this.idxArray = {} // the same sets, as arrays
    this.badSegIdx = {} // locations of gaps in data for each level of zoom
    // this.segMask = null // BitSet indicating which segments are in view
    // this.pxGaps = null

    // decode polyline format into an Array of [lat, lng] points
    let n = a.streams.time.length
    if (a.streams.altitude.length != n || a.streams.latlng.length / 2 !== n)
      throw "length mismatch"

    const included = new BitSet(n)

    /*
     * We will compute some stats on interval lengths to
     *  detect anomalous big gaps between data-points.
     */
    const dStats = new RunningStatsCalculator()
    const sqDists = []

    // Conmvert all the latlngs to rectangular points
    for (let i = 0; i < n; i++) {
      const p = 2 * i
      latLng2px(a.streams.latlng.subarray(p, p + 2))
    }

    const px = a.streams.latlng

    let p0 = px.subarray(0, 2)
    included.add(0)
    for (let i = 1; i < n; i++) {
      const p = 2 * i
      const p1 = px.subarray(p, p + 2)
      const sd = sqDist(p0, p1)
      p0 = p1

      //  Ignore any point with zero distance from the previous one
      if (sd === 0) continue

      included.add(i)
      const logSd = Math.log(sd)
      dStats.update(logSd)
      sqDists.push(logSd)
    }

    n = included.size()
    this.streams = {
      altitude: new Int16Array(n),
      time: new Uint32Array(n),
      px: new Float32Array(2 * n),
    }

    let j = 0
    included.forEach((i) => {
      this.streams.altitude[j] = a.streams.altitude[i]
      this.streams.time[j] = a.streams.time[i]
      this.streams.px[2 * j] = px[2 * i]
      this.streams.px[2 * j + 1] = px[2 * i + 1]
      j++
    })

    // stdev (Z-score) method for determining outliers
    const dMean = dStats.mean
    const dStdev = dStats.populationStdev
    // const zScores = []
    const devTol = ZSCORE_CUTOFF * dStdev

    const pxGaps = []
    for (let i = 0, len = n - 1; i < len; i++)
      if (sqDists[i] - dMean > devTol) pxGaps.push(i)
    this.pxGaps = pxGaps.length ? pxGaps : null
  }

  /** The square distance between to successive points in this.px
   */
  gapAt(idx: number): number {
    return sqDist(this.pointAt(idx), this.pointAt(idx + 1))
  }

  /** A fuction that provides direct access to the i-th point [x,y] of this.px
   *
   * Each point returned by the accessor function is a window into the
   * actual px array so modifying it will modify the the px array.
   */
  pointAt(i: number): Float32Array {
    const j = i << 1
    return this.streams.px.subarray(j, j + 2)
  }

  /**
   * Construct the reduced idxSet for a given zoom-level. An idxSet is a
   * set of indices indicating the subset of px that we will use at the
   * given zoom level.
   */
  makeIdxSet(zoom: number): Activity {
    if (zoom in this.idxSet) return

    const idxBitSet = simplifyPath(
      (i) => this.pointAt(i),
      this.streams.px.length / 2,
      1 / 2 ** zoom
    )
    this.idxSet[zoom] = idxBitSet

    /* Not idxBitSet.array(Uint32Array): an operator-precedence slip there
     * ignores the constructor it is given. */
    const idxArray = new Uint32Array(idxBitSet.size())
    let pos = 0
    idxBitSet.forEach((i) => (idxArray[pos++] = i))
    this.idxArray[zoom] = idxArray

    /*
     * this.pxGaps contains index of the first point of every segment
     *  detemined to have an abnormally large gap.  The simplified index
     *  set for this zoom-level (idxSet[zoom]) may not contain that index,
     *  so we search backwards until we find the index for the start point
     *  of the segment that contains the gap.
     */
    if (this.pxGaps) {
      const gapLocs: number[] = []
      for (let i = this.pxGaps.length - 1; i >= 0; i--) {
        let gapStart = this.pxGaps[i]
        while (!idxBitSet.has(gapStart)) gapStart--
        gapLocs.push(gapStart)
      }

      /*
       * Now we have the index of this.px at the start of a gap,
       *  but we need an index in terms of the reduced (simplified)
       *  index set.  We want j such that gapStart is the j-th element
       *  (set-bit) of idxBitSet.
       */
      gapLocs.sort()
      const badSegIdx: number[] = []

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
      if (badSegIdx.length) this.badSegIdx[zoom] = badSegIdx
    }
    return this
  }

  /** A segMask is a BitSet containing the index of the start-point of
   *  each segment that is in view and is not bad.  A segment is
   *  considered to be in view if one of its points is in the current
   *  view. A "bad" segment is one that represents a gap in GPS data.
   *  The indices are relative to the current zoom's idxSet mask,
   *  so that the i-th good segment corresponds to the i-th member of
   *  this idxSet.
   */
  updateSegMask(viewportPxBounds: Bounds, zoom: number): SegMask {
    /* The zoom this mask was last built at, captured before we overwrite it.
     * The fully-in-view fast path below needs it to tell whether the index
     * set the mask was derived from has changed. */
    const lastZoom = this.segMask ? this.segMask.zoom : undefined

    if (!this.segMask) this.segMask = new BitSet()
    this.segMask.zoom = zoom

    // console.log(this.id + "----- updating segmask ---------")
    if (viewportPxBounds.containsBounds(this.pxBounds)) {
      /* If this activity is completely contained in the viewport then we
       * already know every segment is included and we quickly create a full segMask
       */
      if (this._containedInMapBounds && zoom === lastZoom) {
        // still fully contained, as it was last time, at the same zoom
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
        const p = this.pointAt(idx)
        if (viewportPxBounds.contains(p[0], p[1])) {
          /* The viewport contains this point so we include
           * the segments before and after it */
          if (lastAdded !== i - 1) segMask.add(i - 1)
          segMask.add((lastAdded = i))
        }
      }

      // Check the last point
      if (lastAdded !== nSegs - 1) {
        const p = this.pointAt(seekIdx(nSegs))
        if (viewportPxBounds.contains(p[0], p[1])) segMask.add(nSegs - 1)
      }
    }

    if (zoom in this.badSegIdx) {
      const badSegIdx = this.badSegIdx[zoom]
      for (const idx of badSegIdx) this.segMask.remove(idx)
    }

    if (this.segMask.isEmpty()) return
    return this.segMask
  }

  /** timestamp at the ith data-point */
  timeAt(i: number): epoch {
    return this.streams.time[i] + this.ts
  }

  /** altitude at the ith data-point, in metres.
   * (The backend used to send decimetres; it sends metres now, because the
   * 10x scale overflowed the stream codec.) */
  altitudeAt(i: number): number {
    return this.streams.altitude[i]
  }

  /** Height of the i-th point, in world pixels, the same units as z above */
  zAt(i: number): number {
    return (this.streams.altitude[i] + this.altOffset) * this.heightScale()
  }

  /** zScale once the altitude has been anchored to the terrain model, and 0
   * until then. Recorded altitude is metres above sea level, so applied raw
   * over terrain that has not loaded -- which reads as flat, at sea level --
   * a track floats kilometres above the map. On the ground is the better
   * guess. */
  heightScale(): number {
    return this.altCalibratedZoom === undefined ? 0 : this.zScale
  }

  /**
   * Call func(start, end) for each run of consecutive in-view segments, where
   * start and end are indices into the current zoom's index array: the run
   * is the polyline through points idxArray[start] .. idxArray[end].
   */
  forEachSegmentRun(func: (start: number, end: number) => void): number {
    const segMask = this.segMask
    if (!segMask) return 0

    let runStart = -1
    let last = -2
    let count = 0
    for (const i of segMask) {
      if (i !== last + 1) {
        if (runStart >= 0) func(runStart, last + 1)
        runStart = i
      }
      last = i
      count++
    }
    if (runStart >= 0) func(runStart, last + 1)
    return count
  }
}

function sqDist(p1: tuple2, p2: tuple2) {
  const [x1, y1] = p1
  const [x2, y2] = p2
  return (x2 - x1) ** 2 + (y2 - y1) ** 2
}
