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

import { LatLngBounds } from "leaflet"
import type { Bounds } from "../Bounds"
import type { PixelGraphics } from "./PixelGraphics"
import type { ImportedActivity } from "../DataImport"

export const items: Map<number, Activity> = new Map()

let itemsArray: Activity[]

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
  itemsArray = []
  inView.clear()
  lastInView.clear()
}

/**
 * This should be called after adding or removing Activities.
 */
export function reset(): void {
  setDotColors()

  itemsArray = [...items.values()]

  for (let i = 0; i < itemsArray.length; i++) {
    itemsArray[i].idx = i
  }

  /*
   * We will pack all relevant data into linear memory
   */
  const nbytes = {
    px: 0,
    time: 0,
    alt: 0,
  }

  for (let i = 0; i < itemsArray.length; i++) {
    const A = itemsArray[i]
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
  const timeView = new Uint16Array(buf, nbytes.px, nbytes.time / 2)
  const altView = new Int16Array(buf, nbytes.px + nbytes.time, nbytes.alt / 2)

  let pxLoc = 0
  let timeLoc = 0
  let altLoc = 0

  for (let i = 0; i < itemsArray.length; i++) {
    const s = itemsArray[i].streams
    pxView.set(s.px, pxLoc)
    s.px = pxView.subarray(pxLoc, (pxLoc += s.px.length))

    timeView.set(s.time, timeLoc)
    s.time = timeView.subarray(timeLoc, (timeLoc += s.time.length))

    altView.set(s.altitude, altLoc)
    s.altitude = altView.subarray(altLoc, (altLoc += s.altitude.length))
  }

  inView.resize(itemsArray.length)
  lastInView.resize(itemsArray.length)
}

/** assign a dot-color to each item of _items */
function setDotColors(): void {
  const colorPalette = ColorPalette.makePalette(items.size)
  let i = 0
  for (const A of items.values()) {
    A.colors.dot = colorPalette[i++]
  }
}

/** The set indicating which activities are currently in view. It is actually
 * a set of indices of Activities in itemsArray.*/
const inView = new BitSet(1)
const lastInView = new BitSet(1)

/**
 * Update StyleGroups for our collection of activities
 */
export async function updateContext(
  viewportPxBounds: Bounds,
  zoom: number
): Promise<void> {
  inView.clear()

  let queuedTasks

  // update which items are in the current view
  for (let i = 0, len = itemsArray.length; i < len; i++) {
    const A = itemsArray[i]

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
    const A = itemsArray[i]
    if (A.segMask) A.segMask.clear()
    A._containedInMapBounds = false
  })
  inView.clone(lastInView)

  // Make segMasks (this is usually very fast)
  inView.forEach((i) => {
    const A = itemsArray[i]
    if (!A.idxSet[zoom]) {
      throw `idxSet[${zoom}] didn't get made`
    }

    if (!A.updateSegMask(viewportPxBounds, zoom)) {
      inView.remove(i)
    }
  })
}

/**
 * Returns an array of activities given a selection region
 * in screen-ccordinates
 */
export function* inPxBounds(pxBounds: Bounds): IterableIterator<Activity> {
  for (const idx of inView) {
    const A = itemsArray[idx]
    for (let j = 0; j < A.streams.time.length; j++) {
      // was A.pointAccessor(j), which does not exist on Activity
      const p = A.pointAt(j)
      if (pxBounds.contains(p[0], p[1])) {
        yield A
        break
      }
    }
  }
}

export async function getLatLngBounds(
  ids?: Iterable<number>,
  only_selected?: boolean
): Promise<LatLngBounds> {
  const bounds = new LatLngBounds()
  ids = ids || items.keys()
  if (ids) {
    for (const id of ids) {
      const A = items.get(id)
      if (!only_selected || A.selected) bounds.extend(A.llBounds)
    }
  }
  if (bounds.isValid()) return bounds
}

/*
 * Methods for drawing to imageData objects
 */

type drawOutput = { pxg: PixelGraphics; count: number }

export async function drawPaths(pxg: PixelGraphics): Promise<drawOutput> {
  const drawSegFunc = (x0: number, y0: number, x1: number, y1: number) => {
    pxg.drawSegment(x0, y0, x1, y1)
  }

  let count = 0
  inView.forEach((i) => {
    const A = itemsArray[i]
    pxg.setColor(A.colors.path)
    pxg.setLineWidth(
      A.selected ? options.selected.pathWidth : options.normal.pathWidth
    )
    count += A.forEachSegment(drawSegFunc)
  })

  return { count, pxg }
}

/* Scratch buffer for dot positions, reused across activities and frames.
 * Activity.update_dotlocs fills it with consecutive [x, y] pairs. */
let dotlocs = new Float32Array(2048)

export async function drawDots(
  pxg: PixelGraphics,
  dotSize: number,
  T: number,
  tsecs: number
): Promise<drawOutput> {
  let count = 0
  // not rounded: Canvas 2D draws fractional sizes
  const sz = dotSize

  inView.forEach((i) => {
    const A = itemsArray[i]
    if (!A.segMask) return

    /* Upper bound on this activity's dots: each segment yields at most
     * (its time span)/T + 1, and those spans sum to at most the activity's
     * elapsed time. update_dotlocs does not bounds-check the buffer. */
    const maxDots = A.segMask.size() + Math.ceil(A.elapsed_time / T) + 2
    if (dotlocs.length < 2 * maxDots) dotlocs = new Float32Array(2 * maxDots)

    const n = A.update_dotlocs(tsecs, T, dotlocs)
    if (!n) return

    pxg.setColor(A.colors.dot)
    if (A.selected) {
      for (let j = 0; j < n; j++) {
        pxg.drawCircle(dotlocs[2 * j], dotlocs[2 * j + 1], sz)
      }
    } else {
      for (let j = 0; j < n; j++) {
        pxg.drawSquare(dotlocs[2 * j], dotlocs[2 * j + 1], sz)
      }
    }
    count += n
  })

  return { count, pxg }
}
