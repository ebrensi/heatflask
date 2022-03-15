/*
 * mapAPI -- Leaflet map background is initialized here
 *
 * Efrem Rensi 2020, 2022
 */

// import { flags, vParams, currentUser } from "./Model"
// import * as ActivityCollection from "./DotLayer/ActivityCollection"
// import type { Activity } from "./DotLayer/Activity"

let center: LatLng, zoom: number

// Geohash uses "lon" for longitude and leaflet uses "lng"
function ghDecode(s: string): LatLng {
  const obj = Geohash.decode(s)
  return new LatLng(obj.lat, obj.lon)
}

if (vParams.geohash) {
  center = ghDecode(vParams.geohash)
  zoom = vParams.geohash.length
  vParams.autozoom = false
} else {
  center = vParams.center
  zoom = vParams.zoom
  vParams.geohash = Geohash.encode(center.lat, center.lng)
}

/*
 * Create one-way binding from map location to vParams object.
 * This can't be a two way binding because I don't have a way
 * to prevent infinite recursion.
 */
map.on("moveend", () => {
  const center = map.getCenter()
  const zoom = map.getZoom()

  vParams.zoom = zoom
  vParams.center = center

  const gh = Geohash.encode(center.lat, center.lng, zoom)
  vParams.geohash = gh
  // console.log(`(${center.lat}, ${center.lng}, ${zoom}) -> ${gh}`);
})

// Now vParams.baselayer becomes the actual baselayer, not just the name
const currentBaselayer = baselayers[blName]
vParams.baselayer = currentBaselayer
queueTask(() => currentBaselayer.addTo(map))

map.on("baselayerchange", (e) => {
  vParams.baselayer = e.layer
})

/*
 * Functions concerning
 */
export function activityDataPopup(A: Activity, latlng: LatLng): void {
  const d = A.total_distance,
    elapsed = HHMMSS(A.elapsed_time),
    v = A.average_speed,
    dkm = +(d / 1000).toFixed(2),
    dmi = +(d / 1609.34).toFixed(2)

  let vkm, vmi

  if (A.vtype == "pace") {
    vkm = HHMMSS(1000 / v).slice(3) + "/km"
    vmi = HHMMSS(1609.34 / v).slice(3) + "/mi"
  } else {
    vkm = ((v * 3600) / 1000).toFixed(2) + "km/hr"
    vmi = ((v * 3600) / 1609.34).toFixed(2) + "mi/hr"
  }

  const BASE_USER_URL = "hello"

  const popupContent = `
        <b>${A.name}</b><br>
        ${A.type}:&nbsp;${A.tsLocal}<br>
        ${dkm}&nbsp;km&nbsp;(${dmi}&nbsp;mi)&nbsp;in&nbsp;${elapsed}<br>
        ${vkm}&nbsp;(${vmi})<br>
        View&nbsp;in&nbsp;
        <a href='https://www.strava.com/activities/${A.id}'
        target='_blank'>Strava</a>,&nbsp;
        <a href='${BASE_USER_URL}?id=${A.id}'&nbsp;target='_blank'>Heatflask</a>
    `
  map.openPopup(popupContent, latlng, { closeButton: false })
}

export async function zoomToSelectedPaths(): Promise<void> {
  // Pan-Zoom to fit all selected activities
  const bounds = await ActivityCollection.getSelectedLatLngBounds()
  if (bounds) map.fitBounds(bounds)
}

flags.onChange("zoomToSelection", zoomToSelectedPaths)
