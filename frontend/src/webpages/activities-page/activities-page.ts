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
import * as StreamCache from "~/src/js/StreamCache"
import type { ActivityQuery, ImportedActivity } from "~/src/js/DataImport"
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
  current_user_id?: number
}
const argstr = document.getElementById("runtime_json").innerText
const args = <EmbeddedArgs>JSON.parse(argstr)
const MULTI = !args.query_obj.user_id

/* Ask the backend which of these it holds streams for. */
args.query_obj.stream_status = true

/** Activities whose streams are in our Mongo cache; from the {cached} message. */
let serverCached = new Set<number>()
/** Activities whose streams are in *this browser's* IndexedDB. Only ever
 * populated when you are looking at your own list: the cache holds nobody
 * else's tracks. */
let locallyCached = new Set<number>()

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
    /* Where this activity's track is held. Two separate caches: ours in
     * Mongo, and this browser's IndexedDB. A track in neither has to be
     * re-fetched from Strava, which is the slow, rate-limited path. */
    `<span title="Track cached on the server (Mongo)">${icon("database1")}</span>`,
    `<span title="Track cached in this browser">${icon("download2")}</span>`,
    icon("pencil"), // title
  ]

  if (MULTI) {
    return [icon("user")].concat(h)
  } else {
    return h
  }
}

/* A filled marker means the track is held there, a faint dash means it is not
 * and would have to come from Strava. */
function cacheCell(present: boolean, where: string, aid: number): string {
  return present
    ? `<span class="cached yes" title="Track for ${aid} is cached ${where}">●</span>`
    : `<span class="cached no" title="Track for ${aid} is not cached ${where}">–</span>`
}

const priv_icon = icon("eye-blocked")
const pub_icon = icon("eye")
const avatars = <Record<number, string>>{}

async function main() {
  count_msg_el.classList.add("spinner")

  /* What this browser holds. Reads one small index record, not the blobs, and
   * comes back empty unless this list is the signed-in user's own. */
  locallyCached = await StreamCache.peekCachedIds(
    args.current_user_id,
    args.query_obj.user_id
  )

  const data: string[][] = []
  const errors: string[] = []
  let count = 0
  let n_total: number

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
    } else if ("cached" in obj) {
      /* Sent ahead of the summaries, so every row can be built knowing it */
      serverCached = new Set(<number[]>obj.cached)
    } else if ("error" in obj) {
      errors.push(obj.error)
    } else if ("info" in obj) {
      if ("avatars" in obj.info) {
        Object.assign(avatars, obj.info.avatars)
      }
    } else {
      data[count] = makeRow(<ImportedActivity>obj)
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

function makeRow(A: ImportedActivity): string[] {
  // these are F.ID / F.TYPE / F.NAME -- the ACTIVITY_-prefixed names this
  // file used do not exist on ACTIVITY_FIELDNAMES, so every one of these
  // columns was reading undefined
  const aid = A[F.ID]
  const heatflask_link = `${BASE_URL}?id=${aid}`
  const strava_link = href(`${activityURL(aid)}`, STRAVA_BUTTON)
  const date = new Date(
    (A[F.UTC_START_TIME] + A[F.UTC_LOCAL_OFFSET]) * 1000
  ).toLocaleString()
  const dist = (A[F.DISTANCE_METERS] * DIST_SCALE).toFixed(2)
  const elapsed = HHMMSS(A[F.TIME_SECONDS])
  const elev_gain = (A[F.ELEVATION_GAIN] * ELEV_SCALE).toFixed(2)
  const atype = A[F.TYPE]
  const aicon = activity_icon(<ActivityType>atype) || `${atype}*`
  const picon = A[F.FLAG_PRIVATE] ? priv_icon : pub_icon

  const onServer = cacheCell(serverCached.has(aid), "on the server", aid)
  const inBrowser = cacheCell(locallyCached.has(aid), "in this browser", aid)

  const cells = [
    href(heatflask_link, date),
    strava_link,
    aicon,
    picon,
    elapsed,
    dist,
    elev_gain,
    onServer,
    inBrowser,
    A[F.NAME],
  ]

  return MULTI
    ? [user_thumbnail(A[F.USER_ID], avatars[A[F.USER_ID]])].concat(cells)
    : cells
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
