/*
 * StreamCache -- keep activity streams in the browser, the way tiles are kept.
 *
 * Streams are the whole cost of a render: about 12KB of packed bytes each,
 * against 208 bytes for the index summary that describes one. Everything else
 * in a query is rounding error.
 *
 * Why this needs almost no invalidation
 * -------------------------------------
 * A recorded track is immutable. Strava's webhooks can only change an
 * activity's title, type, private flag or visibility -- all of which live in
 * the summary, not the stream -- so a stream that was correct when it was
 * stored stays correct forever. That means:
 *
 *   - renames, type changes, privacy changes  the summary is refetched on
 *                                             every query anyway, so there is
 *                                             nothing to sync here
 *   - deletion                                the activity stops matching the
 *                                             index query, so its stream is
 *                                             never looked up again; the entry
 *                                             is just an orphan until evicted
 *
 * Strava never reuses activity ids, so a cached blob cannot be served for the
 * wrong activity. The index query stays the source of truth for what to draw
 * and what its metadata is; this is only a content store keyed by activity id.
 *
 * Scope
 * -----
 * One database per user, and only ever the signed-in user's own activities.
 * Browsing someone else's map caches nothing, so another athlete's tracks are
 * never left behind in your browser -- which is otherwise what would happen
 * when they later made an activity private.
 */

import * as idb from "./myIdb"

/*
 * Bump when the packed-stream encoding changes, which invalidates every
 * stored blob. The run-length codec grew a 16-bit type (ntype 2) this cycle;
 * bytes written before that decode to garbage rather than failing loudly,
 * so a version that travels with each record is not optional.
 */
const CODEC_VERSION = 2

const DB_PREFIX = "heatflask-streams"
const STORE_NAME = "streams"
const META_KEY = "__meta__"

/** Roughly how much we are willing to keep. ~20k activities at 12KB. */
const BUDGET_BYTES = 250 * 1024 * 1024
/** Evict down to this fraction of the budget, so it is not a constant churn. */
const EVICT_TO = 0.8

type Entry = {
  /** stored byte length */
  n: number
  /** last used, epoch seconds -- the LRU key */
  t: number
}

type Meta = {
  v: number
  entries: Record<string, Entry>
}

let store: idb.Store = null
let meta: Meta = null
let metaDirty = false

/** Total bytes currently accounted for in `meta`. */
function totalBytes(): number {
  let sum = 0
  for (const k in meta.entries) sum += meta.entries[k].n
  return sum
}

const nowSecs = () => Math.round(Date.now() / 1000)

/**
 * Open the cache for one user.
 *
 * Pass null (or mismatched ids) to leave it disabled: every other entry point
 * then becomes a no-op, so callers need no special-casing.
 */
export async function init(
  currentUserId?: number,
  targetUserId?: number
): Promise<boolean> {
  store = null
  meta = null

  /* Only the signed-in user's own activities, per the scoping note above. */
  if (!currentUserId || currentUserId !== targetUserId) return false

  try {
    store = new idb.Store(`${DB_PREFIX}-${currentUserId}`, STORE_NAME)
    const stored = <Meta>await idb.get(META_KEY, store)

    if (stored && stored.v === CODEC_VERSION && stored.entries) {
      meta = stored
    } else {
      /* No index, or one written by a different codec. Start clean rather
       * than trusting blobs we can no longer decode. */
      if (stored) await idb.clear(store)
      meta = { v: CODEC_VERSION, entries: {} }
      metaDirty = true
    }
  } catch (e) {
    console.warn("stream cache unavailable", e)
    store = null
    meta = null
    return false
  }

  return true
}

export function enabled(): boolean {
  return !!store && !!meta
}

/** The ids we hold, without touching the blobs themselves. */
export function cachedIds(): Set<number> {
  const ids = new Set<number>()
  if (!enabled()) return ids
  for (const k in meta.entries) ids.add(+k)
  return ids
}

/** Packed bytes for one activity, or null. Counts as a use, for LRU. */
export async function get(id: number): Promise<Uint8Array | null> {
  if (!enabled()) return null
  const entry = meta.entries[id]
  if (!entry) return null

  try {
    const bytes = <Uint8Array>await idb.get(String(id), store)
    if (!bytes) {
      // index and store disagree; believe the store
      delete meta.entries[id]
      metaDirty = true
      return null
    }
    entry.t = nowSecs()
    metaDirty = true
    return bytes
  } catch (e) {
    console.warn("stream cache read failed", id, e)
    return null
  }
}

/** Store one activity's packed bytes. */
export async function put(id: number, bytes: Uint8Array): Promise<void> {
  if (!enabled() || !bytes || !bytes.length) return
  try {
    await idb.set(String(id), bytes, store)
    meta.entries[id] = { n: bytes.length, t: nowSecs() }
    metaDirty = true
  } catch (e) {
    /* Quota is the likely cause. Make room and let the next write try again
     * rather than throwing out of a render. */
    console.warn("stream cache write failed", id, e)
    await evict()
  }
}

/**
 * Drop the least recently used entries until we are under EVICT_TO of budget.
 *
 * Only the index is sorted, never the blobs, so this stays cheap: one small
 * record read at startup covers thousands of activities.
 */
async function evict(): Promise<number> {
  if (!enabled()) return 0

  let total = totalBytes()
  if (total <= BUDGET_BYTES) return 0

  const target = BUDGET_BYTES * EVICT_TO
  const byAge = Object.keys(meta.entries).sort(
    (a, b) => meta.entries[a].t - meta.entries[b].t
  )

  let dropped = 0
  for (const id of byAge) {
    if (total <= target) break
    try {
      await idb.del(id, store)
    } catch (e) {
      console.warn("stream cache evict failed", id, e)
    }
    total -= meta.entries[id].n
    delete meta.entries[id]
    dropped++
  }

  if (dropped) {
    metaDirty = true
    console.log(`stream cache: evicted ${dropped} entries`)
  }
  return dropped
}

/**
 * Persist the index and make room if we are over budget.
 *
 * The index is written here rather than on every read, so a render that hits
 * a thousand cached activities costs one small write instead of a thousand.
 */
export async function flush(): Promise<void> {
  if (!enabled()) return
  await evict()
  if (!metaDirty) return
  try {
    await idb.set(META_KEY, meta, store)
    metaDirty = false
  } catch (e) {
    console.warn("stream cache index write failed", e)
  }
}

export function stats(): { count: number; bytes: number } {
  if (!enabled()) return { count: 0, bytes: 0 }
  return { count: Object.keys(meta.entries).length, bytes: totalBytes() }
}

/** Forget everything for this user. */
export async function clear(): Promise<void> {
  if (!enabled()) return
  await idb.clear(store)
  meta = { v: CODEC_VERSION, entries: {} }
  metaDirty = true
  await flush()
}

/*
 * The activity list page only wants to know which ids are held, and runs on a
 * page that never opens the map. This reads just the index record.
 */
export async function peekCachedIds(
  currentUserId?: number,
  targetUserId?: number
): Promise<Set<number>> {
  const ok = await init(currentUserId, targetUserId)
  return ok ? cachedIds() : new Set<number>()
}
