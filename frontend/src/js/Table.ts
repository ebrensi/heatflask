/*
 * Table -- the activity list in the sidebar's "Rendered Activities" tab.
 *
 * Modelled on the standalone activities page, but driven by the Activity
 * objects the DotLayer draws from rather than by raw query results. That way a
 * row and its dots are the same object: clicking a row sets Activity.selected,
 * and the renderer already draws selected activities with a wider path and
 * round dots instead of square ones.
 */

import { href, HHMMSS, escapeHTML } from "./appUtil"
import { activity_icon, activityURL } from "./Strava"
import * as ActivityCollection from "./DotLayer/ActivityCollection"
import { dotLayer } from "./DotLayerAPI"
import { fitTo } from "./Render"
import { closePopupIfUnselected } from "./ActivityPopup"
import { PANE_OPEN } from "./Sidebar"
import { t, getLocale } from "./i18n"

import type { Map as MLMap } from "maplibre-gl"
import type { Activity } from "./DotLayer/Activity"
import type { ActivityType } from "./Strava"
import type { State } from "./Model"

const METRIC = window.localStorage.getItem("units") == "metric"
const DIST_SCALE = METRIC ? 1 / 1000 : 1 / 1609.34
const DIST_LABEL = METRIC ? "km" : "mi"

let tableEl: HTMLTableElement
let _map: MLMap
let _state: State
/** The activity most recently selected, whose row the list scrolls to */
let lastSelected: Activity | undefined

/** Is the "Zoom to selection" box ticked? */
function zoomToSelection(): boolean {
  const el = <HTMLInputElement>(
    document.querySelector('[data-bind="zoomToSelection"]')
  )
  return !!el && el.checked
}

export function init(map: MLMap, appState: State): void {
  _map = map
  _state = appState

  tableEl = <HTMLTableElement>document.getElementById("items")
  if (!tableEl) return

  // One listener on the table, rather than one per row
  tableEl.addEventListener("click", (e: Event) => {
    const row = (<HTMLElement>e.target).closest("tr")
    if (!row || !row.dataset.id) return

    // let links inside a row do their own thing
    if ((<HTMLElement>e.target).closest("a")) return

    toggle(+row.dataset.id, row)
  })

  /* A row can't be scrolled into view while its pane is hidden, as it is
   * whenever the sidebar is closed, so do it again when the pane opens */
  tableEl
    .closest(".sidebar-pane")
    ?.addEventListener(PANE_OPEN, () => scrollIntoView(lastSelected))

  // ticking the box zooms straight away, not only on the next selection change
  const zoomBox = document.querySelector('[data-bind="zoomToSelection"]')
  if (zoomBox)
    zoomBox.addEventListener("change", () => {
      if (zoomToSelection()) zoomToSelected()
    })
}

function toggle(id: number, row: HTMLElement): void {
  const A = ActivityCollection.items.get(id)
  if (!A) return

  A.selected = !A.selected
  row.classList.toggle("selected", A.selected)

  selectionChanged(A)
}

/**
 * Call after changing which activities are selected, by whatever means.
 * `last` is the activity the user most recently selected; its row is brought
 * into view. Deselecting scrolls nothing, so pass nothing, or an activity
 * that is no longer selected.
 */
export function selectionChanged(last?: Activity): void {
  if (last?.selected) lastSelected = last
  redrawSelection()
  closePopupIfUnselected()
  scrollIntoView(last)
  if (zoomToSelection()) zoomToSelected()
}

/** How long scrolling to a row takes, however far it is, in ms */
const SCROLL_MS = 400
let scrollFrame = 0

/**
 * Scroll A's row to the middle of the list, if A is selected. Done by hand
 * rather than with scrollIntoView({behavior: "smooth"}), whose duration the
 * browser picks and which crawls across a list thousands of rows long.
 */
