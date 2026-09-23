/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * UpdateCheck -- offer a reload when a new build has been deployed.
 *
 * There is no service worker, so every load of the page gets the current
 * build. But a page that is never reloaded keeps the JS it came with: an
 * installed app on a phone is mostly resumed, not relaunched, and a desktop
 * tab can stay open for days. Master deploys itself, so such a page can find
 * itself talking to a backend newer than it is.
 *
 * So the page asks the server which build it is running -- when it comes back
 * into view, which is the moment a resumed app matters, and now and then
 * while it stays in view -- and if that is not the build this page was served
 * with, says so. Reloading loses nothing but the time to redraw: the view is
 * all in the URL, and your own streams are in the local cache.
 */

import { APP_VERSION, URLS } from "./Env"
import { Dialog } from "./Dialog"
import { t } from "./i18n"

import type { Map as MLMap } from "maplibre-gl"

/** How often to ask while the page stays in view. */
const INTERVAL_MS = 30 * 60 * 1000
/** Don't ask again sooner than this, however often the page is shown. */
const MIN_GAP_MS = 60 * 1000

let lastCheck = Date.now()
let dialog: Dialog | undefined

async function check(parent: HTMLElement): Promise<void> {
  if (Date.now() - lastCheck < MIN_GAP_MS) return
  lastCheck = Date.now()
  // Already known to be out of date; bring back the prompt if it was closed
  if (dialog) {
    dialog.show()
    return
  }

  let running: string
  try {
    const response = await fetch(URLS.version, { cache: "no-store" })
    if (!response.ok) return
    running = (await response.text()).trim()
  } catch {
    return // offline, or mid-deploy; ask again next time
  }
  if (!running || running === APP_VERSION) return

  console.log(`update available: ${APP_VERSION} -> ${running}`)
  dialog = new Dialog(parent, {
    position: "top",
    title: t("update.available"),
    content: `
      <button type="button" class="btn btn-a btn-sm smooth update-reload">
        <i class="hf hf-loop2"></i> ${t("update.reload")}
      </button>`,
  }).show()
  dialog
    .getContainer()
    .querySelector(".update-reload")
    .addEventListener("click", () => window.location.reload())
}

export function initUpdateCheck(map: MLMap): void {
  if (!URLS.version) return
  const parent = map.getContainer()
  const checkIfVisible = () => {
    if (document.visibilityState === "visible") check(parent)
  }
  document.addEventListener("visibilitychange", checkIfVisible)
  // a page restored from the back/forward cache
  window.addEventListener("pageshow", (e) => e.persisted && checkIfVisible())
  setInterval(checkIfVisible, INTERVAL_MS)
}
