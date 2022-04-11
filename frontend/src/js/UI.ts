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
  map.controlWindow.content(`<h3>${FLASHES.join("<br>")}</h3>`)
  map.controlWindow.show()
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

const state: State = {
  currentUser: currentUser,
  targetUser: targetUser,
  visual: visual,
  query: query,
  url: init.url,
}

// **** Map settings / bindings ****
MapAPI.BindMap(map, state)

// Add Sidebar tabs to DOM / Map
Sidebar.renderTabs(map, state)

// flags.onChange("zoomToSelection", zoomToSelectedPaths)
// import * as ActivityCollection from "./DotLayer/ActivityCollection"

// import { dotLayer } from "./DotLayerAPI"
// // import { captureCycle, abortCapture } from "./DotLayer/Export"

// import "./DotControls"
// import "./Control.pathSelect"

// import { makeQuery, abortQuery } from "./DataImport"
// import * as table from "./Table"
// import { queueTask } from "./appUtil"
// import { getUrlString } from "./URL"

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
