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
import { LatLngBounds } from "../myLeaflet"

import type { Bounds } from "../appUtil"
import type { PixelGraphics } from "./PixelGraphics"
import type { ActivitySpec } from "./Activity"

export const items: Map<number, Activity> = new Map()

let itemsArray: Activity[]
let memory: WebAssembly.Memory

export function add(specs: ActivitySpec): void {
  const A = new Activity(specs)
  items.set(A.id, A)
}

export function remove(id: number | string): void {
  items.delete(+id)
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
  let pointsBufSize = 0
  let timeBufSize = 0
  for (let i = 0; i < itemsArray.length; i++) {
    const A = itemsArray[i]
    pointsBufSize += A.px.length << 2
    timeBufSize += A.time.byteLength
  }

  const numPages = ((pointsBufSize + timeBufSize + 0xffff) & ~0xffff) >>> 16
  console.log({ pointsBufSize, timeBufSize, numPages })

  memory = new WebAssembly.Memory({ initial: numPages })
  const buf = memory.buffer
  // const buf = new ArrayBuffer(pointsBufSize + timeBufSize)
  const f32view = new Float32Array(buf, 0, pointsBufSize >> 2)
  const uint8view = new Uint8Array(buf, pointsBufSize, timeBufSize)
  let pos32 = 0
  let pos8 = 0
  for (let i = 0; i < itemsArray.length; i++) {
    const A = itemsArray[i]
    f32view.set(A.px, pos32)
    A.px = f32view.subarray(pos32, (pos32 += A.px.length))

    uint8view.set(new Uint8Array(A.time), pos8)
    A.time = uint8view.subarray(pos8, (pos8 += A.time.byteLength))
  }

  inView.resize(itemsArray.length)
  lastInView.resize(itemsArray.length)
}

/*
 * assign a dot-color to each item of _items
 */
function setDotColors(): void {
  const colorPalette = ColorPalette.makePalette(items.size)
  let i = 0
  for (const A of items.values()) {
    A.colors.dot = colorPalette[i++]
  }
}

/*
 * inView is the set indicating which activities are currently in view. It is actually
 * a set of indices of Activities in itemsArray.
 */
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
    for (let j = 0; j < A.n; j++) {
      const p = A.pointAccessor(j)
      if (pxBounds.contains(p[0], p[1])) {
        yield A
        break
      }
    }
  }
}

export async function getLatLngBounds(
  ids?: Iterable<number>
): Promise<LatLngBounds> {
  const bounds = new LatLngBounds()

  if (ids) {
    for (const id of ids) {
      bounds.extend(items.get(id).llBounds)
    }
  } else {
    for (const A of items.values()) {
      bounds.extend(A.llBounds)
    }
  }
  if (bounds.isValid()) return bounds
}

export async function getSelectedLatLngBounds(): Promise<LatLngBounds> {
  const bounds = new LatLngBounds()
  for (const A of items.values()) {
    if (A.selected) {
      bounds.extend(A.llBounds)
    }
  }
  if (bounds.isValid()) return bounds
}

/*
 * Methods for drawing to imageData objects
 */

type drawOutput = { pxg: PixelGraphics; count: number }

export async function drawPaths(
  pxg: PixelGraphics,
  drawDiff: boolean
): Promise<drawOutput> {
  if (!drawDiff && !pxg.drawBounds.isEmpty()) pxg.clear()

  const drawSegFunc = (x0: number, y0: number, x1: number, y1: number) => {
    pxg.drawSegment(x0, y0, x1, y1)
  }
  const bounds = pxg.drawBounds.data
  const oldArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1])

  let count = 0
  let maxLW = 0
  inView.forEach((i) => {
    const A = itemsArray[i]
    pxg.setColor(A.colors.path)

    const LW = A.selected
      ? options.selected.pathWidth
      : options.normal.pathWidth

    if (LW > maxLW) maxLW = LW
    pxg.setLineWidth(LW)

    count += A.forEachSegment(drawSegFunc, drawDiff)
  })

  pxg.updateDrawBoundsFromWasm()

  if (!pxg.drawBounds.isEmpty()) {
    // add padding to the bounds, but only if they have changed.
    // This prevents ever-increasing bounds
    const newArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1])
    if (newArea !== oldArea) {
      const [xmin, ymin, xmax, ymax] = bounds
      pxg.drawBounds.update(
        Math.max(xmin - maxLW, 0),
        Math.max(ymin - maxLW, 0)
      )
      pxg.drawBounds.update(
        Math.min(xmax + maxLW, pxg.width),
        Math.min(ymax + maxLW, pxg.height)
      )
    }
  }

  return { count, pxg }
}

export async function drawDots(
  pxg: PixelGraphics,
  dotSize: number,
  T: number,
  tsecs: number,
  drawDiff: boolean
): Promise<drawOutput> {
  if (!drawDiff && !pxg.drawBounds.isEmpty()) pxg.clear()

  const bounds = pxg.drawBounds.data
  const oldArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1])

  let count = 0
  const sz = Math.round(dotSize)
  const circle = (x: number, y: number) => pxg.drawCircle(x, y, sz)
  const square = (x: number, y: number) => pxg.drawSquare(x, y, sz)

  inView.forEach((i) => {
    const A = itemsArray[i]
    pxg.setColor(A.colors.dot)
    const drawFunc = A.selected ? circle : square
    count += A.forEachDot(drawFunc, tsecs, T, drawDiff)
  })

  pxg.updateDrawBoundsFromWasm()

  if (!pxg.drawBounds.isEmpty()) {
    const newArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1])

    // add padding to the bounds, but only if they have changed.
    // This prevents ever-increasing bounds
    if (newArea !== oldArea) {
      const [xmin, ymin, xmax, ymax] = bounds
      pxg.drawBounds.update(
        Math.max(0, xmin - 3 * sz),
        Math.max(0, ymin - 3 * sz)
      )
      pxg.drawBounds.update(
        Math.min(pxg.width, xmax + 3 * sz),
        Math.min(pxg.height, ymax + 3 * sz)
      )
    }
  }

  return { count, pxg }
}
