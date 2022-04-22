/**
 * Our interface with the backend server via /query endpoint
 * defined in @link ~/backend/Index.py
 */
import { decodeMultiStream } from "@msgpack/msgpack"
import * as ActivityCollection from "./DotLayer/ActivityCollection"

import type { QueryParameters } from "./Model"
import type { Control } from "leaflet"

interface BBounds {
  SW: [number, number]
  NE: [number, number]
}
export type BackendQuery = {
  user_id?: number
  after?: number // seconds since EPOCH
  before?: number
  limit?: number
  key?: string
  activity_type?: string[]
  activity_ids?: number[]
  exclude_ids?: number[]
  commute?: boolean
  private?: boolean
  streams?: boolean
  visibility?: "everyone" | "followers" | "only_me"
  overlaps?: BBounds
}

// This spec should match that in backend/Index.py
export const ACTIVITY_FIELDNAMES = {
  ACTIVITY_ID: "_id",
  USER_ID: "U",
  N_ATHLETES: "#a",
  N_PHOTOS: "#p",
  ELEVATION_GAIN: "+",
  UTC_START_TIME: "s",
  UTC_LOCAL_OFFSET: "o",
  DISTANCE_METERS: "D",
  TIME_SECONDS: "T",
  LATLNG_BOUNDS: "B",
  FLAG_COMMUTE: "c",
  FLAG_PRIVATE: "p",
  ACTIVITY_NAME: "N",
  ACTIVITY_TYPE: "t",
  VISIBILITY: "v",
} as const

const F = ACTIVITY_FIELDNAMES
type ActivitySummary = {
  [F.ACTIVITY_ID]: number
  [F.USER_ID]: number
  [F.N_ATHLETES]: number
  [F.N_PHOTOS]: number
  [F.ELEVATION_GAIN]: number
  [F.UTC_START_TIME]: number
  [F.UTC_LOCAL_OFFSET]: number
  [F.DISTANCE_METERS]: number
  [F.TIME_SECONDS]: number
  [F.LATLNG_BOUNDS]: BBounds
  [F.FLAG_COMMUTE]: boolean
  [F.FLAG_PRIVATE]: boolean
  [F.ACTIVITY_NAME]: string
  [F.ACTIVITY_TYPE]: number | string
  [F.VISIBILITY]: string
}

type QueryResultItem = {
  msg?: string
  error?: string
  count?: number
  mpk?: string
} & ActivitySummary

type UnpackedStreams = {
  id: number
  /** rld encoded times in seconds */
  t: number[]
  /** rld encoded altitude in meters */
  a: number[]
  /** polyline encoded latlng [lat, lng] pairs  */
  p: Array<[number, number]>
}

/**
 * Convert a set of QueryParamters (from DOM) to BackendQuery parameters
 */
export function backendQuery(query: QueryParameters) {
  const bq: BackendQuery = { streams: true }

  switch (query.type) {
    case "activities":
      bq.limit = query.quantity
      break

    case "days": {
      // debugger;
      const today = new Date()
      const before = new Date()
      const after = new Date()
      const n = +query.quantity
      before.setDate(today.getDate() + 1) // tomorrow
      after.setDate(today.getDate() - n) // n days ago

      bq.before = Math.round(before.valueOf() / 1000)
      bq.after = Math.round(after.valueOf() / 1000)

      break
    }

    case "ids":
      if (!query.ids) return
      else {
        const idSet = new Set(query.ids.split(/\D/).map(Number))
        idSet.delete(0)
        // create an array of ids (numbers) from a string
        bq.activity_ids = Array.from(idSet)
      }
      break

    case "dates":
      if (query.before) bq.before = query.before
      if (query.after) bq.after = query.after
      break

    case "key":
      bq.key = query.key
  }

  const to_exclude = Object.keys(items).map(Number)
  if (to_exclude.length) query["exclude_ids"] = to_exclude

  return bq
}

/*
 * Set up a message box that appears only when flags.importing is true
 */
const infoBoxSpec: Control.WindowOptions = {
  position: "center",
  title: '<i class="hf hf-cloud-download"></i> Importing...',
  content: `<div class="info-message"></div>
            <div class="progress msgbox">
            <progress class="progbar"></progress>
            </div>`,
}

// flags.onChange("importing", (val) => {
//   val ? importInfoBox.show() : importInfoBox.hide()
// })

const infoMsgElements: HTMLDivElement[] = Array.from(
  document.querySelectorAll(".info-message")
)
const progBars: HTMLProgressElement[] = Array.from(
  document.querySelectorAll(".progbar")
)

/*
 * Display a progress message and percent-completion
 */
function displayProgressInfo(msg?: string, progress?: number) {
  if (!msg && !progress) {
    infoMsgElements.forEach((el) => (el.innerHTML = ""))
    progBars.forEach((el) => el.removeAttribute("value"))
    return
  }

  if (msg) {
    for (const el of infoMsgElements) el.innerHTML = msg
  }

  if (progress) {
    for (const el of progBars) el.value = progress
  }
}

/*
 * Send a query to the backend and populate the items object with it.
 */
export function makeBackendQuery(query: QueryParameters, done) {
  flags.importing = true
  numActivities = 0
  count = 0

  displayProgressInfo("Retrieving activity data...")

  queryBackend(query, onMessage, done)
}

export function abortQuery() {
  flags.importing = false
  makeQuery()
}

// when done
// Dom.prop("#renderButton", "disabled", false);
// doneRendering("Finished.");
// return;

/*
 *  this is the callback for our data importer. If there is an open
 *    connection with the data-layer (backend server), it gets called on
 *    every received message.
 *
 * @param {Object} A - A JSON object ecoding 1 message from the data layer
 */
function onMessage(A) {
  if (!("_id" in A)) {
    if ("idx" in A) {
      displayProgressInfo(`indexing...${A.idx}`)
    } else if ("count" in A) {
      numActivities += A.count
    } else if ("delete" in A) {
      const toDelete = A.delete
      if (toDelete.length) {
        // delete all ids in A.delete
        for (const id of toDelete) {
          ActivityCollection.remove(id)
        }
      }
    } else if ("done" in A) {
      console.log("received done")
      // doneRendering("Done rendering.");
    } else if ("msg" in A) {
      displayProgressInfo(A.msg)
    }

    return
  }

  if (!("type" in A)) {
    return
  }

  ActivityCollection.add(A)

  count++
  if (count % 5 === 0) {
    const prog = numActivities ? count / numActivities : null
    displayProgressInfo(`imported ${count}/${numActivities || "?"}`, prog)
  }
}
