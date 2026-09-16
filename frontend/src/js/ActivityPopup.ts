/*
 * ActivityPopup -- a map popup with one activity's vital statistics.
 *
 * A port of master's activityDataPopup(): name, type and local start time,
 * distance and elapsed time, speed or pace, and links to the activity on
 * Strava and on its own Heatflask map.
 *
 * Speed and pace are over moving time, as master showed them (it used Strava's
 * average_speed). Index entries made before moving time was stored fall back to
 * elapsed time, which reads slower for any activity with stops in it; they pick
 * it up the next time the index is rebuilt.
 */

import { Popup } from "maplibre-gl"
import { href, HHMMSS, escapeHTML } from "./appUtil"
import { activityURL, activity_vtype } from "./Strava"
import { heatflaskURL } from "./Table"
import { getLocale } from "./i18n"

import type { Map as MLMap, LngLatLike } from "maplibre-gl"
import type { Activity } from "./DotLayer/Activity"

const KM = 1000
const MI = 1609.34

/** "4:52/km" -- a pace, given a speed in m/s and a unit length in m */
function pace(v: number, unit: number): string {
  return HHMMSS(unit / v).replace(/^00:/, "")
}

function speedText(A: Activity): string {
  const v = A.total_distance / (A.moving_time || A.elapsed_time) // m/s
  if (!isFinite(v) || v <= 0) return ""

  if (activity_vtype(A.type) === "pace")
    return `${pace(v, KM)}/km (${pace(v, MI)}/mi)`

  const kmh = ((v * 3600) / KM).toFixed(2)
  const mih = ((v * 3600) / MI).toFixed(2)
  return `${kmh} km/hr (${mih} mi/hr)`
}

let open: Popup | undefined
let openFor: Activity | undefined

/** Close the popup if the activity it describes is no longer selected */
export function closePopupIfUnselected(): void {
  if (openFor && !openFor.selected) open?.remove()
}

/**
 * Pop up A's details at `at`, or at the middle of its bounds if not given.
 * Callers that know where on the screen the user pointed should pass that:
 * zoomed in on part of a long activity, the middle of its bounds is usually
 * off-screen, so the popup would never be seen.
 */
export function activityPopup(map: MLMap, A: Activity, at?: LngLatLike): void {
  const d = A.total_distance || 0
  const dkm = +(d / KM).toFixed(2)
  const dmi = +(d / MI).toFixed(2)
  const when = A.tsLocal ? A.tsLocal.toLocaleString(getLocale()) : ""
  const speed = speedText(A)

  const content =
    `<b>${escapeHTML(A.name || "(untitled)")}</b><br>` +
    `${A.type}: ${when}<br>` +
    `${dkm} km (${dmi} mi) in ${HHMMSS(A.elapsed_time || 0)}<br>` +
    (speed ? `${speed}<br>` : "") +
    `View in ${href(activityURL(A.id), "Strava")}, ` +
    href(heatflaskURL([A.id]), "Heatflask")

  open?.remove()
  const popup = new Popup({ maxWidth: "320px" })
    .setLngLat(at ?? A.llBounds.getCenter())
    .setHTML(content)
  /* however it closes -- its own button, a click on the map, or us */
  popup.on("close", () => {
    if (open === popup) open = openFor = undefined
  })
  open = popup.addTo(map)
  openFor = A
}
