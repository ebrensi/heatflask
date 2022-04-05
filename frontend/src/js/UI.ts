/*
 *  UI -- the front-end user interface for heatflask.
 *  Here we initialize the DOM/user interface
 */

// import { HHMMSS } from "./appUtil"
import { BoundObject } from "./DataBinding"
import { CURRENT_USER, TARGET_USER, FLASHES, ADMIN } from "./Env"
import { createDOMBindings, BoundUser, State } from "./Model"
import { parseURL } from "./URL"

import * as MapAPI from "./MapAPI"
import * as Sidebar from "./Sidebar"

const map = MapAPI.CreateMap()

if (ADMIN) map.showInfoBox()

if (!!FLASHES && FLASHES.length) {
  map
    .controlWindow({
      content: FLASHES.join("<br>"),
      position: "top",
    })
    .show()
}

// Get model parameters from the current URL
const init = parseURL(window.location.href)

// Bind visual and query parameters with DOM
// elements (sliders, text inputs, checkboxes)
const qvparams = createDOMBindings(init)
const { visual, query } = qvparams

const currentUser = CURRENT_USER
  ? <BoundUser>BoundObject.fromObject(CURRENT_USER)
  : null
const targetUser = TARGET_USER
  ? <BoundUser>BoundObject.fromObject(TARGET_USER)
  : null
/*
 * Set a listener to change user's account to public or private
 *  if they change that setting
 */
// currentUser.onChange("private", async (status) => {
//   const resp = await fetch(`${URLS["visibility"]}`)
//   const response = await resp.text()
//   console.log(`response: ${response}`)
// })

const state: State = {
  currentUser: currentUser,
  targetUser: targetUser,
  visual: visual,
  query: query,
  url: init.url,
}
window.appState = state

// **** Map settings / bindings ****
MapAPI.BindMap(map, state)

// Add Sidebar tabs to DOM / Map
Sidebar.renderTabs(map, state)

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

// flags.onChange("zoomToSelection", zoomToSelectedPaths)
// import * as ActivityCollection from "./DotLayer/ActivityCollection"

// import { dotLayer } from "./DotLayerAPI"
// // import { captureCycle, abortCapture } from "./DotLayer/Export"

// import "./DotControls"
// import "./Control.pathSelect"

// import paypalButtonHTML from "bundle-text:../html/paypal-button.html"
// import infoTabHTML from "bundle-text:../html/main-info.html"

// import { makeQuery, abortQuery } from "./DataImport"
// import * as table from "./Table"
// import { queueTask } from "./appUtil"
// import { getUrlString } from "./URL"

// /*
//  * If the user hits enter in tbe number field, make the query
//  */
// document
//   .querySelector("[data-bind=quantity]")
//   .addEventListener("keypress", (event) => {
//     if (event.key === "Enter") {
//       qParams.quantity = event.target.value
//       renderFromQuery()
//     }
//   })

// /*
//  * Define button actions
//  */
// function login() {
//   window.location.href = AUTHORIZE_URL
// }

// function logout() {
//   console.log(`${currentUser.id} logging out`)
//   window.location.href = currentUser.url.logout
// }

// function deleteAccount() {
//   window.location.href = currentUser.url.delete
// }

// function viewIndex() {
//   window.open(currentUser.url.index)
// }

// function abortRender() {
//   abortQuery()
// }

// /*
//  * Bind data-actions
//  */
// const userActions = {
//   "selection-clear": table.clearSelections,
//   "selection-render": openSelected,
//   query: renderFromQuery,
//   "abort-query": abortRender,
//   login: login,
//   logout: logout,
//   delete: deleteAccount,
//   "view-index": viewIndex,
// }

// function doAction(event) {
//   const name = event.target.dataset.action,
//     action = userActions[name]
//   console.log(name)
//   action && action()
// }

// for (const el of document.querySelectorAll("[data-action]")) {
//   el.addEventListener("click", doAction)
// }

//  *  Construct a query for activity data from our qParams

// function getCurrentQuery() {
//   const query = { streams: true }

//   switch (qParams.queryType) {
//     case "activities":
//       query.limit = +qParams.quantity
//       break

//     case "days": {
//       // debugger;
//       const today = new Date(),
//         before = new Date(),
//         after = new Date(),
//         n = +qParams.quantity
//       before.setDate(today.getDate() + 1) // tomorrow
//       after.setDate(today.getDate() - n) // n days ago

//       query.before = before.toISOString().split("T")[0]
//       query.after = after.toISOString().split("T")[0]

//       break
//     }

//     case "ids":
//       if (!qParams.ids) return
//       else {
//         const idSet = new Set(qParams.ids.split(/\D/).map(Number))
//         idSet.delete(0)
//         // create an array of ids (numbers) from a string
//         query.activity_ids = Array.from(idSet)
//       }
//       break

//     case "dates":
//       if (qParams.before) query.before = qParams.before
//       if (qParams.after) query.after = qParams.after
//       break

//     case "key":
//       query.key = qParams.key
//   }

//   const to_exclude = Object.keys(items).map(Number)
//   if (to_exclude.length) query["exclude_ids"] = to_exclude

//   return query
// }

// function renderFromQuery() {
//   const query = {
//     [qParams.userid]: getCurrentQuery(),
//   }
//   // console.log(`making query: ${JSON.stringify(query)}`)

//   makeQuery(query, () => {
//     flags.importing = false
//     const num = items.size
//     const msg = `done! ${num} activities imported`
//     document.querySelectorAll(".info-message").forEach((el) => {
//       el.innerHTML = msg
//     })
//     updateLayers()
//   })
// }

// export function openSelected(): void {
//   const ids = Array.from(items.values())
//     .filter((A) => A.selected)
//     .map((A) => A.id)

//   if (ids.length) {
//     const argString = getUrlString({ id: ids.join("+") })
//     const url = targetUser.id + argString
//     window.open(url, "_blank")
//   }
// }

// /* Rendering */
// async function updateLayers(): Promise<void> {
//   if (vParams.autozoom) {
//     const to talBounds = await ActivityCollection.getLatLngBounds()

//     if (totalBounds.isValid()) {
//       map.fitBounds(totalBounds)
//     }
//   }

//   // if (!ADMIN && !OFFLINE) {
//   //   // Record this to google analytics
//   //   try {
//   //     ga("send", "event", {
//   //       eventCategory: USER_ID,
//   //       eventAction: "Render",
//   //       eventValue: num,
//   //     });
//   //   } catch (err) {}
//   // }

//   dotLayer.reset()
//   table.update()
// }

// // Make initial query if there is one
// if (qParams.userid) {
//   queueTask(renderFromQuery)
// }
