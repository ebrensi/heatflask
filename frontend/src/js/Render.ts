/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
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
import {
  qToQ,
  makeActivityQuery,
  decodePackedStreams,
  ACTIVITY_FIELDNAMES as F,
} from "./DataImport"
import { nextTask } from "./appUtil"
import { URLS } from "./Env"

import { LngLatBounds } from "maplibre-gl"
import type { Map as MLMap } from "maplibre-gl"
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
  /** with error: the map was refused to a viewer who could log in */
  login?: boolean
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
 * and fetching only the rest, and hand each one to `draw` as it gets them.
 *
 * The summaries have already arrived; this is the second leg. On a warm cache
 * it makes no request at all. Once `signal` is aborted it makes none either,
 * and only what the cache holds is filled in. An activity we cannot get a
 * track for is never handed over.
 */
async function fillStreamsFromCache(
  activities: ImportedActivity[],
  polylinePrecision: number,
  signal: AbortSignal,
  draw: Progressive
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
      draw.add(activities[i])
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
      /* How many tracks this render drew without asking for them. The server
       * cannot see it any other way: it only hears about the misses, so its
       * own "cached" count is Mongo alone and its history said nothing about
       * the cache that does most of the work. A count, not the ids -- the
       * server only needs the number, and the ids would be the larger half of
       * the request. */
      browser_hits: hits,
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
        draw.add(A)
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

  return error
}

/* Draws while tracks are arriving are at least this far apart, and further
 * if a draw is slow: never more than 1/DRAW_SHARE of the time goes to them,
 * so the map stays responsive to the viewer while a large set comes in. */
const DRAW_INTERVAL_MS = 1000
const DRAW_SHARE = 5

/* Draws are one at a time, across renders too: a superseded render's last
 * draw can still be running when the next render's first one starts. */
let drawQueue: Promise<void> = Promise.resolve()

/**
 * Puts activities on the map as they arrive, a batch at a time.
 *
 * The first activity is drawn as soon as it arrives, and the rest in batches
 * about a second apart, so a viewer waiting on Strava's rate limit -- which
 * can stall a first map for fifteen minutes at a time -- has the map to use
 * in the meantime rather than a dialog.
 *
 * The previous set stays on the map until the first of the new one is ready
 * to replace it: clearing up front emptied the map for the whole network
 * round-trip.
 *
 * With auto-zoom on, the map is refitted whenever what has arrived reaches
 * past what it was last fitted to. Moving the map by hand turns auto-zoom off
 * (MapAPI.ts), after which arrivals leave the view alone.
 */
class Progressive {
  count = 0
  private pending: ImportedActivity[] = []
  private idsByDate?: number[]
  private started = false
  private finished = false
  private timer = 0
  private drawing?: Promise<void>
  private lastDraw = -Infinity
  private interval = DRAW_INTERVAL_MS
  private fitted?: LngLatBounds
  private error: unknown

  constructor(private signal: AbortSignal) {}

  /** The whole set is known ahead of its tracks: colour it and fit to it now */
  expect(summaries: ImportedActivity[]): void {
    this.idsByDate = [...summaries]
      .sort((a, b) => (b[F.UTC_START_TIME] || 0) - (a[F.UTC_START_TIME] || 0))
      .map((A) => A._id)
    this.fit(summaryBounds(summaries))
  }

  add(A: ImportedActivity): void {
    this.pending.push(A)
    this.schedule()
  }

  /** Draw what is still waiting, now, and wait for that */
  async finish(): Promise<void> {
    this.finished = true
    clearTimeout(this.timer)
    await this.drawing
    if (this.pending.length) this.run()
    await this.drawing
    if (this.error) throw this.error
  }

  private schedule(): void {
    if (this.finished || this.timer || this.drawing) return
    const wait = this.lastDraw + this.interval - performance.now()
    this.timer = window.setTimeout(() => {
      this.timer = 0
      this.run()
    }, Math.max(0, wait))
  }

  private run(): void {
    this.drawing = drawQueue = drawQueue
      .then(() => this.draw())
      .catch((e) => {
        this.error = e
      })
      .finally(() => {
        this.drawing = undefined
        if (this.pending.length) this.schedule()
      })
  }

