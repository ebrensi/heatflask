/*
 * This is the script for the heatflask activity-list view
 * activities-page.html.
 */

import { decodeMultiStream } from "@msgpack/msgpack"
import { href, img, HHMMSS, sleep } from "./appUtil"
import { icon } from "./Icons"
import { activity_icon, activityURL } from "./strava"
import { JSTable } from "./jstable"

const status_msg_el = document.getElementById("status_msg")
const count_msg_el = document.getElementById("count")
const table_el = document.getElementById("activity_list")

const argstr = document.getElementById("runtime_json").innerText
const args = JSON.parse(argstr)
const atypes = args["atypes"]
const MULTI = !args["query_obj"]["user_id"]

function user_thumbnail(id, img_url) {
  if (!(id && img_url)) return ""
  const avatar = img(img_url, 40, 40, id)
  return href(`/${id}`, avatar)
}

const BASE_URL = "/"
const strava_button_url = new URL(
  "../images/strava_button.png",
  import.meta.url
)
const STRAVA_BUTTON = img(strava_button_url)
const store = window.localStorage
const METRIC = store.getItem("units") == "metric"
const DIST_SCALE = METRIC ? 1 / 1000 : 1 / 1609.34
const DIST_LABEL = METRIC ? "km" : "mi"
const ELEV_SCALE = METRIC ? 1 : 3.28084
const ELEV_LABEL = METRIC ? "m" : "ft"

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
  ELEVATION_GAIN = "+",
  // (LATLNG_BOUNDS = "B"),
  // FLAG_COMMUTE = "c",
  FLAG_PRIVATE = "p",
  ACTIVITY_NAME = "N",
  ACTIVITY_TYPE = "t",
  VISIBILITY = "v"

function makeHeaderRow() {
  const h = [
    icon("calendar1") + " " + icon("link"), // heatflask link
    icon("external"), // strava link
    icon("activity"), // atype
    icon("user-secret"), // private
    icon("stopwatch"), // elapsed
    `${icon("road1")} (${DIST_LABEL})`, // distance
    `${icon("rocket")} (${ELEV_LABEL})`,
    icon("pencil"), // title
  ]

  if (MULTI) {
    return [icon("user")].concat(h)
  } else {
    return h
  }
}

const priv_icon = icon("eye-blocked")
const pub_icon = icon("eye")

async function main() {
  count_msg_el.classList.add("spinner")
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
      status_msg_el.innerText = "Fetching activities..."
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

  const myTable = new JSTable(table_el, {
    sortable: true,
    searchable: true,
    perPage: 16,
  })
  await sleep(0.2)
  count_msg_el.classList.remove("spinner")
}

function makeRow(A) {
  const aid = A[ACTIVITY_ID],
    heatflask_link = `${BASE_URL}?id=${aid}`,
    strava_link = href(`${activityURL(aid)}`, STRAVA_BUTTON),
    date = new Date(
      (A[UTC_START_TIME] + A[UTC_LOCAL_OFFSET]) * 1000
    ).toLocaleString(),
    dist = (A[DISTANCE_METERS] * DIST_SCALE).toFixed(2),
    elapsed = HHMMSS(A[TIME_SECONDS]),
    elev_gain = (A[ELEVATION_GAIN] * ELEV_SCALE).toFixed(2)

  const atype = atypes[A[ACTIVITY_TYPE]] || `${A[ACTIVITY_TYPE]}*`

  const picon = A[FLAG_PRIVATE] ? priv_icon : pub_icon

  if (MULTI) {
    return [
      user_thumbnail(A[USER_ID], A["profile"]),
      href(heatflask_link, date),
      strava_link,
      activity_icon(atype),
      picon,
      elapsed,
      dist,
      elev_gain,
      A[ACTIVITY_NAME],
    ]
  } else {
    return [
      href(heatflask_link, date),
      strava_link,
      activity_icon(atype),
      picon,
      elapsed,
      dist,
      elev_gain,
      A[ACTIVITY_NAME],
    ]
  }
}

function buildTableWithInnerHTML(el, data) {
  const headers = makeHeaderRow().join("</th><th>")
  const thead_str = `<thead><th>${headers}</th></thead>\n`

  if (!data.length) {
    const row_strs = data.map((rowArr) => {
      const cells = rowArr.join("</td><td>")
      return `<tr><td>${cells}</td></tr>`
    })
    const rows_str = row_strs.join("\n")
    const tbody_str = `<tbody>\n${rows_str}\n</tbody>`

    el.innerHTML = thead_str + tbody_str
  } else {
    el.innerHTML = thead_str + "<tr>Sorry no data &#128577</tr>"
  }


}

function buildTableWithElements(el, data) {
  const table = document.getElementById("activity_list")
  const thead = document.createElement("thead")
  const header_row = document.createElement("tr")
  for (const h in makeHeaderRow()) {
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
