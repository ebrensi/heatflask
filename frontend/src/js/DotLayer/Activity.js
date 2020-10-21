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

function set2(s, p) {
  s[0] = p[0]
  s[1] = p[1]
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
    this.pointBuf = [NaN, NaN]
    this.timeIntervalBuf = { a: NaN, b: NaN }
    this.segmentBuf = {
      segment: {
        a: [NaN, NaN],
        b: [NaN, NaN],
      },

      temp: [NaN, NaN],
    }

    // decode polyline format into an Array of [lat, lng] points
    const points = Polyline.decode2Buf(polyline, n)
    // make baseline projection (latLngs to pixel points) in-place
    for (let i = 0, len = points.length; i < len; i += 2)
      ViewBox.latLng2px(points.subarray(i, i + 2))
    this.px = points
  }

  inMapBounds() {
    return ViewBox.overlaps(this.pxBounds)
  }

  /**
   * The j-th px point (returns the same Array every time, but
   *   with different contents)
   * @param  {Number} j -- the index of px
   * @return {Array}   -- the pointBuf with the point in it
   */
  _rawPoint(j) {
    j = j * 2
    this.pointBuf[0] = this.px[j]
    this.pointBuf[1] = this.px[j + 1]
    return this.pointBuf
  }

  /**
   * An "array" function from which we directlY access the i-th
   * data point for any given idxSet. This is an O(1) lookup via index
   *  array. it creates an array of length of the point simplification
   *  at a given level of zoom.
   * @param  {Number} zoom
   * @return {function}
   */
  pointsArray(zoom) {
    if (!zoom) {
      return (i) => this._rawPoint(i)
    }

    const key = `I${this.id}:${zoom}`
    let idx = _lru.get(key)

    if (!idx) {
      idx = this.idxSet[zoom].array()
      this._lru.set(key, idx)
    }

    return (i) => this._rawPoint(idx[i])
  }

  iterPoints(zoom) {
    if (zoom === 0) return _iterAllPoints(this)

    if (!zoom) zoom = ViewBox.zoom

    const idxSet = this.idxSet[zoom]
    if (!idxSet) {
      throw new Error(`no idxSet[${zoom}]`)
    }
    return idxSet.imap(this._rawPoint)
  }

  /**
   * this returns an iterator of segment objects
   *  Method 1: this is more efficient if most segments are
   *   included, but not so much if we need to skip a lot.
   *
   * @param  {Number} zoom
   * @param  {BitSet} segMask
   * @return {Iterator}
   */
  iterSegments(zoom, segMask) {
    zoom = zoom || ViewBox.zoom
    segMask = segMask || this.segMask

    /* note: this.iterPoints() returns the a reference to the same
     * object every time so if we need to deal with more than
     * one at a time we will need to make a copy.
     */

    const points = this.iterPoints(zoom)
    const seg = this.segmentBuf.segment
    let j = 0,
      obj = points.next()

    return segMask.imap((i) => {
      while (j++ < i) obj = points.next()
      set2(seg.a, obj.value)

      obj = points.next()
      set2(seg.b, obj.value)

      return seg
    })
  }

  /**
   * this returns an iterator of segment objects
   *   Method 2: this is more efficient if
   *     we need to skip a lot of segments.
   *
   * @param  {Number} zoom
   * @param  {BitSet} segMask
   * @return {Iterator}
   */
  *iterSegments2(zoom, segMask) {
    zoom = zoom || ViewBox.zoom
    segMask = segMask || this.segMask

    const { seg, temp } = this.segmentBuf
    const { a, b } = seg

    const pointsArray = this.pointsArray(null),
      idxSet = this.idxSet[zoom],
      segsIdx = segMask.imap(),
      firstIdx = segsIdx.next().value,
      points = idxSet.imap_find(pointsArray, firstIdx)

    set2(a, points.next().value) // point at firstIdx
    set2(temp, points.next().value)
    set2(b, temp) // point at firstIdx + 1

    yield seg

    let last_i = firstIdx
    for (const i of segsIdx) {
      if (i === ++last_i) set2(a, temp)
      else set2(a, points.next(i).value)

      // there is a weird bug here
      set2(temp, points.next().value)
      set2(b, temp)
      last_i = i
      yield seg
    }
  }

  timesArray(zoom) {
    const key = `T${this.id}:${zoom}`
    let arr = _lru.get(key)

    if (!arr) {
      arr = Uint16Array.from(
        StreamRLE.decodeCompressedBuf2(this.time, this.idxSet[zoom])
      )
      _lru.set(key, arr)
    }
    return (i) => arr[i]
  }

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

  async simplify(zoom) {
    if (zoom === undefined) {
      zoom = ViewBox.zoom
    }

    if (!(zoom in this.idxSet)) {
      // prevent another instance of this function from doing this
      this.idxSet[zoom] = null
      const subSet = Simplifier.simplify(
        this.pointsArray(zoom),
        this.px.length / 2,
        ViewBox.tol(zoom)
      )
      this.idxSet[zoom] = subSet
    }

    // console.log(`${this.id}: simplified`)
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
    const drawBox = DrawBox,
      viewBox = ViewBox,
      points = this.iterPoints(viewBox.zoom),
      inBounds = (p) => viewBox.contains(p) && drawBox.update(p)

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

  drawPathFromPointArray (ctx) {
    const points = this.pointsArray(ViewBox.zoom),
      transform = ViewBox.px2Container(),
      point = (i) => transform(points(i))

    this.segMask.forEach((i) => {
      let p = point(i)
      ctx.moveTo(p[0], p[1])

      p = point(i + 1)
      ctx.lineTo(p[0], p[1])
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

  *dotPointsIterFromArray(now) {
    const ds = this.getDotSettings(),
      T = ds._period,
      start = this.ts,
      p = [NaN, NaN],
      zoom = ViewBox.zoom,
      points = this.pointsArray(zoom),
      times = this.timesArray(zoom),
      p_a = [NaN, NaN],
      p_b = [NaN, NaN],
      set = (d, s) => {
        d[0] = s[0]
        d[1] = s[1]
        return d
      },
      i0 = this.segMask.min()

    const timeOffset = (ds._timeScale * (now - (start + times(i0)))) % T

    let count = 0

    for (const i of this.segMask) {
      const t_a = times(i),
        t_b = times(i + 1),
        lowest = Math.ceil((t_a - timeOffset) / T),
        highest = Math.floor((t_b - timeOffset) / T)

      if (lowest <= highest) {
        set(p_a, points(i))
        set(p_b, points(i + 1))

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

/*
 * Point iterators
 */
function* _iterAllPoints(A) {
  for (let j = 0, n = A.px.length / 2; j < n; j++) yield A._rawPoint(j)
}


