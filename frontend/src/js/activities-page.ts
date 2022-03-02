/*
 * This is the script for the heatflask activity-list view
 * activities-page.html.
 */
import "../css/activities-page.css"

import { decodeMultiStream } from "@msgpack/msgpack"

const argstr = document.getElementById("runtime_json").innerText
const args = JSON.parse(argstr)

const body = JSON.stringify(args["query_obj"])
const status_msg_el = document.getElementById("status_msg")
const count_msg_el = document.getElementById("count")
const table_el: HTMLTableElement = document.getElementById("activity_list")

// This spec should match that in Index.py
fields = [
  (ACTIVITY_ID = "_id"),
  // USER_ID = "U",
  (TIMESTAMP = "ts"),
  // N_ATHLETES = "#a",
  // N_PHOTOS = "#p",
  (UTC_START_TIME = "s"),
  (UTC_LOCAL_OFFSET = "o"),
  (DISTANCE_METERS = "D"),
  (TIME_SECONDS = "T"),
  (LATLNG_BOUNDS = "B"),
  // FLAG_COMMUTE = "c",
  (FLAG_PRIVATE = "p"),
  (ACTIVITY_NAME = "N"),
  (ACTIVITY_TYPE = "t"),
  (VISIBILITY = "v"),
]

async function run() {
  const response = await fetch(args["query_url"], {
    method: "POST",
    headers: {
      Accept: "application/msgpack",
      "Content-Type": "application/msgpack",
    },
    body: body,
  })

  const data = []
  let count = 0
  let n_total

  window.stuff = data

  for await (const obj of decodeMultiStream(response.body)) {
    if ("msg" in obj) {
      status_msg_el.innerText = obj["msg"]
    } else if ("count" in obj) {
      n_total = obj["count"]
      data[n_total - 1] = undefined
      data.fill(count, n_total, undefined)
      status_msg_el.innerText = "Importing activities..."
    } else {
      data[count] = fields.map((f) => obj[f])
      count_msg_el.innerText = count++
    }
  }

  buildTableinnerHTMLFromData(table_el, data)
}

function makeRow(rowData) {
  return rowData
}

function buildTableinnerHTMLFromData(el, data) {
  console.time("buildTable")
  const header_data = fields
  const headers = header_data.join("</th><th>")
  const thead_str = `<thead><th>${headers}</th></thead>\n`

  const row_strs = data.map((rowArr) => {
    const cells = makeRow(rowArr).join("</td><td>")
    return `<tr><td>${cells}</td></tr>`
  })
  const rows_str = row_strs.join("\n")
  const tbody_str = `<tbody>\n${rows_str}\n</tbody>`

  el.innerHTML = thead_str + tbody_str
  console.timeEnd("buildTable")
}

function buildTableFromData(el, data) {
  console.time("buildTable")

  const table = document.getElementById("activity_list")
  const thead = document.createElement("thead")
  const header_data = fields
  const header_row = document.createElement("tr")
  for (h in header_data) {
    const th = document.createElement("th")
    th.innerText = h
    header_row.appendChild(th)
  }
  thead.appendChild(header_row)

  const n_cols = header_data.length
  const tbody = document.createElement("tbody")
  for (let i = 0; i < data.length; i++) {
    const tr = document.createElement("tr")
    const rowData = data[i]
    for (let j = 0; j < n_cols; j++) {
      const td = document.createElement("td")
      td.innerText = rowData[j]
      tr.appendChild(td)
    }
    tbody.appendChild(tr)
  }
  table.appendChild(thead)
  table.appendChild(tbody)
  console.timeEnd("buildTable")
}

;(async () => {
  try {
    await run()
  } catch (e) {
    console.log("oops. ", e)
  }
})()
