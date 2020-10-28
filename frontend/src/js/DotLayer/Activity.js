import { latLngBounds } from "leaflet"
import * as Polyline from "./Codecs/Polyline.js"
import * as StreamRLE from "./Codecs/StreamRLE.js"
import { ATYPE } from "../strava.js"
import * as ViewBox from "./ViewBox"
import * as DrawBox from "./DrawBox"
import * as Simplifier from "./Simplifier.js"
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
 * Any two consecutive points that will resolve to a pixel distance
 * greater than this value is considered an anomaly and any segment
 * including that gap will be ignored.
 *
 * These gaps usually come up when there is a pause in recording
 * while the person in still moving. If the gap is big enough, it
 * results in a long straight line segment that is inaccurate
 * and looks bad.
 *
 * @type {Number}
 */
const MAX_PX_GAP = 200 /* px units */

/**
 * @class Activity
 */
export class Activity {
  constructor({
    _id,
    type,
    name,
    total_distance,
    elapsed_time,
    ts,
    bounds,
    polyline,
    time,
    n,
  }) {
    this.n = n
    this.id = +_id
    this.type = type
    this.total_distance = total_distance
    this.elapsed_time = elapsed_time
    this.name = name
    this.selected = false
    this.tr = null

    this.pathColor = ATYPE.pathColor(type)
    this.dotColor = null

    // timestamp comes from backend as a UTC-timestamp, local offset pair
    const [utc, offset] = ts
    this.ts = utc
    this.tsLocal = new Date((utc + offset * 3600) * 1000)

    this.time = StreamRLE.transcode2CompressedBuf(time)

    this.llBounds = latLngBounds(bounds.SW, bounds.NE)
    this.pxBounds = ViewBox.latLng2pxBounds(this.llBounds)

    this.idxSet = {} // BitSets of indices of px for each level of zoom
    this.pxGaps = {} // locations of gaps in data for each level of zoom

    this.segMask = null // BitSet indicating which segments are in view

    // decode polyline format into an Array of [lat, lng] points
    const points = Polyline.decode2Buf(polyline, n)

    // make baseline projection to rectangular coordinates in-place
    for (let i = 0, len = points.length; i < len; i += 2) {
      ViewBox.latLng2px(points.subarray(i, i + 2))
    }

    this.px = points

    /*
     * We will compute some stats on interval lengths to
     *  detect anomalous big gaps in the data.
     */
    const dStats = new RunningStatsCalculator()
    const sqDists = []
    for (let i = 0, len = points.length / 2 - 1; i < len; i++) {
      const j = 2 * i
      const p1 = points.subarray(j, j + 2)
      const p2 = points.subarray(j + 2, j + 4)
      const sd = sqDist(p1, p2)
      dStats.update(sd)
      sqDists.push(sd)
    }

    const dMean = dStats.mean
    const dStdev = dStats.populationStdev
    const dTol = 3 * dStdev
    const dOutliers = []
    for (let i = 0, len = n - 1; i < len; i++) {
      if (Math.abs(sqDists[i] - dMean) > dTol) {
        dOutliers.push[i]
      }
    }

    /*
     * Do the same with time intervals
     */
    const tStats = new RunningStatsCalculator()
    for (let i = 0, len = time.length; i < len; i++) {
      const dt = time[i]
      if (Array.isArray(dt)) {
        const dt2 = dt[0]
        for (let j = 0; j < dt[1]; j++) {
          tStats.update(dt2)
        }
      } else {
        tStats.update(dt)
      }
    }
    const tMean = tStats.mean
    const tStdev = tStats.populationStdev
    const tTol = 3 * tStdev
    const tOutliers = []
    let k = 0
    for (let i = 0, len = time.length; i < len; i++) {
      const dt = time[i]
      if (Array.isArray(dt)) {
        const dt2 = dt[0]
        for (let j = 0; j < dt[1]; j++) {
          if (Math.abs(dt2 - tMean) > tTol) {
            tOutliers.push(k)
          }
          k++
        }
      } else {
        if (Math.abs(dt - tMean) > tTol) {
          tOutliers.push(k)
        }
        k++
      }
    }
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
      return StreamRLE.decodeCompressedBuf(this.time)
    } else {
      const idxSet = this.idxSet[zoom]
      if (!idxSet) {
        throw new Error(`no idxSet[${zoom}]`)
      }
      return StreamRLE.decodeCompressedBuf2(this.time, idxSet)
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

    if (zoom in this.idxSet) {
      return this
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

    this.segMask = (this.segMask || new BitSet()).clear()

    let p = points.next().value,
      p_In = inBounds(p),
      s = 0

    for (const nextp of points) {
      const nextp_In = inBounds(nextp)
      if (p_In || nextp_In) {
        this.segMask.add(s)
      }
      p_In = nextp_In
      s++
    }

    // const pxg = this.pxGaps[zoom]
    // if (pxg) {
    //   for (let i = 0, len = pxg.length; i < len; i++) {
    //     this.segMask.remove(pxg[i])
    //   }
    // }

    // console.log(`${this.id}: segmask`)

    return this
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

  *dotPointsIterFromSegs(now) {
    const ds = this.getDotSettings(),
      T = ds._period,
      start = this.ts,
      p = [NaN, NaN]

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
            p[0] = p_a[0] + vx * dt
            p[1] = p_a[1] + vy * dt
            // drawDot(p);
            yield p
            // count++;
          }
        }
      }
    } while (!segments.next().done && !times.next().done)

    // return count
  }

  dotPointsFromArray(now, ds, func) {
    const T = ds._period,
      start = this.ts,
      zoom = ViewBox.zoom,
      points = this.getPointAccessor(zoom),
      times = this.getTimesArray(zoom),
      i0 = this.segMask.min()

    const timeOffset = (ds._timeScale * (now - (start + times[i0]))) % T

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
            func(p_a[0] + vx * dt, p_a[1] + vy * dt)
          }
        }
      }
    }
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
  return (x2 - x1)**2 + (y2-y1)**2
}
