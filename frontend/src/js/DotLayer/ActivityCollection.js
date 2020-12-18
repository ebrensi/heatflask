/*
 *  ActivityCollection is a some methods for managing a collection of Activity objects.
 */

import * as ColorPalette from "./ColorPalette.js"
import * as ViewBox from "./ViewBox.js"
import { Activity } from "./Activity.js"
import { options } from "./Defaults.js"
import BitSet from "../BitSet.js"
import { targetUser, state } from "../Model.js"
import { Point } from "../myLeaflet.js"
import { getUrlString } from "../URL.js"
import { queueTask, nextTask } from "../appUtil.js"

export const items = new Map()
let itemsArray

state.items = items

export function add(specs) {
  const A = new Activity(specs)
  A._selected = A.selected

  Object.defineProperty(A, "selected", {
    get() {
      return this._selected
    },

    set(value) {
      this._selected = value
      updateSelect(this.idx, value)
    },
  })

  items.set(A.id, A)
}

export function remove(id) {
  items.delete(+id)
}

/**
 * This should be called after adding or removing Activities.
 */
export function reset() {
  setDotColors()

  itemsArray = [...items.values()]

  for (let i = 0; i < itemsArray.length; i++) {
    itemsArray[i].idx = i
  }
}

/*
 * assign a dot-color to each item of _items
 */
function setDotColors() {
  const colorPalette = ColorPalette.makePalette(items.size)
  let i = 0
  for (const A of items.values()) {
    A.colors.dot = colorPalette[i++]
  }
}

/*
 * We group items in our collection by path color, dot color, and whether
 * they are selected in order to optimze rendering paths and dots.  That way we can
 * do all drawing in chunks of one linestyle at a time.
 */

/*
 * inView is the set indicating which activities are currently in view. It is actually
 * a set of indices of Activities in itemsArray.
 */
const inView = {
  current: new BitSet(), // Current means since the last update
  last: new BitSet(),
}

/**
 * Update StyleGroups for our collection of activities
 * @return {[type]} [description]
 */
export async function updateGroups() {
  const zoom = ViewBox.zoom

  // the semicolon is necessary
  // see https://stackoverflow.com/questions/42562806/destructuring-assignment-and-variable-swapping
  ;[inView.current, inView.last] = [inView.last, inView.current]

  inView.current.clear()

  let queuedTasks

  // update which items are in the current view
  for (let i = 0, len = itemsArray.length; i < len; i++) {
    const A = itemsArray[i]

    if (A.inMapBounds()) {
      inView.current.add(i)

      // Making an idxSet is slow so we create new tasks for that
      if (!A.idxSet[zoom]) {
        queueTask(() => {
          A.makeIdxSet(zoom)
        })
        queuedTasks = true
      }
    }
  }

  // if we queued and makeIdxSet tasks, let's wait for them to finish
  if (queuedTasks) await nextTask()

  // Make segMasks (this is usually very fast)
  inView.current.forEach((i) => {
    const A = itemsArray[i]
    if (!A.idxSet[zoom]) {
      throw `idxSet[${zoom}] didn't get made`
    }
    const segMask = A.makeSegMask()
    if (segMask.isEmpty()) {
      inView.current.remove(i)
    }
  })

  // update items that have changed since last time
  const changed = inView.last.change(inView.current)
  changed.forEach((i) => {
    if (inView.current.has(i)) {
      addToGroup(i)
    } else {
      removeFromGroup(i)
    }
  })

  makeStyleGroups()
  return getGroups()
}

/*
 * These are partitions of inView into colors and whether or not they are selected.
 * Each Map will contain a Set for every color of Activity that is currently in view
 */
const GROUP_TYPES = {
  path: {
    partitions: { selected: new Map(), unselected: new Map() },
    spec: {
      normal: {
        lineWidth: options.normal.pathWidth,
        globalAlpha: options.normal.pathOpacity,
      },
      unselected: {
        lineWidth: options.unselected.pathWidth,
        globalAlpha: options.unselected.pathOpacity,
      },
      selected: {
        lineWidth: options.selected.pathWidth,
        globalAlpha: options.selected.pathOpacity,
      },
    },
  },

  dot: {
    partitions: { selected: new Map(), unselected: new Map() },
    spec: {
      normal: {
        globalAlpha: options.normal.dotOpacity,
      },
      unselected: {
        globalAlpha: options.unselected.dotOpacity,
      },
      selected: {
        globalAlpha: options.selected.dotOpacity,
      },
    },
  },
}

class StyleGroup {
  constructor(gtype, color) {
    const pen = gtype === "path" ? "strokeStyle" : "fillStyle"
    this.items = new Set()
    this.spec = { [pen]: color }
  }
  add(item) {
    this.items.add(item)
  }
  remove(item) {
    this.items.delete(item)
  }
  get empty() {
    return this.items.size === 0
  }
}

