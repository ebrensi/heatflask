import { latLngBounds } from "leaflet"
import * as Polyline from "./Codecs/Polyline.js"
import * as StreamRLE from "./Codecs/StreamRLE.js"
import { ATYPE } from "../strava.js"
import * as ViewBox from "./ViewBox"
import * as DrawBox from "./DrawBox"
import * as Simplifier from "./Simplifier.js"
import BitSet from "../BitSet.js"

/*
 * This is meant to be a LRU cache for stuff that should go away
 * if it is not used for a while. For now we just use a Map.
 */
const _lru = new Map()

function inBounds(p) {
  return ViewBox.contains(p) && DrawBox.update(p)
}

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

    this.idxSet = {}

    this.segMask = null

    // Buffers. In order to save on overhead we re-use some memory
    this.timeIntervalBuf = { a: NaN, b: NaN }
    this.segmentBuf = {}

    // decode polyline format into an Array of [lat, lng] points
    const points = Polyline.decode2Buf(polyline, n)
    // make baseline projection (latLngs to pixel points at zoom=0) in-place
    for (let i = 0, len = points.length; i < len; i += 2)
      ViewBox.latLng2px(points.subarray(i, i + 2))
    this.px = points
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
    if (zoom === 0) {
      return function (i) {
        const j = i * 2
        return px.subarray(j, j + 2)
      }
    }

    if (!zoom) {
      throw new TypeError(`zoom=${zoom} is invalid`)
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
    if (zoom === 0) {
      return _pointsIterator(this.px)
    }

    if (!zoom) {
      throw new TypeError(`zoom=${zoom} is invalid`)
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
      // TODO: only yield the segment if the points are not too far apart
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
    if (zoom === 0) {
      return StreamRLE.decodeCompressedBuf(this.time)
    } else {
      const idxSet = this.idxSet[zoom]
      if (!idxSet) {
        throw new Error(`no idxSet[${zoom}]`)
      }
      return StreamRLE.decodeCompressedBuf2(this.time, idxSet)
    }
  }

  getTimesAccessor(zoom) {
    const key = `T${this.id}:${zoom}`
    let arr = _lru.get(key)

    if (!arr) {
      arr = Uint16Array.from(this.timesIterator(zoom))
      _lru.set(key, arr)
    }
    return (i) => arr[i]
  }

  /*
  iterTimeIntervals() {
    const zoom = ViewBox.zoom,
      stream = StreamRLE.decodeCompressedBuf2(this.time, this.idxSet[zoom]),
      timeInterval = this.timeIntervalBuf

    let j = 0,
      second = stream.next()
    return this.segMask.imap((idx) => {
      let first = second
      while (j++ < idx) first = stream.next()
      second = stream.next()
      timeInterval.a = first.value
      timeInterval.b = second.value
      return timeInterval
    })
  }
  */

  async simplify(zoom) {
    if (zoom === undefined) {
      zoom = ViewBox.zoom
    }

    if (!(zoom in this.idxSet)) {
      // prevent another instance of this function from doing this
      this.idxSet[zoom] = null

      const subSet = Simplifier.simplify(
        this.getPointAccessor(0),
        this.px.length / 2,
        ViewBox.tol(zoom)
      )
      this.idxSet[zoom] = subSet
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
  async makeSegMask() {
    const points = this.pointsIterator(ViewBox.zoom)

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

    if (this.badSegs) {
      for (s of this.badSegs) {
        this.segMask.remove(s)
      }
    }

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
      transformedMoveTo = ViewBox.makeTransform((x,y) => ctx.moveTo(x,y)),
      transformedLineTo = ViewBox.makeTransform((x,y) => ctx.lineTo(x,y))

    this.segMask.forEach((i) => {
      // ctx.moveTo(...transform(points(i)))
      // ctx.lineTo(...transform(points(i+1)))
      transformedMoveTo(points(i))
      transformedLineTo(points(i+1))
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

  *dotPointsIterFromArray(now, ds) {
    const T = ds._period,
      start = this.ts,
      p = [NaN, NaN],
      zoom = ViewBox.zoom,
      points = this.getPointAccessor(zoom),
      times = this.getTimesAccessor(zoom),
      i0 = this.segMask.min()

    const timeOffset = (ds._timeScale * (now - (start + times(i0)))) % T

    for (const i of this.segMask) {
      const t_a = times(i),
        t_b = times(i + 1),
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
            p[0] = p_a[0] + vx * dt
            p[1] = p_a[1] + vy * dt
            yield p
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
