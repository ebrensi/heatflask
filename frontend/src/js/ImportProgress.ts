/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * ImportProgress -- the dialog that shows while activities are coming in.
 *
 * There is a real wait here: a first-time index import walks the athlete's
 * whole Strava history, and even a normal query streams activities one at a
 * time. Without this the map just sits there.
 *
 * The spec for this existed in DataImport.ts as a commented-out
 * Control.WindowOptions block with a .info-message div and a <progress> bar,
 * alongside a commented flags.onChange("importing", ...) that would have
 * shown and hidden it. None of it was ever connected.
 *
 * Content is set once and the pieces updated by reference: Dialog's
 * content() assigns innerHTML, so calling it per message would rebuild the
 * DOM on every update and restart the progress bar's animation.
 */

import { icon } from "./Icons"
import { Dialog } from "./Dialog"
import { t } from "./i18n"
import { URLS } from "./Env"

import type { Map as MLMap } from "maplibre-gl"

let win: Dialog
let msgEl: HTMLElement
let barEl: HTMLProgressElement
let countEl: HTMLElement
let stopEl: HTMLButtonElement
let loginEl: HTMLButtonElement
let visible = false
let hideTimer: ReturnType<typeof setTimeout> | undefined
let stopHandler: (() => void) | undefined

/** How long the finished state stays up before the dialog closes. */
const LINGER_MS = 700
/** Longer, when what it says is an error worth reading. */
const LINGER_ERROR_MS = 6000

export function initImportProgress(map: MLMap): void {
  win = new Dialog(map.getContainer(), {
    position: "center",
    title: `${icon("cloud-download")} ${t("import.title")}`,
    content: `
      <div class="import-progress">
        <div class="info-message"></div>
        <progress class="progbar"></progress>
        <div class="import-count"></div>
        <button type="button" class="btn btn-c btn-sm smooth import-stop">
          <i class="hf hf-cancel-circle"></i> ${t("import.stop")}
        </button>
        <button type="button" class="strava-auth import-login" hidden></button>
      </div>`,
  })

  const root = win.getContainer()
  msgEl = root.querySelector(".info-message")
  barEl = root.querySelector(".progbar")
  countEl = root.querySelector(".import-count")
  stopEl = root.querySelector(".import-stop")
  loginEl = root.querySelector(".import-login")
  loginEl.addEventListener("click", () => {
    const here = window.location.pathname + window.location.search
    window.location.href = `${URLS.login}?state=${encodeURIComponent(here)}`
  })
  stopEl.addEventListener("click", () => {
    stopEl.disabled = true
    if (msgEl) msgEl.textContent = t("import.stopping")
    if (stopHandler) stopHandler()
  })
}

/** What the Stop button does. */
export function onStop(handler: () => void): void {
  stopHandler = handler
}

/** Open the dialog at the start of a query. */
export function start(message = t("import.contacting")): void {
  if (!win) return
  /* A previous render's dialog may still be lingering on its final message;
   * without this its timer would close the one we are opening. */
  clearTimeout(hideTimer)
  if (msgEl) msgEl.textContent = message
  if (countEl) countEl.textContent = ""
  if (stopEl) {
    stopEl.disabled = false
    stopEl.hidden = false
  }
  if (loginEl) loginEl.hidden = true
  win.place("center")
  /* No value attribute => the indeterminate barber-pole, which is right until
   * we know how many activities are coming. */
  if (barEl) {
    barEl.hidden = false
    barEl.removeAttribute("value")
  }
  win.show()
  visible = true
}

/** A status line from the backend, e.g. "Building index...1200". */
export function message(msg: string): void {
  if (!win || !msgEl) return
  if (!visible) start(msg)
  else msgEl.textContent = msg
}

/**
 * Report how many activities have arrived.
 *
 * `total` is the count the backend sends up front; until it does, the bar
 * stays indeterminate rather than pretending to know how far along we are.
 */
export function progress(received: number, total?: number): void {
  if (!win || !visible) return

  if (countEl) {
    countEl.textContent = total
      ? t("import.countOf", { received, total })
      : t("import.count", { received })
  }

  if (barEl) {
    if (total) {
      barEl.max = total
      barEl.value = received
    } else {
      barEl.removeAttribute("value")
    }
  }
}

/**
 * Close the dialog, after letting the final state be seen for a moment --
 * several seconds if it is an error.
 */
export function finish(finalMessage?: string, isError = false): void {
  if (!win || !visible) return

  if (finalMessage && msgEl) msgEl.textContent = finalMessage
  if (stopEl) stopEl.hidden = true
  visible = false
  hideTimer = setTimeout(
    () => win.hide(),
    isError ? LINGER_ERROR_MS : LINGER_MS
  )
}

/**
 * Move to the bottom of the map, once there is something on it to see: the
 * tracks are drawn as they arrive, and the map can be used while the rest
 * come in, which it cannot with this over the middle of it.
 */
export function aside(): void {
  win?.place("bottom")
}

/**
 * The map was refused, and stays refused until the dialog is closed. With
 * `login`, the viewer is not logged in and is offered a login that comes back
 * here: accounts start private, so the one refused is often the owner.
 */
export function refused(msg: string, login: boolean): void {
  if (!win) return
  start(msg)
  if (stopEl) stopEl.hidden = true
  if (barEl) barEl.hidden = true
  if (loginEl) loginEl.hidden = !login
  visible = false
}

/** Close immediately, leaving an error on screen is the caller's business. */
export function hide(): void {
  if (!win) return
  visible = false
  win.hide()
}