  private async draw(): Promise<void> {
    if (this.signal.reason === SUPERSEDED || !this.pending.length) return
    const t0 = performance.now()

    if (!this.started) {
      this.started = true
      ActivityCollection.clear()
      if (this.idsByDate) ActivityCollection.planColors(this.idsByDate)
      ImportProgress.aside()
    }
    for (const A of this.pending) ActivityCollection.add(A)
    this.count += this.pending.length
    this.pending = []

    /* reset() packs the streams, builds the per-zoom index sets, draws, and
     * starts the animation. */
    await dotLayer.reset()

    /* After reset, not before: ActivityCollection.setDotColors() runs inside
     * it, so until it has, every Activity.colors.dot is still null and the
     * table's colour swatches come out blank. */
    Table.update()

    if (!this.idsByDate) this.fit(await ActivityCollection.getLatLngBounds())

    this.lastDraw = performance.now()
    this.interval = Math.max(
      DRAW_INTERVAL_MS,
      DRAW_SHARE * (this.lastDraw - t0)
    )
  }

  /** Fit the map to bounds, if auto-zoom is on and they reach past the last */
  private fit(bounds: LngLatBounds | undefined): void {
    if (!bounds || !_state.visual.autozoom) return
    if (
      this.fitted?.contains(bounds.getSouthWest()) &&
      this.fitted.contains(bounds.getNorthEast())
    )
      return
    this.fitted = bounds
    fitTo(bounds)
  }
}

/** The bounds of activities from their summaries, before any track is in */
function summaryBounds(summaries: ImportedActivity[]): LngLatBounds {
  let bounds: LngLatBounds
  for (const A of summaries) {
    const b = A[F.LATLNG_BOUNDS]
    if (!b) continue
    /* the backend sends corners as [lat, lng]; MapLibre wants [lng, lat] */
    const sw: [number, number] = [b.SW[1], b.SW[0]]
    const ne: [number, number] = [b.NE[1], b.NE[0]]
    if (bounds) bounds.extend(new LngLatBounds(sw, ne))
    else bounds = new LngLatBounds(sw, ne)
  }
  return bounds
}

/**
 * Run the current query, replace the activity set with the result, and
 * redraw. Returns how many activities were rendered.
 *
 * Starting a render aborts any render still in progress.
 */
export async function renderFromQuery(): Promise<number> {
  if (!_state) throw new Error("initRender() has not been called")
  const { query } = _state

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
    return await render(backendQuery, caching, signal)
  } finally {
    if (current === controller) current = undefined
  }
}

async function render(
  backendQuery: ReturnType<typeof qToQ>,
  caching: boolean,
  signal: AbortSignal
): Promise<number> {
  message("importing…")
  ImportProgress.start()

  const draw = new Progressive(signal)
  /* With the cache on, these are the summaries, whose tracks come after */
  const summaries: ImportedActivity[] = []
  /* How many the backend says are coming, so the progress bar can be a real
   * bar rather than an indeterminate one. */
  let expected: number | undefined
  /* Needed to decode blobs that came from the cache rather than the wire. */
  let polylinePrecision: number | undefined
  /* The last error the backend reported, kept on screen at the end */
  let error: string | undefined

  try {
    let received = 0
    for await (const obj of makeActivityQuery(
      backendQuery,
      URLS.query,
      caching,
      signal
    )) {
      if (!obj) continue

      if ("_id" in obj) {
        const A = <ImportedActivity>(<unknown>obj)
        if (caching) summaries.push(A)
        else if (A.streams) draw.add(A)
        ImportProgress.progress(++received, expected)
      } else {
        /* Status messages from the backend: {msg} while it builds the index,
         * {count} before the activities start, {wait} while Strava's rate
         * limit holds it up, plus {info}, {delete} and {error} entries. */
        const status = <Status>obj
        if (status.info) {
          polylinePrecision = status.info.polyline_precision
        } else if (typeof status.count === "number") {
          expected = status.count
          ImportProgress.progress(received, expected)
        } else if (status.error && status.login !== undefined) {
          /* refused outright: nothing else is coming */
          ImportProgress.refused(status.error, status.login)
          message(status.error)
          return 0
        } else if (status.msg || status.wait !== undefined || status.error) {
          error = showStatus(status) || error
        } else {
          console.log(obj)
        }
      }
    }
    if (signal.reason === SUPERSEDED) return 0

    if (caching) {
      draw.expect(summaries)
      error =
        (await fillStreamsFromCache(
          summaries,
          polylinePrecision,
          signal,
          draw
        )) || error
    }
    await draw.finish()
  } catch (e) {
    ImportProgress.finish("import failed")
    throw e
  }
  if (signal.reason === SUPERSEDED) return 0

  const count = draw.count
  const stopped = signal.aborted ? "stopped; " : ""
  const summary = `${stopped}${count} activities${error ? ` (${error})` : ""}`

  if (!count) {
    ImportProgress.finish(error || `${stopped}no activities`, !!error)
    message(`${stopped}no activities`)
    console.warn("query returned no activities")
    return 0
  }

  ImportProgress.finish(summary, !!error)
  message(`${count} activities`)
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
