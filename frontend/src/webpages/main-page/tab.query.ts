/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import type { QueryParameters } from "~/src/js/Model"
import { renderFromQuery } from "~/src/js/Render"
import { CURRENT_USER, STRAVA_USER_URL, URLS } from "~/src/js/Env"
import { t, getLocale } from "~/src/js/i18n"
import { sportName, sport_icon } from "~/src/js/Strava"
import CONTENT from "bundle-text:./tab.query.html"
export { CONTENT }

export const ID = "QueryTab"
export const ICON = icon("bars")

/* SETUP fills these in by id -- the header is already in the DOM by the time
 * it runs. */
export const TITLE = `
  <a id="query-user-link" href="#" target="_blank" rel="noopener">
    <img id="query-user-avatar" class="tab-avatar" alt="" />
  </a>
  <span id="query-user-title"></span>
`
/** Put the target user's name and avatar into the tab header. */
function fillHeader(appState: State): void {
  const user = appState.targetUser
  if (!user) return

  const displayName = user.name || t("common.athleteFallback", { id: user.id })
  const title = document.getElementById("query-user-title")
  if (title) title.textContent = t("tab.query.title", { name: displayName })

  const avatar = <HTMLImageElement>document.getElementById("query-user-avatar")
  if (avatar && user.profile) {
    avatar.src = user.profile
    avatar.alt = user.name || ""
  }

  const link = <HTMLAnchorElement>document.getElementById("query-user-link")
  if (link && user.id) link.href = STRAVA_USER_URL(user.id)
}

type QueryType = QueryParameters["type"]

/** The form fields each query type uses; the others are hidden */
const FIELDS: Record<QueryType, string[]> = {
  days: ["quantity-box"],
  activities: ["quantity-box"],
  ids: ["ids-box"],
  dates: ["dates-box"],
  key: ["key-box"],
}
const ALL_FIELDS = ["quantity-box", "ids-box", "dates-box", "key-box"]

function el<T extends HTMLElement = HTMLInputElement>(id: string): T {
  return <T>document.getElementById(id)
}

function showFieldsFor(type: QueryType): void {
  const shown = FIELDS[type] || []
  for (const id of ALL_FIELDS) el(id).hidden = !shown.includes(id)
}

/* The model keeps query dates as epoch seconds, as the URL does; a date input
 * wants "YYYY-MM-DD". Both are taken as UTC, as the backend takes them. */
function toDateInput(epoch?: number): string {
  return epoch ? new Date(epoch * 1000).toISOString().slice(0, 10) : ""
}
function fromDateInput(value: string): number | undefined {
  const ms = Date.parse(value)
  return isNaN(ms) ? undefined : ms / 1000
}

/* --- the sport filter ------------------------------------------------------ */

/**
 * The draft's sports: all of them, only those named, or all but those named.
 * A link carries whichever list is shorter -- sport= or nosport= -- and none
 * at all for every sport, which is the default.
 */
type SportMode = "all" | "only" | "except"
let sportMode: SportMode = "all"
const named = new Set<string>()
/** The sports in the open menu, in its order */
let listed: string[] = []

function isChecked(sport: string): boolean {
  if (sportMode === "all") return true
  return (sportMode === "only") === named.has(sport)
}

/**
 * Restate the draft after a box changes, as the shorter of the two lists. A
 * tie goes to the exclusion, which, unlike an inclusion, takes in a sport
 * the athlete has not done yet.
 */
function setChecked(checked: Set<string>): void {
  const unchecked = listed.filter((s) => !checked.has(s))
  named.clear()
  if (!unchecked.length) sportMode = "all"
  else if (checked.size < unchecked.length) {
    sportMode = "only"
    checked.forEach((s) => named.add(s))
  } else {
    sportMode = "except"
    unchecked.forEach((s) => named.add(s))
  }
  showSportSummary()
}

function syncBoxes(): void {
  el("sport-list")
    .querySelectorAll("input")
    .forEach((box) => (box.checked = isChecked(box.value)))
  showSportSummary()
}

function sportsURL(userid?: number): string {
  const base = `${URLS.query.replace(/\/$/, "")}/sport_types`
  return userid ? `${base}?user=${userid}` : base
}

/**
 * The closed menu says what the query will include: "All sports", the icons
 * of the ones it is limited to, or "All except" and the icons left out. With
 * nothing checked there is nothing to ask for, so the Query button waits.
 */
function showSportSummary(): void {
  const summary = el<HTMLElement>("sport-summary")
  const icons = [...named].map((s) => sport_icon(s)).join("")
  const none = sportMode === "only" && !named.size

  summary.title = [...named].map(sportName).join(", ")
  if (sportMode === "all") summary.textContent = t("tab.query.allSports")
  else if (none) summary.textContent = t("tab.query.sportsNone")
  else if (sportMode === "only") summary.innerHTML = icons
  else summary.innerHTML = `${t("tab.query.sportsExcept")} ${icons}`

  el<HTMLButtonElement>("query-run").disabled = none
}