function scrollIntoView(A?: Activity): void {
  if (!tableEl || !A?.selected) return
  const row = tableEl.querySelector<HTMLElement>(`tr[data-id="${A.id}"]`)
  const list = tableEl.parentElement // #items-container scrolls
  if (!row || !list) return

  const listBox = list.getBoundingClientRect()
  const rowBox = row.getBoundingClientRect()
  const from = list.scrollTop
  const max = list.scrollHeight - list.clientHeight
  const to = Math.max(
    0,
    Math.min(
      max,
      from +
        (rowBox.top + rowBox.height / 2) -
        (listBox.top + listBox.height / 2)
    )
  )

  cancelAnimationFrame(scrollFrame)
  if (Math.abs(to - from) < 1) return

  const t0 = performance.now()
  const step = (now: number) => {
    const t = Math.min(1, (now - t0) / SCROLL_MS)
    const ease = 1 - (1 - t) ** 3 // fast start, gentle stop
    list.scrollTop = from + (to - from) * ease
    if (t < 1) scrollFrame = requestAnimationFrame(step)
  }
  scrollFrame = requestAnimationFrame(step)
}

/** Selection changes path widths, dot shapes and layering */
function redrawSelection(): void {
  if (dotLayer) dotLayer.redraw()
}

/** Fit the map to these activities. An empty selection leaves the map alone. */
function zoomTo(activities: Activity[]): void {
  if (!activities.length || !_map) return
  fitTo(ActivityCollection.boundsOf(activities))
}

export function selected(): Activity[] {
  return [...ActivityCollection.items.values()].filter((A) => A.selected)
}

export function clearSelections(): void {
  let changed = false
  for (const A of ActivityCollection.items.values()) {
    if (A.selected) {
      A.selected = false
      changed = true
    }
  }
  if (!tableEl) return
  for (const row of Array.from(tableEl.querySelectorAll("tr.selected"))) {
    row.classList.remove("selected")
  }
  if (changed) redrawSelection()
  closePopupIfUnselected()
}

/** Open the selected activities on their own, in a new tab. */
export function openSelected(): void {
  const ids = selected().map((A) => A.id)
  if (!ids.length) return
  window.open(heatflaskURL(ids), "_blank")
}

/** This app's url for a map of just these activities */
export function heatflaskURL(ids: number[]): string {
  const uid = _state?.targetUser?.id
  const base = uid ? `/${uid}` : "/"
  return `${base}?id=${ids.join("+")}`
}

export function zoomToSelected(): void {
  zoomTo(selected())
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: "2-digit",
  month: "numeric",
  day: "numeric",
}

/* Two lines per activity rather than a row of columns. The sidebar is around
 * 230px wide; six columns of fixed width left the title roughly one character
 * across. Title on its own line, the small stuff underneath. */
function makeRow(A: Activity): string {
  const date = A.tsLocal
    ? A.tsLocal.toLocaleDateString(getLocale(), DATE_FORMAT)
    : ""
  const dist = ((A.total_distance || 0) * DIST_SCALE).toFixed(1)
  const elapsed = HHMMSS(A.elapsed_time || 0)
  const aicon = activity_icon(<ActivityType>A.type) || String(A.type)
  // the title is whatever its owner typed, so it goes into the HTML escaped
  const title = escapeHTML(A.name || t("table.untitled"))

  // dot colour is assigned during ActivityCollection.reset(); fall back to the
  // path colour so the indicator is never invisible
  const swatchColor = A.colors.dot || A.colors.path || "#888"

  const main =
    `<div class="row-main">` +
    `<span class="dot-swatch" style="background:${swatchColor}"></span>` +
    `<span class="title" title="${title}">` +
    `${href(activityURL(A.id), title)}</span>` +
    `</div>`

  const meta =
    `<div class="row-meta">` +
    `<span>${date}</span>` +
    `<span>${aicon}</span>` +
    `<span>${elapsed}</span>` +
    `<span>${dist} ${DIST_LABEL}</span>` +
    `</div>`

  return (
    `<tr data-id="${A.id}"${A.selected ? ' class="selected"' : ""}>` +
    `<td>${main}${meta}</td></tr>`
  )
}

/** Rebuild the table from whatever the collection currently holds. */
export function update(): void {
  if (!tableEl) tableEl = <HTMLTableElement>document.getElementById("items")
  if (!tableEl) return

  const activities = [...ActivityCollection.items.values()].sort(
    (a, b) => (b.ts || 0) - (a.ts || 0) // most recent first
  )

  if (!activities.length) {
    tableEl.innerHTML = `<tbody><tr><td>${t(
      "table.noActivities"
    )}</td></tr></tbody>`
    return
  }

  tableEl.innerHTML = `<tbody>${activities.map(makeRow).join("")}</tbody>`
}
