
import * as Polyline from "./Codecs/Polyline.js"
import * as StreamRLE from "./Codecs/StreamRLE.js"
import { ATYPE } from "../strava.js"
import { latLngBounds } from "leaflet"
import * as ViewBox from "./ViewBox"

/**
 * @class Activity
 */
export class Activity {
  constructor({_id, type, name, total_distance, elapsed_time, ts, bounds, polyline, time, n}) {

    self.id = +_id
    self.type = type
    self.total_distance = total_distance
    self.elapsed_time = elapsed_time
    self.name = name
    self.pathColor = ATYPE.pathColor(type)
    self.selected = false

    self.dotColor = null

    // timestamp comes from backend as a UTC-timestamp, local offset pair
    const [utc, offset] = ts
    self.ts = utc
    self.tsLocal = new Date((utc + offset * 3600) * 1000)

    self.time = StreamRLE.transcode2CompressedBuf(time)

    self.llBounds = latLngBounds(bounds.SW, bounds.NE);
    self.pxBounds = ViewBox.latLng2pxBounds(self.llBounds)


    self.idxSet = {}

    // decode polyline format into an Array of [lat, lng] points
    const points = Polyline.decode2Buf(polyline, n)
    // make baseline projection (latLngs to pixel points) in-place
    for (let i = 0, len = points.length; i < len; i += 2)
      ViewBox.latLng2px(points.subarray(i, i + 2))
    self.px = points

  }
}
