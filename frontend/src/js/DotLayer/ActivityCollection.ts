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
import { PixelGraphics } from "./PixelGraphics"
import { Bounds } from "../appUtil"

export const items: Map<number, Activity> = new Map()
export const pxg = new PixelGraphics()

let itemsArray: Activity[]

export function add(specs): void {
  const A = new Activity(specs)
  A._selected = A.selected

  Object.defineProperty(A, "selected", {
    get() {
      return this._selected
    },

    set(value) {
      this._selected = value
    },
  })

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
  resetSegMasks()
  inView.resize(itemsArray.length)
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

/**
 * Update StyleGroups for our collection of activities
 * @return {[type]} [description]
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
 * @param  {Bounds} selectPxBounds Bounds Object
 */
export function* inPxBounds(pxBounds: Bounds): IterableIterator<Activity> {
  for (const idx of inView) {
    const A = itemsArray[idx]
    for (const p of A.pointsIterator()) {
      if (pxBounds.contains(p[0], p[1])) {
        yield A
        break
      }
    }
  }
}

/*
 * Clear all segMasks and force rebuilding them
 */
export function resetSegMasks(): void {
  for (const A of itemsArray) {
    A.resetSegMask()
  }
}

/*
 * Methods for drawing to imageData objects
 */
const drawSegFunc = (x0: number, y0: number, x1: number, y1: number) => {
  pxg.drawSegment(x0, y0, x1, y1)
}

export function drawPaths(imageData: myImageData, drawDiff: boolean): number {
  if (pxg.imageData !== imageData) pxg.imageData = imageData

  if (!drawDiff && !pxg.drawBounds.isEmpty()) pxg.clear()

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
  if (pxg.drawBounds.isEmpty()) return 0

  // add padding to the bounds, but only if they have changed.
  // This prevents ever-increasing bounds
  const newArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1])
  if (newArea !== oldArea) {
    const [xmin, ymin, xmax, ymax] = bounds
    pxg.drawBounds.update(...pxg.clip(xmin - maxLW, ymin - maxLW))
    pxg.drawBounds.update(...pxg.clip(xmax + maxLW, ymax + maxLW))
  }

  return count
}

export function drawDots(
  imageData: myImageData,
  dotSize: number,
  T: number,
  timeScale: number,
  tsecs: number,
  drawDiff: boolean
): number {
  if (pxg.imageData !== imageData) pxg.imageData = imageData

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
    count += A.forEachDot(drawFunc, tsecs, T, timeScale, drawDiff)
  })
  if (pxg.drawBounds.isEmpty()) return 0

  const newArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1])

  // add padding to the bounds, but only if they have changed.
  // This prevents ever-increasing bounds
  if (newArea !== oldArea) {
    const [xmin, ymin, xmax, ymax] = bounds
    pxg.drawBounds.update(...pxg.clip(xmin - 10, ymin - 10))
    pxg.drawBounds.update(...pxg.clip(xmax + 20, ymax + 20))
  }

  return count
}
