/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * ShareControl -- share or copy the link to the map as it is now.
 *
 * Everything that makes a view -- the query, the map position, the animation
 * settings -- lives in the URL (see URL.ts), so the link is the thing to
 * share. In a browser tab that is the address bar, but the installed app
 * (app.webmanifest, display: standalone) has no address bar, and without this
 * button there would be no way to get a link out of it at all.
 *
 * On a touch device the button opens the system share sheet, which is where
 * people expect to send a link from. Elsewhere it copies the link: a desktop
 * share sheet is rarely where the link is going.
 */

import { icon } from "./Icons"
import { CURRENT_USER, TARGET_USER } from "./Env"
import { ButtonControl } from "./MapControls"
import { t } from "./i18n"

import type { Map as MLMap } from "maplibre-gl"

const SHARE_ICON = icon("share2")

export function addShareControl(map: MLMap): void {
  const readout = document.createElement("div")
  readout.className = "share-readout"
  readout.hidden = true
  map.getContainer().appendChild(readout)

  let hideTimer = 0

  function show(text: string, ms: number): void {
    clearTimeout(hideTimer)
    readout.textContent = text
    readout.hidden = false
    hideTimer = window.setTimeout(() => (readout.hidden = true), ms)
  }

  /* A link to your own map works for no one else while the map is not
   * shared, and nothing about sending it would tell you so. CURRENT_USER is
   * the object the profile tab's switch updates, so this is always current. */
  function ownMapUnshared(): boolean {
    return (
      !!CURRENT_USER &&
      !!TARGET_USER &&
      CURRENT_USER.id === TARGET_USER.id &&
      CURRENT_USER.private !== false
    )
  }

  async function copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // No clipboard access (an insecure origin, or the browser refused):
      // put the link where it can be selected and copied by hand
      window.prompt(t("share.copyThis"), url)
      return
    }
    if (ownMapUnshared()) show(t("share.copiedUnshared"), 8000)
    else show(t("share.copied"), 2500)
  }

  async function onClick(): Promise<void> {
    const url = document.location.href
    const touch = window.matchMedia("(pointer: coarse)").matches

    if (touch && navigator.share) {
      if (ownMapUnshared()) show(t("share.unshared"), 8000)
      try {
        await navigator.share({ title: document.title, url })
        return
      } catch (e) {
        // Dismissing the sheet is not a failure
        if ((<Error>e).name === "AbortError") return
        // Anything else (no share targets, not allowed here): copy instead
      }
    }
    await copy(url)
  }

  const control = new ButtonControl("share-control", onClick)
  control.set(SHARE_ICON, t("share.title"))
  map.addControl(control, "top-left")
}
