/*
 * This is the script for the heatflask activity-list view
 * activities-page.html.
 */

import { href, img, HHMMSS, sleep } from "~/src/js/appUtil"
import { activity_icon, activityURL } from "~/src/js/Strava"
import {
  makeActivityQuery,
  ACTIVITY_FIELDNAMES as F,
} from "~/src/js/DataImport"
import { icon } from "~/src/js/Icons"
import type { ActivityQuery, ActivitySummary } from "~/src/js/DataImport"
import type { ActivityType } from "~/src/js/Strava"
// import { JSTable } from "../../js/jstable"

const BASE_URL = "/"
const strava_button_url = new URL(
  "~/src/images/strava_button.png",
  import.meta.url
)

const status_msg_el = document.getElementById("status_msg")
const count_msg_el = document.getElementById("count")
const table_el = document.getElementById("activity_list")

type EmbeddedArgs = {
  query_url: string
  query_obj: ActivityQuery
  atypes: ActivityType[]
}
const argstr = document.getElementById("runtime_json").innerText
const args = <EmbeddedArgs>JSON.parse(argstr)
const atypes = args.atypes
const MULTI = !args.query_obj.user_id

function user_thumbnail(id: number, img_url: string) {
  if (!(id && img_url)) return ""
  const avatar = img(img_url, 40, 40, String(id))
  return href(`/${id}`, avatar)
}

const STRAVA_BUTTON = img(strava_button_url.href)
const store = window.localStorage
const METRIC = store.getItem("units") == "metric"
const DIST_SCALE = METRIC ? 1 / 1000 : 1 / 1609.34
const DIST_LABEL = METRIC ? "km" : "mi"
const ELEV_SCALE = METRIC ? 1 : 3.28084
const ELEV_LABEL = METRIC ? "m" : "ft"

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

  const data: string[][] = []
  const errors: string[] = []
  let count = 0
  let n_total

  for await (const obj of makeActivityQuery(args.query_obj, args.query_url)) {
    if (!obj) {
      console.log("aborted?", obj)
      break
    }
    if ("msg" in obj) {
      status_msg_el.innerText = obj.msg
    } else if ("count" in obj) {
      n_total = obj.count
      data[n_total - 1] = undefined
      data.fill(undefined, count, n_total)
      status_msg_el.innerText = "Fetching activities..."
    } else if ("error" in obj) {
      errors.push(obj.error)
    } else {
      data[count] = makeRow(<ActivitySummary>obj)
      count_msg_el.innerText = String(count++)
    }
  }

  console.time("buildTable")
  buildTableWithInnerHTML(table_el, data)
  console.timeEnd("buildTable")
  status_msg_el.innerText = ""
  count_msg_el.innerText = ""

  await sleep(0.2)
  count_msg_el.classList.remove("spinner")
}

function makeRow(A: ActivitySummary): string[] {
  const aid = A[F.ACTIVITY_ID]
  const heatflask_link = `${BASE_URL}?id=${aid}`
  const strava_link = href(`${activityURL(aid)}`, STRAVA_BUTTON)
  const date = new Date(
    (A[F.UTC_START_TIME] + A[F.UTC_LOCAL_OFFSET]) * 1000
  ).toLocaleString()
  const dist = (A[F.DISTANCE_METERS] * DIST_SCALE).toFixed(2)
  const elapsed = HHMMSS(A[F.TIME_SECONDS])
  const elev_gain = (A[F.ELEVATION_GAIN] * ELEV_SCALE).toFixed(2)
  const atype = A[F.ACTIVITY_TYPE]
  const aicon = activity_icon(atypes[<number>atype]) || `${atype}*`
  const picon = A[F.FLAG_PRIVATE] ? priv_icon : pub_icon

  if (MULTI) {
    return [
      "", // user_thumbnail(A[F.USER_ID], A[F.USER_PROFILE]),
      href(heatflask_link, date),
      strava_link,
      aicon,
      picon,
      elapsed,
      dist,
      elev_gain,
      A[F.ACTIVITY_NAME],
    ]
  } else {
    return [
      href(heatflask_link, date),
      strava_link,
      aicon,
      picon,
      elapsed,
      dist,
      elev_gain,
      A[F.ACTIVITY_NAME],
    ]
  }
}

function buildTableWithInnerHTML(el: HTMLElement, data: string[][]) {
  const headers = makeHeaderRow().join("</th><th>")
  const thead_str = `<thead><th>${headers}</th></thead>\n`

  if (data.length) {
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

// Run the main async function
;(async () => {
  try {
    await main()
  } catch (e) {
    console.log("oops. ", e)
  }
})()
