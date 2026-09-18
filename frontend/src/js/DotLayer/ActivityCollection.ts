/*
 *  ActivityCollection is a some methods for managing a collection of Activity objects.
 *  Since this might running inside a worker, we cannot assume access to anything
 *  on the main thread.
 */

import * as ColorPalette from "./ColorPalette"
import { Activity } from "./Activity"
import { options } from "./Defaults"
import { BitSet } from "../BitSet"
import { queueTask, nextTask } from "../appUtil"

import { LngLatBounds } from "maplibre-gl"
import type { Bounds } from "../Bounds"
import type { ImportedActivity } from "../DataImport"

export const items: Map<number, Activity> = new Map()

let _itemsArray: Activity[]

export function add(specs: ImportedActivity): void {
  const A = new Activity(specs)
  items.set(A.id, A)
}

export function remove(id: number): void {
  items.delete(id)
}

/** Drop every activity. Used when a new query replaces the current set. */
export function clear(): void {
  items.clear()
  _itemsArray = []
  inView.clear()
  lastInView.clear()
}

/**
 * This should be called after adding or removing Activities.
 */
export function reset(): void {
  setDotColors()

  _itemsArray = [...items.values()]

  for (let i = 0; i < _itemsArray.length; i++) {
    _itemsArray[i].idx = i
  }

  /*
   * We will pack all relevant data into linear memory
   */
  const nbytes = {
    px: 0,
    time: 0,
    alt: 0,
  }

  for (let i = 0; i < _itemsArray.length; i++) {
    const A = _itemsArray[i]
    nbytes.px += A.streams.px.byteLength
    nbytes.time += A.streams.time.byteLength
    nbytes.alt += A.streams.altitude.byteLength
  }

  /* One contiguous buffer holding every activity's streams, rounded up to
   * whole 64k pages. This was a WebAssembly.Memory, used purely as a growable
   * ArrayBuffer and unrelated to the (now deleted) wasm module. */
  const numPages =
    ((nbytes.px + nbytes.time + nbytes.alt + 0xffff) & ~0xffff) >>> 16

  const buf = new ArrayBuffer(numPages << 16)
  const pxView = new Float32Array(buf, 0, nbytes.px / 4)
  const timeView = new Uint32Array(buf, nbytes.px, nbytes.time / 4)
  const altView = new Int16Array(buf, nbytes.px + nbytes.time, nbytes.alt / 2)

  let pxLoc = 0
  let timeLoc = 0
  let altLoc = 0

  for (let i = 0; i < _itemsArray.length; i++) {
    const s = _itemsArray[i].streams
    pxView.set(s.px, pxLoc)
    s.px = pxView.subarray(pxLoc, (pxLoc += s.px.length))

    timeView.set(s.time, timeLoc)
    s.time = timeView.subarray(timeLoc, (timeLoc += s.time.length))

    altView.set(s.altitude, altLoc)
    s.altitude = altView.subarray(altLoc, (altLoc += s.altitude.length))
  }

  inView.resize(_itemsArray.length)
  lastInView.resize(_itemsArray.length)
}

/** How far the palette is turned before it is dealt out. See makePalette. */
let colorRotation = 0

/**
 * Assign a dot-color to each item of _items, in the order the table lists
 * them -- most recent first -- since neighbours in that list are the ones
 * the palette keeps apart. The order they arrive in isn't that: the backend
 * sends the streams it already holds first, then the rest in whatever order
 * Strava answers (Streams.aiter_query).
 */
function setDotColors(): void {
  const colorPalette = ColorPalette.makePalette(items.size, colorRotation)
  const byDate = [...items.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0))
  for (let i = 0; i < byDate.length; i++) byDate[i].colors.dot = colorPalette[i]
}

/**
 * Turn the palette, in degrees, and deal it out again.
 *
 * Kept here rather than read from the model because this module is written to
 * run inside a worker, where there is no model to read.
 */
export function setColorRotation(degrees: number): void {
  colorRotation = degrees
  setDotColors()
}

/** The set indicating which activities are currently in view. It is actually
 * a set of indices of Activities in _itemsArray.*/
const inView = new BitSet(1)
const lastInView = new BitSet(1)

/**
 * Update StyleGroups for our collection of activities
 */
export async function updateContext(
  viewportPxBounds: Bounds,
  zoom: number
): Promise<void> {
  if (!_itemsArray) return
  inView.clear()

  let queuedTasks

  // update which items are in the current view
  for (let i = 0, len = _itemsArray.length; i < len; i++) {
    const A = _itemsArray[i]

    if (viewportPxBounds.overlaps(A.pxBounds)) {
      inView.add(i)

      // Making an idxSet is slow so we create new tasks for that
      if (!A.idxSet[zoom]) {
        queueTask(() => A.makeIdxSet(zoom))
        queuedTasks = true
      }
    }
  }

  // if we queued and makeIdxSet tasks, let's wait for them to finish
  if (queuedTasks) await nextTask()

  const newlyInView = inView.difference(lastInView, lastInView)
  newlyInView.forEach((i) => {
    const A = _itemsArray[i]
    if (A.segMask) A.segMask.clear()
    A._containedInMapBounds = false
  })
  inView.clone(lastInView)

  // Make segMasks (this is usually very fast)
  inView.forEach((i) => {
    const A = _itemsArray[i]
    if (!A.idxSet[zoom]) {
      throw `idxSet[${zoom}] didn't get made`
    }

    if (!A.updateSegMask(viewportPxBounds, zoom)) {
      inView.remove(i)
    }
  })
}

/** Every activity, in index order: itemsArray()[A.idx] === A */
export function itemsArray(): Activity[] {
  return _itemsArray || []
}

/** The activities currently in view, in no particular order */
export function* inViewItems(): IterableIterator<Activity> {
  for (const idx of inView) yield _itemsArray[idx]
}

export async function getLatLngBounds(
  ids?: Iterable<number>,
  only_selected?: boolean
): Promise<LngLatBounds | undefined> {
  return boundsOf(
    [...(ids || items.keys())]
      .map((id) => items.get(id))
      .filter((A) => A && (!only_selected || A.selected))
  )
}

/** The bounds enclosing these activities, or undefined if there are none */
export function boundsOf(activities: Iterable<Activity>): LngLatBounds {
  /* A fresh bounds: extend() mutates in place, so extending the first
   * activity's own llBounds would grow that activity's bounds. */
  let bounds: LngLatBounds
  for (const A of activities) {
    if (!bounds)
      bounds = new LngLatBounds(
        A.llBounds.getSouthWest(),
        A.llBounds.getNorthEast()
      )
    else bounds.extend(A.llBounds)
  }
  return bounds
}

type DrawStyle = typeof options.normal

/**
 * Call draw(A, style) for each activity in view.
 *
 * With nothing selected that is one pass, in the normal style. With a
 * selection it is two: everything else first, faded, then the selection on
 * top of it -- so selected paths and dots are never buried under the rest.
 */
export function forEachInViewLayered(
  draw: (A: Activity, style: DrawStyle) => void
): void {
  let anySelected = false
  for (const A of items.values()) {
    if (A.selected) {
      anySelected = true
      break
    }
  }

  if (!anySelected) {
    inView.forEach((i) => draw(_itemsArray[i], options.normal))
    return
  }
  inView.forEach((i) => {
    if (!_itemsArray[i].selected) draw(_itemsArray[i], options.unselected)
  })
  inView.forEach((i) => {
    if (_itemsArray[i].selected) draw(_itemsArray[i], options.selected)
  })
}
