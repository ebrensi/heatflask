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
import { nextTask } from "./appUtil"
import { URLS } from "./Env"

import type { Map as MLMap, LngLatBounds } from "maplibre-gl"
import type { State } from "./Model"
import type { ImportedActivity } from "./DataImport"

let _map: MLMap
let _state: State

/* The render in progress, if there is one. Aborting it cancels its requests
 * to the backend, and the backend cancels the Strava requests behind them. */
let current: AbortController | undefined

/* Why a render was aborted, passed as the AbortSignal's reason.
 *
 * STOPPED is the user pressing Stop: fetching ends, and what has already
 * arrived is drawn, as master's Abort button did. SUPERSEDED is a new query
 * starting while this one runs: its results are about to be replaced, so it
 * draws nothing and leaves the progress dialog to the new render. */
const STOPPED = "stopped"
const SUPERSEDED = "superseded"

export function initRender(map: MLMap, appState: State): void {
  _map = map
  _state = appState
  ImportProgress.onStop(abortRender)
}

/** Stop the render in progress, keeping whatever it has received so far. */
export function abortRender(): void {
  current?.abort(STOPPED)
}

/** Write to every .info-message element the sidebar puts in the DOM */
function message(msg: string): void {
  for (const el of Array.from(document.querySelectorAll(".info-message"))) {
    el.textContent = msg
  }
}

/** The `info` object the backend sends once, ahead of the activities. */
type QueryInfo = { polyline_precision: number; atypes: string[] }

/** The status messages the backend sends in among the activities. */
type Status = {
  msg?: string
  count?: number
  info?: QueryInfo
  wait?: number
  error?: string
}

/**
 * Show the status messages both legs of a render can receive. Returns an
 * error message if this was one, so the caller can keep it on screen.
 */
function showStatus(status: Status): string | undefined {
  if (status.msg) {
    ImportProgress.message(status.msg)
  } else if (typeof status.wait === "number") {
    const at = new Date(status.wait * 1000).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })
    ImportProgress.message(`Strava rate limit reached; resuming at ${at}`)
  } else if (typeof status.error === "string") {
    ImportProgress.message(status.error)
    return status.error
  }
}

/**
 * Give every activity its streams, taking them from the cache where we can
 * and fetching only the rest.
 *
 * The summaries have already arrived; this is the second leg. On a warm cache
 * it makes no request at all. Once `signal` is aborted it makes none either,
 * and only what the cache holds is filled in.
 */
async function fillStreamsFromCache(
  activities: ImportedActivity[],
  polylinePrecision: number,
  signal: AbortSignal
): Promise<string | undefined> {
  if (!activities.length) return

  const t0 = performance.now()
  ImportProgress.message("reading cached tracks…")

  /* Every read is issued in the same tick.
   *
   * myIdb batches whatever is queued inside its 10ms window into one
   * IndexedDB transaction. Awaiting the reads one at a time defeated that
   * completely: each one queued a batch of itself, waited out the full window
   * alone, and resolved -- so a cache hit cost 10ms of pure idling, and a
   * render of 120 activities spent 1.2 seconds doing nothing at all. Issued
   * together they collapse into a single transaction. */
  const packed = await Promise.all(
    activities.map((A) => StreamCache.get(A._id))
  )
  if (signal.reason === SUPERSEDED) return

  const misses: number[] = []
  let hits = 0

  for (let i = 0; i < activities.length; i++) {
    const bytes = packed[i]
    if (bytes && polylinePrecision !== undefined) {
      activities[i].streams = decodePackedStreams(bytes, polylinePrecision)
      hits++
      /* Decoding is the real work once the reads are batched, and it is
       * synchronous. Yield now and then so the progress dialog can actually
       * paint instead of the page locking up until the whole set is done. */
      if ((hits & 127) === 0) {
        ImportProgress.progress(hits, activities.length)
        await nextTask()
        if (signal.reason === SUPERSEDED) return
      }
    } else {
      misses.push(activities[i]._id)
    }
  }
  ImportProgress.progress(hits, activities.length)

  let error: string | undefined

  if (misses.length && !signal.aborted) {
    ImportProgress.message(`fetching ${misses.length} tracks…`)

    const byId = new Map(activities.map((A) => [A._id, A]))
    const streamQuery = {
      ...qToQ(_state.query, true),
      activity_ids: misses,
      /* The ids are explicit, so none of the other narrowing applies */
      limit: undefined as number,
    }

    let done = 0
    /* Same reasoning as the reads: awaiting each write made every activity
     * wait out myIdb's batch window on its own, and stalled the loop that is
     * draining the network stream. Collected and awaited together instead. */
    const writes: Promise<void>[] = []

    for await (const obj of makeActivityQuery(
      streamQuery,
      URLS.query,
      true,
      signal
    )) {
      if (!obj) continue
      if (!("_id" in obj)) {
        error = showStatus(<Status>obj) || error
        continue
      }

      const fetched = <ImportedActivity>(<unknown>obj)
      const A = byId.get(fetched._id)
      if (A && fetched.streams) {
        A.streams = fetched.streams
        if (fetched.mpk) writes.push(StreamCache.put(fetched._id, fetched.mpk))
      }
      ImportProgress.progress(hits + ++done, activities.length)
    }

    /* Tracks that arrived before a stop are still worth keeping */
    await Promise.all(writes)
  }

  /* One index write for the whole render, rather than one per activity */
  await StreamCache.flush()

  const { count, bytes } = StreamCache.stats()
  console.log(
    `stream cache: ${hits} hits, ${misses.length} misses ` +
      `in ${Math.round(performance.now() - t0)}ms; ` +
      `holding ${count} activities (${(bytes / 1e6).toFixed(1)} MB)`
  )

  /* Drop any activity we still could not get a track for, rather than handing
   * the renderer a half-built one. */
  for (let i = activities.length - 1; i >= 0; i--) {
    if (!activities[i].streams) activities.splice(i, 1)
  }

  return error
}

