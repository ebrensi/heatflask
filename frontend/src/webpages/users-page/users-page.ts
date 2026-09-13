/*
 * The user directory.
 *
 * Two modes off one page, the way the backend serves it:
 *
 *   /users          the public directory -- people who have ticked "public
 *                   profile", so others can find and browse their map
 *   /users?admin=1  every registered user, with the operational columns
 *                   (login count, last login, last index access, private)
 *
 * The point of the public list is to get you to somebody's map, so the whole
 * row is a link to it. Columns sort on click; master used DataTables for that,
 * which is a large dependency for one table, and the sort here is a few lines.
 */

import { img, sleep, escapeHTML } from "~/src/js/appUtil"
import { icon } from "~/src/js/Icons"
import { USER_FIELDNAMES as U } from "~/src/js/DataImport"

const status_el = document.getElementById("status")

/* textContent rather than innerText: this element is `hidden`, and innerText
 * is defined in terms of *rendered* text. It does fall back to textContent for
 * an unrendered element, but textContent is what is actually meant here and
 * does not lean on that special case.
 *
 * Guarded because this runs at module scope, outside run()'s try/catch: a
 * throw here aborts the module before run() is ever reached, so the page sits
 * blank with nothing but a console message. That is how the backend failing to
 * substitute ${runtime_json} stayed invisible. */
const jsonString = document.getElementById("runtime_json").textContent
let admin: boolean
let url: string
try {
  ;({ admin, url } = JSON.parse(jsonString) as { admin: boolean; url: string })
} catch (e) {
  status_el.textContent = `could not read page parameters: ${jsonString}`
  throw e
}

/* ------------------------------------------------------------------ *
 * Cell rendering
 * ------------------------------------------------------------------ */

function user_thumbnail(id: number | string, img_url: string): string {
  if (!(id && img_url)) return ""
  return img(img_url, 40, 40, String(id))
}

function ts_to_dt(ts: number, time = false): string {
  if (!ts) return ""
  const dt = new Date(1000 * ts)
  return time ? dt.toLocaleString() : dt.toLocaleDateString()
}

/** "3 days ago", for the last-active column. */
function since(ts: number): string {
  if (!ts) return ""
  const days = (Date.now() / 1000 - ts) / 86400
  if (days < 1) return "today"
  if (days < 2) return "yesterday"
  if (days < 31) return `${Math.floor(days)} days ago`
  if (days < 365) return `${Math.floor(days / 30)} mo ago`
  return `${(days / 365).toFixed(1)} yr ago`
}

const priv_icon = icon("eye-blocked")
const pub_icon = icon("eye")

/* ------------------------------------------------------------------ *
 * Column definitions
 * ------------------------------------------------------------------ */

type Row = Record<string, string | number>

type Column = {
  /** Header text, or an icon */
  title: string
  /** The field this column reads */
  field: string
  /** Cell content */
  render?: (row: Row) => string
  /** What to sort on, when it is not the raw field value */
  sortKey?: (row: Row) => string | number
  /** Right-align numeric columns */
  numeric?: boolean
}

const nameOf = (r: Row) =>
  `${r[U.FIRSTNAME] || ""} ${r[U.LASTNAME] || ""}`.trim()
/* Names, cities and regions are whatever athletes typed into Strava, so every
 * text cell is escaped before it goes into the table's innerHTML. */
const nameHTML = (r: Row) => escapeHTML(nameOf(r))

const publicColumns: Column[] = [
  {
    title: "",
    field: U.PROFILE,
    render: (r) => user_thumbnail(r[U.ID], <string>r[U.PROFILE]),
    sortKey: () => 0,
  },
  { title: "Name", field: U.FIRSTNAME, render: nameHTML, sortKey: nameOf },
  { title: "City", field: U.CITY },
  { title: "Region", field: U.STATE },
  { title: "Country", field: U.COUNTRY },
  {
    title: "Last active",
    field: U.LAST_LOGIN,
    render: (r) => since(<number>r[U.LAST_LOGIN]),
  },
]

