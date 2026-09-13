/*
 * ActivityPopup -- a Leaflet popup with one activity's vital statistics.
 *
 * A port of master's activityDataPopup(): name, type and local start time,
 * distance and elapsed time, speed or pace, and links to the activity on
 * Strava and on its own Heatflask map.
 *
 * One difference: master showed Strava's average_speed, which is over moving
 * time. The activity index does not keep that, so speed here is distance over
 * elapsed time, and reads slower for any activity with stops in it.
 */

import { popup } from "leaflet"
import { href, HHMMSS, escapeHTML } from "./appUtil"
import { activityURL, activity_vtype } from "./Strava"
import { heatflaskURL } from "./Table"

import type { Map as LMap } from "leaflet"
import type { Activity } from "./DotLayer/Activity"

const KM = 1000
const MI = 1609.34

/** "4:52/km" -- a pace, given a speed in m/s and a unit length in m */
function pace(v: number, unit: number): string {
  return HHMMSS(unit / v).replace(/^00:/, "")
}

function speedText(A: Activity): string {
  const v = A.total_distance / A.elapsed_time // m/s
  if (!isFinite(v) || v <= 0) return ""

  if (activity_vtype(A.type) === "pace")
    return `${pace(v, KM)}/km (${pace(v, MI)}/mi)`

  const kmh = ((v * 3600) / KM).toFixed(2)
  const mih = ((v * 3600) / MI).toFixed(2)
  return `${kmh} km/hr (${mih} mi/hr)`
}

export function activityPopup(map: LMap, A: Activity): void {
  const d = A.total_distance || 0
  const dkm = +(d / KM).toFixed(2)
  const dmi = +(d / MI).toFixed(2)
  const when = A.tsLocal ? A.tsLocal.toLocaleString() : ""
  const speed = speedText(A)

  const content =
    `<b>${escapeHTML(A.name || "(untitled)")}</b><br>` +
    `${A.type}: ${when}<br>` +
    `${dkm} km (${dmi} mi) in ${HHMMSS(A.elapsed_time || 0)}<br>` +
    (speed ? `${speed}<br>` : "") +
    `View in ${href(activityURL(A.id), "Strava")}, ` +
    href(heatflaskURL([A.id]), "Heatflask")

  popup().setLatLng(A.llBounds.getCenter()).setContent(content).openOn(map)
}
