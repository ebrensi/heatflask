/*
 *  UI -- the front-end user interface for heatflask.
 *  Here we initialize the DOM/user interface
 */

import { CURRENT_USER, TARGET_USER, FLASHES, ADMIN, URLS } from "./Env"
import {
  DefaultVisual,
  DefaultQuery,
  URLParameters,
  User,
  State,
} from "./Model"

import { parseURL } from "./URL"
import { watch } from "./DataBinding"
import { qToQ, makeActivityQuery } from "./DataImport"

import * as MapAPI from "./MapAPI"
import * as Sidebar from "./Sidebar"

import * as ActivityCollection from "./DotLayer/ActivityCollection"
import { createDotLayer, dotLayer } from "./DotLayerAPI"

import type { ImportedActivity } from "./DataImport"

const map = MapAPI.CreateMap()

if (ADMIN) map.showInfoBox()

if (!!FLASHES && FLASHES.length) {
  map.controlWindow.title(`${FLASHES.join("<br>")}`)
  map.controlWindow.show()
}

export async function updateFromQuery(appState: State) {
  const { query, visual } = appState
  const backendQuery = qToQ(query, true)

  let count = 0
  for await (const obj of makeActivityQuery(backendQuery, URLS.query)) {
    if (!obj) continue

    if ("_id" in obj) {
      // An activity. Hand it to the collection the DotLayer draws from.
      ActivityCollection.add(<ImportedActivity>(<unknown>obj))
      count++
    } else {
      // Progress / status messages from the backend
      console.log(obj)
    }
  }

  if (!count) {
    console.warn("query returned no activities")
    return
  }

  /* reset() packs the streams, builds the per-zoom index sets, draws, and
   * starts the animation. */
  await dotLayer.reset()

  if (visual.autozoom) {
    const bounds = await ActivityCollection.getLatLngBounds()
    if (bounds && bounds.isValid()) map.fitBounds(bounds)
  }
}

export async function start() {
  // Get model parameters from the current URL
  const init = parseURL(window.location.href)
  const appState: State = {
    currentUser: watch<User>(CURRENT_USER),
    targetUser: watch<User>(TARGET_USER),
    visual: watch({ ...DefaultVisual, ...init.visual }),
    query: watch({ ...DefaultQuery, ...init.query }),
    url: watch<URLParameters>(init.url),
  }

  // **** Map settings / bindings ****
  MapAPI.BindMap(map, appState)

  // Create the animation layer and add it to the map. Without this nothing
  // draws, however many activities the query returns.
  createDotLayer(map, appState)

  // Add Sidebar tabs to DOM / Map
  await Sidebar.renderTabs(map, appState)

  await updateFromQuery(appState)

  return appState
}

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
