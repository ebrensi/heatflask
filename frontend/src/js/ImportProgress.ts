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
 * Content is set once and the pieces updated by reference: Control.Window's
 * content() assigns innerHTML, so calling it per message would rebuild the
 * DOM on every update and restart the progress bar's animation.
 */

import { Control } from "leaflet"
import { icon } from "./Icons"

import type { Map as LMap } from "leaflet"

type ControlWindow = {
  title(html: string): unknown
  content(html: string): unknown
  getContainer(): HTMLElement
  show(position?: string): unknown
  hide(): unknown
}

let win: ControlWindow
let msgEl: HTMLElement
let barEl: HTMLProgressElement
let countEl: HTMLElement
let visible = false

/** How long the finished state stays up before the dialog closes. */
const LINGER_MS = 700

export function initImportProgress(map: LMap): void {
  const Ctor = <new (map: LMap, opts: Record<string, unknown>) => ControlWindow>(
    (<unknown>Control.Window)
  )

  win = new Ctor(map, {
    visible: false,
    position: "center",
    title: `${icon("cloud-download")} Importing`,
    content: `
      <div class="import-progress">
        <div class="info-message"></div>
        <progress class="progbar"></progress>
        <div class="import-count"></div>
      </div>`,
  })

  const root = win.getContainer()
  msgEl = root.querySelector(".info-message")
  barEl = root.querySelector(".progbar")
  countEl = root.querySelector(".import-count")
}

/** Open the dialog at the start of a query. */
export function start(message = "contacting Strava…"): void {
  if (!win) return
  if (msgEl) msgEl.textContent = message
  if (countEl) countEl.textContent = ""
  /* No value attribute => the indeterminate barber-pole, which is right until
   * we know how many activities are coming. */
  if (barEl) barEl.removeAttribute("value")
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
      ? `${received} of ${total} activities`
      : `${received} activities`
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

/** Close the dialog, after letting the final state be seen for a moment. */
export function finish(finalMessage?: string): void {
  if (!win || !visible) return

  if (finalMessage && msgEl) msgEl.textContent = finalMessage
  visible = false
  setTimeout(() => win.hide(), LINGER_MS)
}

/** Close immediately, leaving an error on screen is the caller's business. */
export function hide(): void {
  if (!win) return
  visible = false
  win.hide()
}
