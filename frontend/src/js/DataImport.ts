/**
 * Our interface with the backend server via /query endpoint
 * defined in @link ~/backend/Index.py
 */
import { decodeMultiStream, decode } from "@msgpack/msgpack"
import { decode2Buf } from "./Polyline"
import { rld_decode } from "./StreamDecode"
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
  /** Ask the backend to report which of these it holds streams for */
  stream_status?: boolean
  visibility?: "everyone" | "followers" | "only_me"
  overlaps?: BBounds
}

// This spec should match that in backend/Index.py
export const ACTIVITY_FIELDNAMES = {
  ID: "_id",
  USER_ID: "U",
  N_ATHLETES: "#a",
  N_PHOTOS: "#p",
  ELEVATION_GAIN: "+",
  UTC_START_TIME: "s",
  UTC_LOCAL_OFFSET: "o",
  DISTANCE_METERS: "D",
  TIME_SECONDS: "T",
  MOVING_SECONDS: "M",
  LATLNG_BOUNDS: "B",
  FLAG_COMMUTE: "c",
  FLAG_PRIVATE: "p",
  NAME: "N",
  TYPE: "t",
  VISIBILITY: "v",
} as const

const A = ACTIVITY_FIELDNAMES
export type ImportedActivity = {
  [A.ID]: number
  [A.USER_ID]: number
  [A.N_ATHLETES]: number
  [A.N_PHOTOS]: number
  [A.ELEVATION_GAIN]: number
  [A.UTC_START_TIME]: number
  [A.UTC_LOCAL_OFFSET]: number
  [A.DISTANCE_METERS]: number
  [A.TIME_SECONDS]: number
  /** absent from index entries made before it was stored */
  [A.MOVING_SECONDS]?: number
  [A.LATLNG_BOUNDS]: BBounds
  [A.FLAG_COMMUTE]: boolean
  [A.FLAG_PRIVATE]: boolean
  [A.NAME]: string
  [A.TYPE]: number | ActivityType
  [A.VISIBILITY]: string

  mpk?: Uint8Array

  streams?: {
    /** seconds since the activity started. 32-bit: an activity left recording
     * overnight runs past the 18 hours a Uint16 can hold. */
    time: Uint32Array
    altitude: Int16Array
    latlng: Float32Array
  }
}

export type UnpackedStreams = {
  /** rld encoded times in seconds */
  t: Uint8Array
  /** rld encoded altitude in meters */
  a: Uint8Array
  /** polyline encoded latlng [lat, lng] pairs  */
  p: string
}

type StatusObject = {
  msg?: string
  error?: string
  count?: number
  /** Strava's rate limit is spent; the backend resumes at this epoch second */
  wait?: number
  info?: {
    atypes: string[]
    avatars: { [id: number]: string }
    polyline_precision: number
  }
}
type QueryResultItem = ImportedActivity | StatusObject

/**
 * Convert a set of QueryParamters (from DOM) to ActivityQuery parameters
 */
export function qToQ(
  query: QueryParameters,
  streams: boolean,
  exclude_ids?: number[]
) {
  const bq: ActivityQuery = { streams, exclude_ids }
  if (query.userid) bq.user_id = query.userid

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

/**
 * Turn a packed stream blob into the arrays the renderer draws from.
 *
 * Split out of makeActivityQuery so StreamCache can put bytes it stored
 * earlier through exactly the same decode, rather than duplicating it.
 */
export function decodePackedStreams(
  packed: Uint8Array,
  polylinePrecision: number
): ImportedActivity["streams"] {
  const mpk = <UnpackedStreams>decode(packed)
  return {
    time: rld_decode(mpk.t, Uint32Array),
    altitude: rld_decode(mpk.a, Int16Array),
    latlng: decode2Buf(mpk.p, polylinePrecision),
  }
}

/** Send a query to the backend and yield its items
 *
 * Stop it with `signal`: aborting cancels the HTTP request itself, which the
 * backend sees as a disconnect and answers by cancelling whatever Strava
 * requests the query still had in flight. The generator then simply ends.
 *
 * Breaking out of a `for await` over this generator is not enough on its own.
 * Whether that closes the connection depends on the browser -- msgpack's
 * decoder cancels the body only where ReadableStream is async-iterable -- so
 * the signal is what makes it certain.
 *
 * If the connection fails for any other reason, it yields null and ends.
 *
 * `keepPacked` leaves each activity's raw `mpk` bytes in place. Those are
 * what StreamCache stores -- about 12KB, against megabytes for the decoded
 * arrays -- so a caller that is caching asks for them and drops them once
 * they are written.
 */
export async function* makeActivityQuery(
  query: ActivityQuery,
  url = BACKEND_QUERY_URL,
  keepPacked = false,
  signal?: AbortSignal
): AsyncGenerator<QueryResultItem | null, void, undefined> {
  let info: StatusObject["info"]
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/msgpack",
        "Content-Type": "application/msgpack",
      },
      body: JSON.stringify(query),
      signal,
    })

    const resultStream = decodeMultiStream(
      response.body
    ) as AsyncGenerator<QueryResultItem>

    for await (const obj of resultStream) {
      if (!info && "info" in obj) {
        info = obj.info
      } else if (A.TYPE in obj) {
        // in this case obj is an activity

        /* Decode the activity type. The backend sends an index into
         * info.atypes, but falls back to the raw Strava string for types
         * missing from its own table (Index.mongo_doc does
         * ATYPES_LOOKUP.get(type, type)) -- "WaterSport", for one. Keep the
         * string in that case.
         *
         * The old fallback assigned A.TYPE, which is the field *name* ("t"),
         * not an activity type, so a miss was guaranteed to crash
         * activity_pathcolor downstream. */
        const rawType = obj[A.TYPE]
        /* info.atypes is string[], so the decoded name widens to string;
         * an unrecognised one is handled downstream by Strava.spec(). */
        obj[A.TYPE] = <ActivityType>(
          (typeof rawType === "number" ? info.atypes[rawType] : rawType)
        )

        // Un-pack the streams if there are any
        if ("mpk" in obj) {
          obj.streams = decodePackedStreams(obj.mpk, info.polyline_precision)
          if (!keepPacked) delete obj.mpk
        }
      }
      yield obj
    }
  } catch (e) {
    // an abort is a normal way to finish, not a failure
    if (signal?.aborted) return
    console.error("activity query failed:", e)
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
