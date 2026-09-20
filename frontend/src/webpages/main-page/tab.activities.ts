/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import * as Table from "~/src/js/Table"

import CONTENT from "bundle-text:./tab.activities.html"
export { CONTENT }

export const ID = "ActivitiesTab"
export const TITLE = `<span data-i18n="tab.activities.title">Rendered Activities</span>`
export const ICON = icon("list2")

/** The markup tags these buttons with data-action; nothing consumed it. */
const actions: Record<string, () => void> = {
  "selection-clear": () => Table.clearSelections(),
  "selection-render": () => Table.openSelected(),
}

export function SETUP(state: State) {
  const tab = document.getElementById(ID)
  if (!tab) return

  tab.addEventListener("click", (e: Event) => {
    const el = (<HTMLElement>e.target).closest("[data-action]")
    if (!el) return
    const action = actions[(<HTMLElement>el).dataset.action]
    if (action) action()
  })
}

// export function activityDataPopup(A: Activity, latlng: LatLng): void {
//   const d = A.total_distance,
//     elapsed = HHMMSS(A.elapsed_time),
//     v = A.average_speed,
//     dkm = +(d / 1000).toFixed(2),
//     dmi = +(d / 1609.34).toFixed(2)

//   let vkm, vmi

//   if (A.vtype == "pace") {
//     vkm = HHMMSS(1000 / v).slice(3) + "/km"
//     vmi = HHMMSS(1609.34 / v).slice(3) + "/mi"
//   } else {
//     vkm = ((v * 3600) / 1000).toFixed(2) + "km/hr"
//     vmi = ((v * 3600) / 1609.34).toFixed(2) + "mi/hr"
//   }

//   const BASE_USER_URL = "hello"

//   const popupContent = `
//         <b>${A.name}</b><br>
//         ${A.type}:&nbsp;${A.tsLocal}<br>
//         ${dkm}&nbsp;km&nbsp;(${dmi}&nbsp;mi)&nbsp;in&nbsp;${elapsed}<br>
//         ${vkm}&nbsp;(${vmi})<br>
//         View&nbsp;in&nbsp;
//         <a href='https://www.strava.com/activities/${A.id}'
//         target='_blank'>Strava</a>,&nbsp;
//         <a href='${BASE_USER_URL}?id=${A.id}'&nbsp;target='_blank'>Heatflask</a>
//     `
//   map.openPopup(popupContent, latlng, { closeButton: false })
// }

// export async function zoomToSelectedPaths(): Promise<void> {
//   // Pan-Zoom to fit all selected activities
//   const bounds = await ActivityCollection.getSelectedLatLngBounds()
//   if (bounds) map.fitBounds(bounds)
// }
