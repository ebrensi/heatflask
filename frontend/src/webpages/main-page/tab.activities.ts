import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"

import CONTENT from "bundle-text:./tab.activities.html"
export { CONTENT }

export const ID = "activities"
export const TITLE = "Rendered Activities"
export const ICON = icon("list2")
export function SETUP(state: State) {
  /*
   * Set a listener to change user's account to public or private
   *  if they change that setting
   */
  // currentUser.onChange("private", async (status) => {
  //   const resp = await fetch(`${URLS["visibility"]}`)
  //   const response = await resp.text()
  //   console.log(`response: ${response}`)
  // })
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
