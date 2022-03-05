/*
 * This is the script for the heatflask activity-list view
 * activities-page.html.
 */
import "../css/activities-page.css"
import "../css/icomoon-heatflask.css"

import { decodeMultiStream } from "@msgpack/msgpack"
import { href, img, HHMMSS, DDHHMM } from "./appUtil"

const status_msg_el = document.getElementById("status_msg")
const count_msg_el = document.getElementById("count")
const table_el: HTMLTableElement = document.getElementById("activity_list")

const argstr = document.getElementById("runtime_json").innerText
const args = JSON.parse(argstr)
const atypes = args["atypes"]
const MULTI = !args["query_obj"]["user_id"]

function stravaActivityURL(aid) {
  return `https://www.strava.com/activities/${aid}`
}

const BASE_URL = "/"
const strava_button_url = new URL(
  "../images/strava_button.png",
  import.meta.url
)
const STRAVA_BUTTON = img(strava_button_url)
const DIST_UNIT = 1000

// This spec should match that in Index.py
const ACTIVITY_ID = "_id",
  USER_ID = "U",
  // TIMESTAMP = "ts",
  // N_ATHLETES = "#a",
  // N_PHOTOS = "#p",
  UTC_START_TIME = "s",
  UTC_LOCAL_OFFSET = "o",
  DISTANCE_METERS = "D",
  TIME_SECONDS = "T",
  // (LATLNG_BOUNDS = "B"),
  // FLAG_COMMUTE = "c",
  FLAG_PRIVATE = "p",
  ACTIVITY_NAME = "N",
  ACTIVITY_TYPE = "t",
  VISIBILITY = "v"

function makeHeaderRow() {
  const h = [
    '<i class="icon hf-link"></i>', // heatflask link
    '<i class="icon hf-external"></i>', // strava link
    '<i class="icon hf-calendar1"></i>', // date
    '<i class="icon hf-activity"></i>', // atype
    '<i class="icon hf-road"></i>', // distance
    '<i class="icon hf-stopwatch"></i>', // elapsed
    "{ }", // title
    '<i class="icon hf-user-secret"></i>', // private
  ]
  if (MULTI) {
    return ['<i class="icon hf-user"></i>'].concat(h)
  } else {
    return h
  }
}

async function main() {
  const response = await fetch(args["query_url"], {
    method: "POST",
    headers: {
      Accept: "application/msgpack",
      "Content-Type": "application/msgpack",
    },
    body: JSON.stringify(args["query_obj"]),
  })

  const data = []
  let count = 0
  let n_total

  for await (const obj of decodeMultiStream(response.body)) {
    if ("msg" in obj) {
      status_msg_el.innerText = obj["msg"]
    } else if ("count" in obj) {
      n_total = obj["count"]
      data[n_total - 1] = undefined
      data.fill(count, n_total, undefined)
      status_msg_el.innerText = "Importing activities..."
    } else {
      data[count] = makeRow(obj)
      count_msg_el.innerText = count++
    }
  }

  console.time("buildTable")
  buildTableWithInnerHTML(table_el, data)
  console.timeEnd("buildTable")
  status_msg_el.innerText = ""
  count_msg_el.innerText = ""
}

function makeRow(A) {
  const aid = A[ACTIVITY_ID],
    heatflask_link = `${BASE_URL}?id=${aid}`,
    strava_link = href(`${stravaActivityURL(aid)}`, STRAVA_BUTTON),
    date = new Date(
      (A[UTC_START_TIME] + A[UTC_LOCAL_OFFSET]) * 1000
    ).toLocaleString(),
    dist = +(A[DISTANCE_METERS] / DIST_UNIT).toFixed(2),
    elapsed = HHMMSS(A[TIME_SECONDS])

  const atype = atypes[A[ACTIVITY_TYPE]] || `${A[ACTIVITY_TYPE]}*`

  if (MULTI) {
    return [
      A[USER_ID],
      href(heatflask_link, aid),
      strava_link,
      date,
      atype,
      dist,
      elapsed,
      A[ACTIVITY_NAME],
      A[FLAG_PRIVATE],
    ]
  } else {
    return [
      href(heatflask_link, aid),
      strava_link,
      date,
      atype,
      dist,
      elapsed,
      A[ACTIVITY_NAME],
      A[FLAG_PRIVATE],
    ]
  }
}

function buildTableWithInnerHTML(el, data) {
  const headers = makeHeaderRow().join("</th><th>")
  const thead_str = `<thead><th>${headers}</th></thead>\n`

  const row_strs = data.map((rowArr) => {
    const cells = rowArr.join("</td><td>")
    return `<tr><td>${cells}</td></tr>`
  })
  const rows_str = row_strs.join("\n")
  const tbody_str = `<tbody>\n${rows_str}\n</tbody>`

  el.innerHTML = thead_str + tbody_str
}

function buildTableWithElements(el, data) {
  const table = document.getElementById("activity_list")
  const thead = document.createElement("thead")
  const header_row = document.createElement("tr")
  for (h in makeHeaderRow()) {
    const th = document.createElement("th")
    th.innerText = h
    header_row.appendChild(th)
  }
  thead.appendChild(header_row)

  const n_cols = header_data.length
  const tbody = document.createElement("tbody")
  for (let i = 0; i < data.length; i++) {
    const tr = document.createElement("tr")
    const rowData = makeRow(data[i])
    for (let j = 0; j < n_cols; j++) {
      const td = document.createElement("td")
      td.innerText = rowData[j]
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(thead)
  table.appendChild(tbody)
}

// Run the main async function
;(async () => {
  try {
    await main()
  } catch (e) {
    console.log("oops. ", e)
  }
})()