const adminColumns: Column[] = [
  {
    title: "",
    field: U.PROFILE,
    render: (r) => user_thumbnail(r[U.ID], <string>r[U.PROFILE]),
    sortKey: () => 0,
  },
  { title: "ID", field: U.ID, numeric: true },
  { title: "Name", field: U.FIRSTNAME, render: nameHTML, sortKey: nameOf },
  {
    title: icon("eye"),
    field: U.PRIVATE,
    render: (r) => (r[U.PRIVATE] ? priv_icon : pub_icon),
  },
  { title: "Logins", field: U.LOGIN_COUNT, numeric: true },
  {
    title: "Last login",
    field: U.LAST_LOGIN,
    render: (r) => ts_to_dt(<number>r[U.LAST_LOGIN]),
  },
  {
    title: "Index access",
    field: U.LAST_INDEX_ACCESS,
    render: (r) => ts_to_dt(<number>r[U.LAST_INDEX_ACCESS]),
  },
  { title: "City", field: U.CITY },
  { title: "Region", field: U.STATE },
  { title: "Country", field: U.COUNTRY },
]

/* ------------------------------------------------------------------ *
 * Table
 * ------------------------------------------------------------------ */

const columns = admin ? adminColumns : publicColumns
let rows: Row[] = []
/* The backend already sorts by last login descending, so start there. */
let sortCol = columns.findIndex((c) => c.field === U.LAST_LOGIN)
let sortAsc = false

const table_element = <HTMLTableElement>document.getElementById("users")

function sortValue(col: Column, row: Row): string | number {
  return col.sortKey ? col.sortKey(row) : row[col.field] ?? ""
}

function renderTable(): void {
  const col = columns[sortCol]
  if (col) {
    rows.sort((a, b) => {
      const x = sortValue(col, a)
      const y = sortValue(col, b)
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y))
      return sortAsc ? cmp : -cmp
    })
  }

  const heads = columns
    .map((c, i) => {
      const arrow = i === sortCol ? (sortAsc ? " ▲" : " ▼") : ""
      const cls = c.numeric ? ' class="num"' : ""
      return `<th${cls} data-col="${i}">${c.title}${arrow}</th>`
    })
    .join("")

  const body = rows
    .map((r) => {
      const cells = columns
        .map((c) => {
          const content = c.render
            ? c.render(r)
            : escapeHTML(String(r[c.field] ?? ""))
          const cls = c.numeric ? ' class="num"' : ""
          return `<td${cls}>${content}</td>`
        })
        .join("")
      /* The row is a link to that user's map -- the reason the directory
       * exists. data-href rather than an <a>, since a table row cannot hold
       * one; the click listener below does the navigation. */
      return `<tr data-href="/${r[U.ID]}">${cells}</tr>`
    })
    .join("\n")

  table_element.innerHTML = `<thead><tr>${heads}</tr></thead>\n<tbody>\n${body}\n</tbody>`
}

/** Click a header to sort by it; click the same one again to reverse. */
table_element.addEventListener("click", (e: Event) => {
  const target = <HTMLElement>e.target
  const th = target.closest("th")
  if (th && th.dataset.col !== undefined) {
    const i = +th.dataset.col
    if (i === sortCol) sortAsc = !sortAsc
    else {
      sortCol = i
      sortAsc = true
    }
    renderTable()
    return
  }

  const tr = target.closest("tr")
  if (tr && tr.dataset.href) window.open(tr.dataset.href, "_blank", "noopener")
})

/* ------------------------------------------------------------------ *
 * Load
 * ------------------------------------------------------------------ */

async function run() {
  status_el.classList.add("spinner")
  const response = await fetch(url, { method: "POST" })
  const data = <(string | number)[][]>await response.json()

  /* Row 0 is the field names, which also fixes the field ordering */
  const fields = <string[]>data[0]
  rows = data.slice(1).map((values) => {
    const row: Row = {}
    fields.forEach((f, i) => (row[f] = values[i]))
    return row
  })

  const heading = document.getElementById("heading")
  if (heading) {
    heading.textContent = admin
      ? `Registered Users (${rows.length})`
      : `Public User Directory (${rows.length})`
  }

  if (!rows.length) {
    table_element.innerHTML = ""
    status_el.classList.remove("spinner")
    status_el.innerHTML = admin
      ? "No registered users."
      : `No one has a public profile yet. You can make yours public from the
         User tab on your map, and you will be listed here.`
    return
  }

  renderTable()
  await sleep(0.2)
  status_el.classList.remove("spinner")
}

;(async () => {
  try {
    await run()
  } catch (e) {
    console.error(e)
    status_el.classList.remove("spinner")
    status_el.textContent = `could not load the directory: ${e}`
  }
})()
