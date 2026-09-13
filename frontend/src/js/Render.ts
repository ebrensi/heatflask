/*
 * Render -- run an activity query and put the result on the map.
 *
 * This lives outside UI.ts so that the query tab can trigger a render without
 * creating an import cycle (UI -> Sidebar -> tab.query -> UI).
 */

import * as ActivityCollection from "./DotLayer/ActivityCollection"
import * as Table from "./Table"
import * as ImportProgress from "./ImportProgress"
import * as StreamCache from "./StreamCache"
import { dotLayer } from "./DotLayerAPI"
import { qToQ, makeActivityQuery, decodePackedStreams } from "./DataImport"
import { URLS } from "./Env"

import type { Map as LMap } from "leaflet"
import type { State } from "./Model"
import type { ImportedActivity } from "./DataImport"

let _map: LMap
let _state: State

export function initRender(map: LMap, appState: State): void {
  _map = map
  _state = appState
}

/** Write to every .info-message element the sidebar puts in the DOM */
function message(msg: string): void {
  for (const el of Array.from(document.querySelectorAll(".info-message"))) {
    el.innerHTML = msg
  }
}

/** The `info` object the backend sends once, ahead of the activities. */
type QueryInfo = { polyline_precision: number; atypes: string[] }

/**
 * Give every activity its streams, taking them from the cache where we can
 * and fetching only the rest.
 *
 * The summaries have already arrived; this is the second leg. On a warm cache
 * it makes no request at all.
 */
async function fillStreamsFromCache(
  activities: ImportedActivity[],
  polylinePrecision: number
): Promise<void> {
  if (!activities.length) return

  const misses: number[] = []
  let hits = 0

  for (const A of activities) {
    const packed = await StreamCache.get(A._id)
    if (packed && polylinePrecision !== undefined) {
      A.streams = decodePackedStreams(packed, polylinePrecision)
      hits++
    } else {
      misses.push(A._id)
    }
  }

  if (misses.length) {
    ImportProgress.message(`fetching ${misses.length} tracks…`)

    const byId = new Map(activities.map((A) => [A._id, A]))
    const streamQuery = {
      ...qToQ(_state.query, true),
      activity_ids: misses,
      /* The ids are explicit, so none of the other narrowing applies */
      limit: undefined as number,
    }

    let done = 0
    for await (const obj of makeActivityQuery(streamQuery, URLS.query, true)) {
      if (!obj || !("_id" in obj)) continue

      const fetched = <ImportedActivity>(<unknown>obj)
      const A = byId.get(fetched._id)
      if (A && fetched.streams) {
        A.streams = fetched.streams
        if (fetched.mpk) await StreamCache.put(fetched._id, fetched.mpk)
      }
      ImportProgress.progress(hits + ++done, activities.length)
    }
  }

  /* One index write for the whole render, rather than one per activity */
  await StreamCache.flush()

  const { count, bytes } = StreamCache.stats()
  console.log(
    `stream cache: ${hits} hits, ${misses.length} fetched; ` +
      `holding ${count} activities (${(bytes / 1e6).toFixed(1)} MB)`
  )

  /* Drop any activity we still could not get a track for, rather than handing
   * the renderer a half-built one. */
  for (let i = activities.length - 1; i >= 0; i--) {
    if (!activities[i].streams) activities.splice(i, 1)
  }
}

/**
 * Run the current query, replace the activity set with the result, and
 * redraw. Returns how many activities were rendered.
 */
export async function renderFromQuery(): Promise<number> {
  if (!_state) throw new Error("initRender() has not been called")
  const { query, visual } = _state

  /* With the cache on, ask for summaries only and fill the streams in from
   * IndexedDB; without it, ask for everything as before. A summary is 208
   * bytes and a stream is about 12KB, so this is the whole saving. */
  const caching = StreamCache.enabled()
  const backendQuery = qToQ(query, !caching)
  if (!backendQuery) {
    message("nothing to query")
    return 0
  }

  message("importing…")
  ImportProgress.start()

  /* Collect first, swap at the end. Clearing up front emptied the map for the
   * whole network round-trip, so the dots visibly vanished while the new set
   * loaded. */
  const incoming: ImportedActivity[] = []
  /* How many the backend says are coming, so the progress bar can be a real
   * bar rather than an indeterminate one. */
  let expected: number | undefined
  /* Needed to decode blobs that came from the cache rather than the wire. */
  let polylinePrecision: number | undefined

  try {
    for await (const obj of makeActivityQuery(
      backendQuery,
      URLS.query,
      caching
    )) {
      if (!obj) continue

      if ("_id" in obj) {
        incoming.push(<ImportedActivity>(<unknown>obj))
        ImportProgress.progress(incoming.length, expected)
      } else {
        /* Status messages from the backend: {msg} while it builds the index,
         * {count} before the activities start, plus {info}, {delete} and
         * per-activity {error} entries. */
        const status = <{ msg?: string; count?: number; info?: QueryInfo }>obj
        if (status.info) {
          polylinePrecision = status.info.polyline_precision
        } else if (typeof status.count === "number") {
          expected = status.count
          ImportProgress.progress(incoming.length, expected)
        } else if (status.msg) {
          ImportProgress.message(status.msg)
        } else {
          console.log(obj)
        }
      }
    }

    if (caching) {
      await fillStreamsFromCache(incoming, polylinePrecision)
    }
  } catch (e) {
    ImportProgress.finish("import failed")
    throw e
  }

  const count = incoming.length
  if (!count) {
    ImportProgress.finish("no activities")
    message("no activities")
    console.warn("query returned no activities")
    return 0
  }

  ImportProgress.finish(`${count} activities`)

  ActivityCollection.clear()
  for (const activity of incoming) ActivityCollection.add(activity)

  message(`${count} activities`)

  /* reset() packs the streams, builds the per-zoom index sets, draws, and
   * starts the animation. */
  await dotLayer.reset()

  /* After reset, not before: ActivityCollection.setDotColors() runs inside it,
   * so until it has, every Activity.colors.dot is still null and the table's
   * colour swatches come out blank. */
  Table.update()

  if (visual.autozoom) {
    const bounds = await ActivityCollection.getLatLngBounds()
    if (bounds && bounds.isValid()) _map.fitBounds(bounds)
  }

  return count
}
