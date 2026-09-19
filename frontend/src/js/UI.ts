/*
 *  UI -- the front-end user interface for heatflask.
 *  Here we initialize the DOM/user interface
 */

import {
  CURRENT_USER,
  TARGET_USER,
  FLASHES,
  ADMIN,
  URLS,
  CAPTURE_DURATION_MAX,
} from "./Env"
import { initI18n, applyTranslations, setGlobalParams } from "./i18n"
import { initTextScale } from "./TextScale"
import {
  DefaultVisual,
  DefaultQuery,
  URLParameters,
  User,
  State,
} from "./Model"

import { parseURL } from "./URL"
import { savedStyle, setsStyle } from "./MapDefaults"
import { escapeHTML } from "./appUtil"
import { watch } from "./DataBinding"

import * as MapAPI from "./MapAPI"
import * as Sidebar from "./Sidebar"

import { createDotLayer, dotLayer } from "./DotLayerAPI"
import { Dialog } from "./Dialog"
import { LayerPicker } from "./MapControls"
import { addAnimationControl } from "./AnimationControl"
import { addBoxSelect } from "./BoxSelect"
import { addCaptureControl } from "./CaptureControl"
import * as Table from "./Table"
import { initRender, renderFromQuery } from "./Render"
import { initImportProgress } from "./ImportProgress"
import * as StreamCache from "./StreamCache"

const map = MapAPI.CreateMap()

// The query/render pipeline lives in Render.ts, so the query tab can drive it
export { renderFromQuery }

export async function start() {
  /* First: everything below this line puts words on the screen, and the
   * catalog for a language other than English arrives over the network. */
  initI18n()
  initTextScale()
  setGlobalParams({ max: CAPTURE_DURATION_MAX })
  applyTranslations(document)

  if (!!FLASHES && FLASHES.length) {
    // escaped: a flash can quote a URL parameter or an athlete's name
    new Dialog(map.getContainer(), { position: "top" })
      .title(FLASHES.map(escapeHTML).join("<br>"))
      .show()
  }

  // Get model parameters from the current URL
  const init = parseURL(window.location.href)
  /* The reader's saved style, if any, but only for a link that sets none of
   * its own; see MapDefaults.ts */
  const saved = setsStyle(init.visual) ? {} : savedStyle()
  const appState: State = {
    currentUser: watch<User>(CURRENT_USER),
    targetUser: watch<User>(TARGET_USER),
    visual: watch({ ...DefaultVisual, ...saved, ...init.visual }),
    query: watch({ ...DefaultQuery, ...init.query }),
    url: watch<URLParameters>(init.url),
  }

  // **** Map settings / bindings ****
  MapAPI.BindMap(map, appState)
  map.addControl(new LayerPicker(appState), "top-left")

  // Create the animation layer and add it to the map. Without this nothing
  // draws, however many activities the query returns.
  createDotLayer(map, appState)

  // Play/pause button for the animation, and video capture
  addAnimationControl(map, appState)
  addCaptureControl(map)

  // shift-drag a box over the map to select the activities inside it
  addBoxSelect(map)

  // The dialog that shows while activities stream in
  initImportProgress(map)

  /* Local stream cache, but only when you are looking at your own map: another
   * athlete's tracks are never left behind in your browser. Returns false and
   * stays inert in every other case, so nothing downstream needs to check. */
  const caching = await StreamCache.init(CURRENT_USER?.id, TARGET_USER?.id)
  if (caching) {
    const { count, bytes } = StreamCache.stats()
    console.log(
      `stream cache ready: ${count} activities (${(bytes / 1e6).toFixed(1)} MB)`
    )
  }

  // Give Render the map and state, so the query tab can trigger a render
  initRender(map, appState)

  // Add Sidebar tabs to DOM / Map
  await Sidebar.renderTabs(map, appState)

  // The table needs both the map and the sidebar DOM, so it is initialised
  // here rather than in the tab's SETUP, which only receives the state
  Table.init(map, appState)

  await renderFromQuery()

  if (ADMIN) Object.assign(window, { heatflask: { map, appState, dotLayer } })

  return appState
}

// flags.onChange("zoomToSelection", zoomToSelectedPaths)
// import * as ActivityCollection from "./DotLayer/ActivityCollection"

// import { dotLayer } from "./DotLayerAPI"

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

//   dotLayer.reset()
//   table.update()
// }

// // Make initial query if there is one
// if (qParams.userid) {
//   queueTask(renderFromQuery)
// }
