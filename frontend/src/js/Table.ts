/*
 * Table -- the activity list in the sidebar's "Rendered Activities" tab.
 *
 * Modelled on the standalone activities page, but driven by the Activity
 * objects the DotLayer draws from rather than by raw query results. That way a
 * row and its dots are the same object: clicking a row sets Activity.selected,
 * and the renderer already draws selected activities with a wider path and
 * round dots instead of square ones.
 */

import { href, HHMMSS } from "./appUtil"
import { activity_icon, activityURL } from "./Strava"
import * as ActivityCollection from "./DotLayer/ActivityCollection"
import { dotLayer } from "./DotLayerAPI"

import type { Map as LMap } from "leaflet"
import type { Activity } from "./DotLayer/Activity"
import type { ActivityType } from "./Strava"
import type { State } from "./Model"

const METRIC = window.localStorage.getItem("units") == "metric"
const DIST_SCALE = METRIC ? 1 / 1000 : 1 / 1609.34
const DIST_LABEL = METRIC ? "km" : "mi"

let tableEl: HTMLTableElement
let _map: LMap
let _state: State

/** Is the "Zoom to selection" box ticked? */
function zoomToSelection(): boolean {
  const el = <HTMLInputElement>(
    document.querySelector('[data-bind="zoomToSelection"]')
  )
  return !!el && el.checked
}

export function init(map: LMap, appState: State): void {
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
}

function toggle(id: number, row: HTMLElement): void {
  const A = ActivityCollection.items.get(id)
  if (!A) return

  A.selected = !A.selected
  row.classList.toggle("selected", A.selected)

  redrawSelection()
  if (A.selected && zoomToSelection()) zoomTo([A])
}

/** Paths change width with selection, so they need a redraw. Dots pick it up
 * on the next animation frame by themselves. */
function redrawSelection(): void {
  if (dotLayer) dotLayer.redraw(true)
}

function zoomTo(activities: Activity[]): void {
  if (!activities.length || !_map) return
  let bounds = activities[0].llBounds
  for (const A of activities.slice(1)) bounds = bounds.extend(A.llBounds)
  if (bounds.isValid()) _map.fitBounds(bounds)
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
}

/** Open the selected activities on their own, in a new tab. */
export function openSelected(): void {
  const ids = selected().map((A) => A.id)
  if (!ids.length) return

  const uid = _state?.targetUser?.id
  const base = uid ? `/${uid}` : "/"
  window.open(`${base}?id=${ids.join("+")}`, "_blank")
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
    ? A.tsLocal.toLocaleDateString(undefined, DATE_FORMAT)
    : ""
  const dist = ((A.total_distance || 0) * DIST_SCALE).toFixed(1)
  const elapsed = HHMMSS(A.elapsed_time || 0)
  const aicon = activity_icon(<ActivityType>A.type) || String(A.type)
  const title = A.name || "(untitled)"

  // dot colour is assigned during ActivityCollection.reset(); fall back to the
  // path colour so the indicator is never invisible
  const swatchColor = A.colors.dot || A.colors.path || "#888"

  const main =
    `<div class="row-main">` +
    `<span class="dot-swatch" style="background:${swatchColor}"></span>` +
    `<span class="title" title="${title.replace(/"/g, "&quot;")}">` +
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
    tableEl.innerHTML = `<tbody><tr><td>no activities</td></tr></tbody>`
    return
  }

  tableEl.innerHTML = `<tbody>${activities.map(makeRow).join("")}</tbody>`
}
