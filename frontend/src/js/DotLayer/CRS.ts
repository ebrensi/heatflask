// This is a streamlined version of Leaflet's EPSG:3857 crs,
// which can run independently of Leaflet.js (i.e. in a worker thread)
//  latlngpt is a a 2d-array [lat,lng] rather than a latlng object
export const code = "EPSG:3857"

const MAX_LATITUDE = 85.0511287798
const EARTH_RADIUS = 6378137
const RAD = Math.PI / 180

// Note: These operations are done in-place!!

type PointArray = [number, number]

// This projects LatLng coordinate onto a rectangular grid
export function Projection() {
  const max = MAX_LATITUDE
  const R = EARTH_RADIUS
  const rad = RAD

  return function (latlngpt: PointArray) {
    const lat = Math.max(Math.min(max, latlngpt[0]), -max)
    const sin = Math.sin(lat * rad)
    const p_out = latlngpt

    p_out[0] = R * latlngpt[1] * rad
    p_out[1] = (R * Math.log((1 + sin) / (1 - sin))) / 2
    return p_out
  }
}

// This scales distances between points to a given zoom level
export function Transformation(zoom: number) {
  const S = 0.5 / (Math.PI * EARTH_RADIUS)
  const A = S
  const B = 0.5
  const C = -S
  const D = 0.5
  const scale = 2 ** (8 + zoom)

  return function (p_in: PointArray) {
    const p_out = p_in
    p_out[0] = scale * (A * p_in[0] + B)
    p_out[1] = scale * (C * p_in[1] + D)
    return p_out
  }
}

export function makePT(zoom: number) {
  const P = Projection()
  const T = Transformation(zoom)
  return function (llpt: PointArray ) {
    return T(P(llpt))
  }
}