/**
 * Run the current query, replace the activity set with the result, and
 * redraw. Returns how many activities were rendered.
 *
 * Starting a render aborts any render still in progress.
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

  current?.abort(SUPERSEDED)
  const controller = new AbortController()
  current = controller
  const { signal } = controller

  try {
    return await render(backendQuery, caching, visual.autozoom, signal)
  } finally {
    if (current === controller) current = undefined
  }
}

async function render(
  backendQuery: ReturnType<typeof qToQ>,
  caching: boolean,
  autozoom: boolean,
  signal: AbortSignal
): Promise<number> {
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
  /* The last error the backend reported, kept on screen at the end */
  let error: string | undefined

  try {
    for await (const obj of makeActivityQuery(
      backendQuery,
      URLS.query,
      caching,
      signal
    )) {
      if (!obj) continue

      if ("_id" in obj) {
        incoming.push(<ImportedActivity>(<unknown>obj))
        ImportProgress.progress(incoming.length, expected)
      } else {
        /* Status messages from the backend: {msg} while it builds the index,
         * {count} before the activities start, {wait} while Strava's rate
         * limit holds it up, plus {info}, {delete} and {error} entries. */
        const status = <Status>obj
        if (status.info) {
          polylinePrecision = status.info.polyline_precision
        } else if (typeof status.count === "number") {
          expected = status.count
          ImportProgress.progress(incoming.length, expected)
        } else if (status.msg || status.wait !== undefined || status.error) {
          error = showStatus(status) || error
        } else {
          console.log(obj)
        }
      }
    }
    if (signal.reason === SUPERSEDED) return 0

    if (caching) {
      error =
        (await fillStreamsFromCache(incoming, polylinePrecision, signal)) ||
        error
    }
  } catch (e) {
    ImportProgress.finish("import failed")
    throw e
  }
  if (signal.reason === SUPERSEDED) return 0

  const count = incoming.length
  const stopped = signal.aborted ? "stopped; " : ""
  const summary = `${stopped}${count} activities${error ? ` (${error})` : ""}`

  if (!count) {
    ImportProgress.finish(error || `${stopped}no activities`, !!error)
    message(`${stopped}no activities`)
    console.warn("query returned no activities")
    return 0
  }

  ImportProgress.finish(summary, !!error)

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

  if (autozoom) fitTo(await ActivityCollection.getLatLngBounds())

  return count
}

/** Fit the map to some bounds, keeping the camera's pitch and bearing, and
 * clear of the sidebar tabs on the left */
export function fitTo(bounds: LngLatBounds | undefined): void {
  if (!bounds || !_map) return
  _map.fitBounds(bounds, {
    padding: { top: 40, bottom: 40, left: 60, right: 40 },
    pitch: _map.getPitch(),
    bearing: _map.getBearing(),
    maxZoom: 16,
  })
}
