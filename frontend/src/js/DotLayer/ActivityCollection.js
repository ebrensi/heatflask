/*
 *  ActivityCollection is a Map with some extra methods and properties
 *  for managing a collection of Activity objects.
 */

import * as ColorPalette from "./ColorPalette.js"
import * as ViewBox from "./ViewBox.js"
import { Activity } from "./Activity.js"
import { options } from "./Defaults.js"
import BitSet from "../BitSet.js"

export const items = new Map()
const idx = new Map()
let itemsArray
let needReset

export function add(specs) {
  const A = new Activity(specs)
  items.set(A.id, A)
  if (!needReset) {
    needReset = true
  }
}

export function remove(id) {
  items.delete(+id)
  if (!needReset) {
    needReset = true
  }
}

/**
 * This should be called after adding or removing Activities.
 */
export function reset() {
  setDotColors()

  itemsArray = Array.from(items.values())

  idx.clear()
  for (let i = 0; i < itemsArray.length; i++) {
    const A = itemsArray[i]
    idx.set(A.id, i)
  }
  needReset = false
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

export function updateGroups() {
  ViewBox.update()

  const zoom = ViewBox.zoom

  // the semicolon is necessary
  // see https://stackoverflow.com/questions/42562806/destructuring-assignment-and-variable-swapping
  ;[inView.current, inView.last] = [inView.last, inView.current]

  const currentInView = inView.current.clear()

  // update which items are in the current view
  for (let i = 0, len = itemsArray.length; i < len; i++) {
    const A = itemsArray[i]

    if (!A.inMapBounds) {
      continue
    }

    if (!(zoom in A.idxSet)) {
      A.simplify(zoom)
    }

    const segMask = A.makeSegMask()

    if (!segMask.isEmpty()) {
      currentInView.add(i)
    }
  }

  // update items that have changed since last time
  const changed = inView.last.change(currentInView)

  changed.forEach((i) => {
    if (currentInView.has(i)) {
      addToGroup(i)
    } else {
      removeFromGroup(i)
    }
  })

  // return the current state of inclusion
  return makeStyleGroups()
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
        strokeStyle: options.normal.pathColor,
      },
      unselected: {
        lineWidth: options.unselected.pathWidth,
        globalAlpha: options.unselected.pathOpacity,
        strokeStyle: options.unselected.pathColor,
      },
      selected: {
        lineWidth: options.selected.pathWidth,
        globalAlpha: options.selected.pathOpacity,
        strokeStyle: options.selected.pathColor,
      },
    },
  },

  dot: {
    partitions: { selected: new Map(), unselected: new Map() },
    spec: {
      normal: {
        globalAlpha: options.normal.dotOpacity,
        fillStyle: options.normal.dotColor,
      },
      unselected: {
        globalAlpha: options.unselected.dotOpacity,
        fillStyle: options.unselected.dotColor,
      },
      selected: {
        globalAlpha: options.selected.dotOpacity,
        fillStyle: options.selected.dotColor,
      },
    },
  },
}

class StyleGroup {
  constructor(gtype, color, selected) {
    const spec = selected
      ? GROUP_TYPES[gtype].spec.selected
      : GROUP_TYPES[gtype].spec.normal
    this.items = new Set()
    const pen = gtype === "path" ? "strokeStyle" : "fillStyle"
    this.spec = { ...spec, [pen]: color }

    if (gtype === "dot") {
      this.draw = selected? "circle" : "square"
    }
  }
  add(item) {
    this.items.add(item)
  }
  remove(item) {
    this.items.delete(item)
  }
}

/**
 * Add i to a partition, creatting the partition if necessary
 * @param {Number} i -- index of an in-view Activity
 * @param {Boolean} [selected] -- specify which group to add to
 */
function addToGroup(i, selected) {
  const A = itemsArray[i]
  selected = selected || A.selected

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
  selected = selected || A.selected

  for (const gtype in GROUP_TYPES) {
    const partitions = GROUP_TYPES[gtype].partitions
    const groups = selected ? partitions.selected : partitions.unselected
    const color = A.colors[gtype]
    const styleGroup = groups.get(color)

    styleGroup.remove(A)
    if (styleGroup.size === 0) {
      groups.delete(color)
    }
  }
}

/**
 * Update the partitions with a changed selection value for A = itemsArray[i]
 *
 * @param  {number} i -- then index of the activity
 */
export function updateSelect(i) {
  const A = itemsArray[i]

  if (!inView.current.has(i)) {
    return
  }

  addToGroup(i, A.selected)
  removeFromGroup(i, !A.selected)
}

function makeStyleGroups() {
  const output = {}
  for (const gtype in GROUP_TYPES) {
    const partitions = GROUP_TYPES[gtype].partitions
    output[gtype] = output[gtype] = [
      ...partitions.unselected.values(),
      ...partitions.selected.values(),
    ]
  }
  return output
}