function sportRow(sport: string, count?: number): HTMLLIElement {
  const li = document.createElement("li")
  const label = document.createElement("label")
  const box = document.createElement("input")
  box.type = "checkbox"
  box.value = sport
  box.checked = isChecked(sport)
  box.addEventListener("change", () => {
    const checked = new Set(listed.filter(isChecked))
    if (box.checked) checked.add(sport)
    else checked.delete(sport)
    setChecked(checked)
  })

  const name = document.createElement("span")
  name.className = "sport-name"
  name.textContent = sportName(sport)

  const n = document.createElement("span")
  n.className = "sport-count"
  n.textContent = count ? count.toLocaleString(getLocale()) : ""

  label.append(box)
  label.insertAdjacentHTML("beforeend", sport_icon(sport))
  label.append(name, n)
  li.append(label)
  return li
}

/**
 * List the sports on this map, most activities first. Fetched each time the
 * menu opens rather than once, so a first import that finishes while the page
 * is open shows up. A sport a link names that the map has none of stays
 * listed, so it can be changed.
 */
async function fillSportList(userid?: number): Promise<void> {
  const list = el<HTMLUListElement>("sport-list")
  const status = el<HTMLElement>("sport-status")
  if (!list.children.length) status.textContent = t("tab.query.loadingSports")

  let counts: Record<string, number>
  try {
    const response = await fetch(sportsURL(userid))
    if (!response.ok) throw new Error(`${response.status}`)
    counts = await response.json()
  } catch (e) {
    console.error("sport types:", e)
    status.textContent = t("tab.query.sportsFailed")
    return
  }

  named.forEach((s) => {
    if (!(s in counts)) counts[s] = 0
  })
  listed = Object.keys(counts).sort(
    (a, b) => counts[b] - counts[a] || sportName(a).localeCompare(sportName(b))
  )
  list.replaceChildren(...listed.map((s) => sportRow(s, counts[s])))
  status.textContent = listed.length ? "" : t("tab.query.noSports")
}

/**
 * The form is a draft: nothing in it reaches the model until the query runs,
 * so the URL -- which follows the model -- always describes the query that
 * was actually made, never one half-typed.
 */
function runQuery({ query }: State): void {
  // no sports checked: nothing to ask for (the Query button is disabled too)
  if (sportMode === "only" && !named.size) return
  const type = <QueryType>el<HTMLSelectElement>("queryType").value
  query.type = type
  if (type === "days" || type === "activities")
    query.quantity = +el("quantity").value
  else if (type === "ids")
    query.ids = el<HTMLTextAreaElement>("query-ids").value
  else if (type === "key") query.key = el("query-key").value.trim()
  else if (type === "dates") {
    query.after = fromDateInput(el("date-after").value)
    query.before = fromDateInput(el("date-before").value)
  }
  const sports = [...named].sort().join(",") || undefined
  query.sport = sportMode === "only" ? sports : undefined
  query.nosport = sportMode === "except" ? sports : undefined
  renderFromQuery().catch((e) => console.error("query failed:", e))
}

/**
 * This runs when all sidebar HTML is in place and we have a model State
 */
export function SETUP(appState: State) {
  const { query, visual } = appState
  fillHeader(appState)

  /* --- model -> form, once: after this the form is the reader's ---------- */

  const typeSelect = el<HTMLSelectElement>("queryType")
  const after = el("date-after")
  const before = el("date-before")
  const autozoom = el("autozoom")

  typeSelect.value = query.type
  if (query.quantity) el("quantity").value = String(query.quantity)
  el<HTMLTextAreaElement>("query-ids").value = query.ids || ""
  el("query-key").value = query.key || ""
  after.value = toDateInput(query.after)
  before.value = toDateInput(query.before)
  showFieldsFor(query.type)

  typeSelect.addEventListener("change", () =>
    showFieldsFor(<QueryType>typeSelect.value)
  )

  /* The date pickers keep each other honest: after can't be later than before */
  after.addEventListener("change", () => (before.min = after.value))
  before.addEventListener("change", () => (after.max = before.value))

  /* --- the sport filter ------------------------------------------------- */

  const fromLink = query.sport || query.nosport
  if (fromLink) {
    sportMode = query.sport ? "only" : "except"
    for (const s of fromLink.split(",")) if (s) named.add(s)
  }
  showSportSummary()

  const sportMenu = el<HTMLDetailsElement>("sport-menu")
  sportMenu.addEventListener("toggle", () => {
    if (sportMenu.open) fillSportList(query.userid)
  })

  el("sport-all").addEventListener("click", () => {
    sportMode = "all"
    named.clear()
    syncBoxes()
  })
  el("sport-none").addEventListener("click", () => {
    sportMode = "only"
    named.clear()
    syncBoxes()
  })

  /* --- running it -------------------------------------------------------- */

  el("query-run").addEventListener("click", () => runQuery(appState))

  // Enter in the number field runs the query
  el("quantity").addEventListener("keypress", (event) => {
    if (event.key === "Enter") runQuery(appState)
  })

  /* --- auto-zoom: a live setting, not part of the draft ------------------- */

  autozoom.checked = !!visual.autozoom
  autozoom.addEventListener("change", () => {
    visual.autozoom = autozoom.checked
  })
  // taking the map by hand turns it off (MapAPI.ts); the box should say so
  visual.onChange("autozoom", (on: boolean) => (autozoom.checked = !!on), false)

  /* --- a visitor gets a way in ------------------------------------------- */

  if (!CURRENT_USER) {
    el("query-login").hidden = false
    el("query-login-button").addEventListener("click", () => {
      const here = window.location.pathname + window.location.search
      window.location.href = `${URLS.login}?state=${encodeURIComponent(here)}`
    })
  }
}