/**
 * Add i to a partition, creatting the partition if necessary
 * @param {Number} i -- index of an in-view Activity
 * @param {Boolean} [selected] -- specify which group to add to
 */
function addToGroup(i, selected) {
  const A = itemsArray[i]

  if (selected === undefined) {
    selected = A.selected
  }

  for (const gtype in GROUP_TYPES) {
    const partitions = GROUP_TYPES[gtype].partitions
    const groups = selected ? partitions.selected : partitions.unselected
    const color = A.colors[gtype]

    const styleGroup = groups.get(color)
    if (styleGroup) {
      styleGroup.add(A)
    } else {
      const styleGroup = new StyleGroup(gtype, color)
      styleGroup.add(A)
      groups.set(color, styleGroup)
    }
  }
}

/**
 * Remove i from a partition, deleting the partition if necessary
 * @param {number} i -- index of an Activity not in-view
 * @param {Boolean} [selected] -- specify which group to remove from
 */
function removeFromGroup(i, selected) {
  const A = itemsArray[i]

  if (selected === undefined) {
    selected = A.selected
  }

  for (const gtype in GROUP_TYPES) {
    const partitions = GROUP_TYPES[gtype].partitions
    const groups = selected ? partitions.selected : partitions.unselected
    const color = A.colors[gtype]
    const styleGroup = groups.get(color)

    styleGroup.remove(A)
    if (styleGroup.empty) {
      groups.delete(color)
    }
  }
}

export function getGroups() {
  const output = {}
  for (const gtype in GROUP_TYPES) {
    const partitions = GROUP_TYPES[gtype].partitions
    output[gtype] = [
      ...partitions.unselected.values(),
      ...partitions.selected.values(),
    ]
  }
  return output
}

/**
 * Update the partitions with a changed selection value for A = itemsArray[i]
 *
 * @param  {number} i -- then index of the activity
 */
function updateSelect(i, selected) {
  if (selected === undefined) {
    selected = itemsArray[i].selected
  }

  if (!inView.current.has(i)) {
    return
  }

  addToGroup(i, selected)
  removeFromGroup(i, !selected)
}

function makeStyleGroups() {
  for (const gtype in GROUP_TYPES) {
    const partitions = GROUP_TYPES[gtype].partitions

    /*
     * The specs for all activities default to "normal".
     *  If any activities are selected, we change the specs to
     *  "selected" and "unselected"
     */
    if (partitions.selected.size) {
      const sspec = GROUP_TYPES[gtype].spec.selected
      for (const sg of partitions.selected.values()) {
        Object.assign(sg.spec, sspec)
      }

      if (gtype === "dot") {
        for (const sg of partitions.selected.values()) sg.sprite = "circle"
      }

      const uspec = GROUP_TYPES[gtype].spec.unselected
      for (const sg of partitions.unselected.values()) {
        Object.assign(sg.spec, uspec)
      }

      if (gtype === "dot") {
        for (const sg of partitions.unselected.values()) sg.sprite = "square"
      }
    } else {
      // Set everything to normal
      const nspec = GROUP_TYPES[gtype].spec.normal
      for (const sg of partitions.unselected.values()) {
        Object.assign(sg.spec, nspec)
      }

      if (gtype === "dot") {
        for (const sg of partitions.unselected.values()) sg.sprite = "square"
      }
    }
  }
  // return getStyleGroups()
}

function selectedIDs() {
  return Array.from(items.values())
    .filter((A) => A.selected)
    .map((A) => A.id)
}

export function openSelected() {
  const ids = selectedIDs()
  if (ids.length) {
    const argString = getUrlString({ id: ids.join("+") })
    let url = targetUser.id + argString
    window.open(url, "_blank")
  }
}

/**
 * Returns an array of activities given a selection region
 * in screen-ccordinates
 * @param  {Bounds} selectPxBounds leaflet Bounds Object
 */
export function* inPxBounds(pxBounds) {
  // un-transform screen coordinates given by the selection
  // plugin to absolute values that we can compare ours to.
  ViewBox.unTransform(pxBounds.min)
  ViewBox.unTransform(pxBounds.max)

  for (const idx of inView.current) {
    const A = itemsArray[idx]
    const points = A.getPointAccessor(ViewBox.zoom)

    for (const i of A.segMask) {
      const px = points(i)
      const point = new Point(px[0], px[1])
      if (pxBounds.contains(point)) {
        yield A
        break
      }
    }
  }
}

/*
 * Clear all segMasks and force rebuilding them
 */
export function resetSegMasks() {
  for (const A of itemsArray) {
    if (A.segMask) {
      A.segMask.clear()
    }
  }
}
