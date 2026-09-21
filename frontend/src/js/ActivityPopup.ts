/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * ActivityPopup -- a map popup with one activity's vital statistics.
 *
 * A port of master's activityDataPopup(): name, type and local start time,
 * distance and elapsed time, speed or pace, and links to the activity on
 * Strava and on its own Heatflask map. Distance and speed are in the
 * reader's units only (see Units.ts), and follow them when they change.
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
import { distance, UNITS_CHANGE } from "./Units"

import type { Map as MLMap, LngLatLike } from "maplibre-gl"
import type { Activity } from "./DotLayer/Activity"

/** Speed, or pace for the activities measured that way, in the reader's units */
function speedText(A: Activity): string {
  const v = A.total_distance / (A.moving_time || A.elapsed_time) // m/s
  if (!isFinite(v) || v <= 0) return ""

  const { value: perM, label } = distance(1) // reader's units per metre
  if (activity_vtype(A.type) === "pace")
    return `${HHMMSS(1 / (v * perM)).replace(/^00:/, "")}/${label}`
  return `${(v * perM * 3600).toFixed(2)} ${label}/hr`
}

function content(A: Activity): string {
  const d = distance(A.total_distance || 0)
  const when = A.tsLocal ? A.tsLocal.toLocaleString(getLocale()) : ""
  const speed = speedText(A)

  return (
    `<b>${escapeHTML(A.name || "(untitled)")}</b><br>` +
    `${A.type}: ${when}<br>` +
    `${+d.value.toFixed(2)} ${d.label} in ${HHMMSS(A.elapsed_time || 0)}<br>` +
    (speed ? `${speed}<br>` : "") +
    `View in ${href(activityURL(A.id), "Strava")}, ` +
    href(heatflaskURL([A.id]), "Heatflask")
  )
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
  open?.remove()
  const popup = new Popup({ maxWidth: "320px" })
    .setLngLat(at ?? A.llBounds.getCenter())
    .setHTML(content(A))
  /* however it closes -- its own button, a click on the map, or us */
  popup.on("close", () => {
    if (open === popup) open = openFor = undefined
  })
  open = popup.addTo(map)
  openFor = A
}

/** The activity the popup is open for, if it is */
export function popupActivity(): Activity | undefined {
  return openFor
}

document.addEventListener(UNITS_CHANGE, () => {
  if (open && openFor) open.setHTML(content(openFor))
})
