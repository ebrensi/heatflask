/**
 * Our interface with the backend server via /query endpoint
 * defined in @link ~/backend/Index.py
 */
import { decodeMultiStream, decode } from "@msgpack/msgpack"

import type { QueryParameters } from "./Model"
import type { ActivityType } from "./Strava"

const BACKEND_QUERY_URL = "/query"

interface BBounds {
  SW: [number, number]
  NE: [number, number]
}

export type ActivityQuery = {
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

const A = ACTIVITY_FIELDNAMES
export type ImportedActivity = {
  [A.ACTIVITY_ID]: number
  [A.USER_ID]: number
  [A.N_ATHLETES]: number
  [A.N_PHOTOS]: number
  [A.ELEVATION_GAIN]: number
  [A.UTC_START_TIME]: number
  [A.UTC_LOCAL_OFFSET]: number
  [A.DISTANCE_METERS]: number
  [A.TIME_SECONDS]: number
  [A.LATLNG_BOUNDS]: BBounds
  [A.FLAG_COMMUTE]: boolean
  [A.FLAG_PRIVATE]: boolean
  [A.ACTIVITY_NAME]: string
  [A.ACTIVITY_TYPE]: number | ActivityType
  [A.VISIBILITY]: string
  streams?: UnpackedStreams
}

type PackedStreams = { mpk: Uint8Array }

export const STREAM_FIELDNAMES = {
  TIME: "t",
  ALTITUDE: "a",
  POLYLINE: "p",
} as const
const S = STREAM_FIELDNAMES

export type UnpackedStreams = {
  id: number
  /** rld encoded times in seconds */
  [S.TIME]: number[]
  /** rld encoded altitude in meters */
  [S.ALTITUDE]: number[]
  /** polyline encoded latlng [lat, lng] pairs  */
  [S.POLYLINE]: Array<[number, number]>
}

type QueryResultActivity = ImportedActivity & Partial<PackedStreams>

type StatusObject = {
  msg?: string
  error?: string
  count?: number
  info?: { atypes: string[]; avatars: { [id: number]: string } }
}
type QueryResultItem = QueryResultActivity | StatusObject

/**
 * Convert a set of QueryParamters (from DOM) to ActivityQuery parameters
 */
export function qToQ(
  query: QueryParameters,
  streams: boolean,
  exclude_ids?: number[]
) {
  const bq: ActivityQuery = { streams, exclude_ids }

  switch (query.type) {
    case "activities":
      bq.limit = query.quantity
      break

    case "days": {
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
  return bq
}

/** Send a query to the backend and yield its items
 *   * send a non-false object to this generator to abort the operation
 *   * this generator will yield null and quit if operation is aborted
 *      from the other side
 */
export async function* makeActivityQuery(
  query: ActivityQuery,
  url = BACKEND_QUERY_URL
): AsyncGenerator<QueryResultItem | null, void, boolean> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/msgpack",
      "Content-Type": "application/msgpack",
    },
    body: JSON.stringify(query),
  })

  let info: StatusObject["info"]
  const resultStream = decodeMultiStream(
    response.body
  ) as AsyncGenerator<QueryResultItem>
  try {
    for await (const obj of resultStream) {
      if (!info && "info" in obj) {
        info = obj.info
      } else if (A.ACTIVITY_TYPE in obj) {
        obj[A.ACTIVITY_TYPE] =
          info.atypes[obj[A.ACTIVITY_TYPE]] || A.ACTIVITY_TYPE
      }
      if ("mpk" in obj) {
        obj.streams = <UnpackedStreams>decode(obj.mpk)
        delete obj.mpk
      }
      const abort = yield obj
      if (abort) break
    }
  } catch (e) {
    yield null
  }
}

/** User objects coming from the backend have this format
 */
export const USER_FIELDNAMES = {
  ID: "_id",
  LAST_LOGIN: "ts",
  LOGIN_COUNT: "#",
  LAST_INDEX_ACCESS: "I",
  FIRSTNAME: "f",
  LASTNAME: "l",
  PROFILE: "P",
  CITY: "c",
  STATE: "s",
  COUNTRY: "C",
  PRIVATE: "p",
} as const
const U = USER_FIELDNAMES

// /*
//  * Set up a message box that appears only when flags.importing is true
//  */
// const infoBoxSpec: Control.WindowOptions = {
//   position: "center",
//   title: '<i class="hf hf-cloud-download"></i> Importing...',
//   content: `<div class="info-message"></div>
//             <div class="progress msgbox">
//             <progress class="progbar"></progress>
//             </div>`,
// }

// // flags.onChange("importing", (val) => {
// //   val ? importInfoBox.show() : importInfoBox.hide()
// // })

// const infoMsgElements: HTMLDivElement[] = Array.from(
//   document.querySelectorAll(".info-message")
// )
// const progBars: HTMLProgressElement[] = Array.from(
//   document.querySelectorAll(".progbar")
// )

// /*
//  * Display a progress message and percent-completion
//  */
// function displayProgressInfo(msg?: string, progress?: number) {
//   if (!msg && !progress) {
//     infoMsgElements.forEach((el) => (el.innerHTML = ""))
//     progBars.forEach((el) => el.removeAttribute("value"))
//     return
//   }

//   if (msg) {
//     for (const el of infoMsgElements) el.innerHTML = msg
//   }

//   if (progress) {
//     for (const el of progBars) el.value = progress
//   }
// }

// export function abortQuery() {
//   flags.importing = false
//   makeQuery()
// }

// // when done
// // Dom.prop("#renderButton", "disabled", false);
// // doneRendering("Finished.");
// // return;

// /*
//  *  this is the callback for our data importer. If there is an open
//  *    connection with the data-layer (backend server), it gets called on
//  *    every received message.
//  *
//  * @param {Object} A - A JSON object ecoding 1 message from the data layer
//  */
// function onMessage(A) {
//   if (!("_id" in A)) {
//     if ("idx" in A) {
//       displayProgressInfo(`indexing...${A.idx}`)
//     } else if ("count" in A) {
//       numActivities += A.count
//     } else if ("delete" in A) {
//       const toDelete = A.delete
//       if (toDelete.length) {
//         // delete all ids in A.delete
//         for (const id of toDelete) {
//           ActivityCollection.remove(id)
//         }
//       }
//     } else if ("done" in A) {
//       console.log("received done")
//       // doneRendering("Done rendering.");
//     } else if ("msg" in A) {
//       displayProgressInfo(A.msg)
//     }

//     return
//   }

//   if (!("type" in A)) {
//     return
//   }

//   ActivityCollection.add(A)

//   count++
//   if (count % 5 === 0) {
//     const prog = numActivities ? count / numActivities : null
//     displayProgressInfo(`imported ${count}/${numActivities || "?"}`, prog)
//   }
// }
