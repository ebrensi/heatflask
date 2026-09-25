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
import { t, getLocale } from "./i18n"
import { URLS } from "./Env"

import type { Map as MLMap } from "maplibre-gl"

let win: Dialog
let msgEl: HTMLElement
let barEl: HTMLProgressElement
let countEl: HTMLElement
let waitEl: HTMLElement
let stopEl: HTMLButtonElement
let loginEl: HTMLButtonElement
let visible = false
let hideTimer: ReturnType<typeof setTimeout> | undefined
let stopHandler: (() => void) | undefined
/* Ticks the countdown while Strava's rate limit holds the import up */
let waitTimer: ReturnType<typeof setInterval> | undefined

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
        <div class="import-wait" hidden></div>
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
  waitEl = root.querySelector(".import-wait")
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
  endWait()
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
  /* Something arrived, so whatever we were waiting for is over */
  if (waitTimer !== undefined) {
    endWait()
    if (msgEl) msgEl.textContent = ""
  }

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
  endWait()
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
  endWait()
  visible = false
  win.hide()
}

/**
 * A time the reader can act on, in their own language's format: just the
 * clock time today, with the weekday when it is not today (the daily limit
 * resets at midnight UTC, which is tomorrow or later for most of the world).
 */
export function localTime(epochSeconds: number): string {
  const when = new Date(epochSeconds * 1000)
  const sameDay = when.toDateString() === new Date().toDateString()
  return when.toLocaleTimeString(getLocale(), {
    weekday: sameDay ? undefined : "short",
    hour: "numeric",
    minute: "2-digit",
  })
}

/**
 * Strava's rate limit is holding the import up until `until` (epoch
 * seconds). `rationed`: because this athlete has had today's quota.
 *
 * The explanation is one short sentence, because it is translated into every
 * language the app ships. The countdown under it needs no translating, and
 * is what tells someone who cannot read the sentence that the wait has an
 * end, and that it is the same end however often they reload.
 */
export function waiting(until: number, rationed = false): void {
  if (!win) return
  const msg = t(rationed ? "import.waitRationed" : "import.waitStrava", {
    time: localTime(until),
  })
  if (!visible) start(msg)
  else if (msgEl) msgEl.textContent = msg

  clearInterval(waitTimer)
  const tick = () => {
    const left = Math.max(0, Math.round(until - Date.now() / 1000))
    const m = Math.floor(left / 60)
    const sec = String(left % 60).padStart(2, "0")
    waitEl.innerHTML = `${icon("pause2")} <span dir="ltr">${m}:${sec}</span>`
  }
  tick()
  waitEl.hidden = false
  waitTimer = setInterval(tick, 1000)
}

/**
 * Strava's daily limit is spent, for the app or (`rationed`) for this
 * athlete's share of it. Returns the message, for the caller to keep on
 * screen.
 */
export function dailyLimit(until: number, rationed = false): string {
  return t(rationed ? "import.dailyRationed" : "import.dailyLimit", {
    time: localTime(until),
  })
}

function endWait(): void {
  clearInterval(waitTimer)
  waitTimer = undefined
  if (waitEl) waitEl.hidden = true
}
