/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
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

import { parseURL, bindURL } from "./URL"
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
import { addShareControl } from "./ShareControl"
import * as Table from "./Table"
import { initRender, renderFromQuery } from "./Render"
import { initImportProgress } from "./ImportProgress"
import { initUpdateCheck } from "./UpdateCheck"
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

  // The address bar follows the model from here on; see bindURL
  bindURL(appState)

  // **** Map settings / bindings ****
  MapAPI.BindMap(map, appState)
  map.addControl(new LayerPicker(appState), "top-left")

  // Create the animation layer and add it to the map. Without this nothing
  // draws, however many activities the query returns.
  createDotLayer(map, appState)

  // Play/pause button for the animation, and video capture
  addAnimationControl(map, appState)
  addCaptureControl(map)

  // Share or copy the map's link; the installed app has no address bar
  addShareControl(map)

  // shift-drag a box over the map to select the activities inside it
  addBoxSelect(map)

  // The dialog that shows while activities stream in
  initImportProgress(map)

  // Offer a reload if a newer build is deployed while this page stays open
  initUpdateCheck(map)

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
