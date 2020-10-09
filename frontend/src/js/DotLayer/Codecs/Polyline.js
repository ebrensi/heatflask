/** @module */

/** Some functions for decoding Google's Polyline format into numbers
 * This is adapted from the implementation in Project-OSRM.
 * Based off of [the offical Google document](https://developers.google.com/maps/documentation/utilities/polylinealgorithm)
 *
 * Some parts from [this implementation](http://facstaff.unca.edu/mcmcclur/GoogleMaps/EncodePolyline/PolylineEncoder.js)
 * by [Mark McClure](http://facstaff.unca.edu/mcmcclur/)
 *
 * modified by Efrem Rensi
 */

/**
 * Decodes to a [latitude, longitude] coordinates array.
 *
 * @param {String} str
 * @param {Number} precision
 * @returns {Array}
 *
 * @see https://github.com/Project-OSRM/osrm-frontend/blob/master/WebContent/routing/OSRM.RoutingGeometry.js
 */
export function* decode(str, precision) {
  let index = 0,
    lat = 0,
    lng = 0,
    shift = 0,
    result = 0,
    byte = null,
    latitude_change,
    longitude_change,
    factor = Math.pow(10, Number.isInteger(precision) ? precision : 5),
    latLng = new Float32Array(2)

  // Coordinates have variable length when encoded, so just keep
  // track of whether we've hit the end of the string. In each
  // loop iteration, a single coordinate is decoded.
  while (index < str.length) {
    // Reset shift, result, and byte
    byte = null
    shift = 0
    result = 0

    do {
      byte = str.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    latitude_change = result & 1 ? ~(result >> 1) : result >> 1

    shift = result = 0

    do {
      byte = str.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)

    longitude_change = result & 1 ? ~(result >> 1) : result >> 1

    lat += latitude_change
    lng += longitude_change

    latLng[0] = lat / factor
    latLng[1] = lng / factor

    yield latLng
  }
}

function lengthInPoints(str) {
  let byte,
    count = 0,
    index = 0

  while (index < str.length) {
    do byte = str.charCodeAt(index++) - 63
    while (byte >= 0x20)

    do byte = str.charCodeAt(index++) - 63
    while (byte >= 0x20)

    count++
  }
  return count
}

export function decode2Buf(str, n, precision) {
  n = n || lengthInPoints(str)
  const buf = new Float32Array(2 * n),
    decoder = decode(str, precision)

  let i = 0
  for (const latLng of decoder) buf.set(latLng, 2 * i++)
  return buf
}

export function* iterBuf(buf) {
  const len = buf.length
  for (let i = 0; i < len; i += 2) yield buf.subarray(i, i + 2)
}
