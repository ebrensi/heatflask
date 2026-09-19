import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import type { QueryParameters } from "~/src/js/Model"
import { renderFromQuery } from "~/src/js/Render"
import { CURRENT_USER, STRAVA_USER_URL, URLS } from "~/src/js/Env"
import { t } from "~/src/js/i18n"
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

/**
 * The form is a draft: nothing in it reaches the model until the query runs,
 * so the URL -- which follows the model -- always describes the query that
 * was actually made, never one half-typed.
 */
function runQuery({ query }: State): void {
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
