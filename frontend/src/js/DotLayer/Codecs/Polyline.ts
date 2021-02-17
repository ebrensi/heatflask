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
export function* decode(
  str: string,
  precision?: number
): IterableIterator<[number, number]> {
  let index = 0
  let lat = 0
  let lng = 0
  let shift = 0
  let result = 0
  let byte = null
  let latitude_change
  let longitude_change
  const factor = Math.pow(10, Number.isInteger(precision) ? precision : 5)

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

    yield [lat / factor, lng / factor]
  }
}

export function lengthInPoints(str: string): number {
  let byte
  let count = 0
  let index = 0

  while (index < str.length) {
    do byte = str.charCodeAt(index++) - 63
    while (byte >= 0x20)

    do byte = str.charCodeAt(index++) - 63
    while (byte >= 0x20)

    count++
  }
  return count
}

export function decode2Buf(
  str: string,
  n: number,
  precision: number
): Float32Array {
  n = n || lengthInPoints(str)
  const buf = new Float32Array(2 * n)
  const decoder = decode(str, precision)

  let i = 0
  for (const latLng of decoder) buf.set(latLng, 2 * i++)
  return buf
}

export function* iterBuf(buf: Float32Array): IterableIterator<Float32Array> {
  const len = buf.length
  for (let i = 0; i < len; i += 2) yield buf.subarray(i, i + 2)
}
