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
function reset() {
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

/*
 * These are partitions of inView into colors and whether or not they are selected.
 * Each Map will contain a BitSet for every color of Activity that is currently in view
 */
const partitions = {
  path: { selected: new Map(), unselected: new Map() },
  dot: { selected: new Map(), unselected: new Map() },
}

export function updateSets() {
  if (needReset) {
    reset()
  }
  ViewBox.update()[
    // swap current and last
    (inView.current, inView.last)
  ] = [inView.last, inView.current]

  const currentInView = inView.current.clear()

  // update which items are in the current view
  for (let i = 0, len = itemsArray.length; i < len; i++) {
    if (ViewBox.overlaps(itemsArray[i].pxBounds)) {
      currentInView.add(i)
    }
  }

  // update items that have changed since last time
  const changed = inView.last.change(currentInView)

  changed.forEach((i) => {
    if (currentInView.has(i)) {
      setAdd(i)
    } else {
      setRemove(i)
    }
  })

  // return the current state of inclusion
  return currentInView
}

/**
 * Add i to a partition, creatting the partition if necessary
 * @param {Number} i -- index of an in-view Activity
 * @param {Boolean} [selected] -- specify which group to add to
 */
function setAdd(i, selected) {
  const A = itemsArray[i]
  selected = selected || A.selected

  const pgroup = selected
    ? partitions.path.selected
    : partitions.path.unselected
  const pcolor = A.colors.path
  const pset = pgroup.get(pcolor)
  if (pset) {
    pset.add(i)
  } else {
    const newpset = new BitSet()
    newpset.add(i)
    pgroup.set(pcolor, newpset)
  }

  const dgroup = selected ? partitions.dot.selected : partitions.dot.unselected
  const dcolor = A.colors.dot
  const dset = dgroup.get(dcolor)
  if (dset) {
    dset.add(i)
  } else {
    const newdset = new BitSet()
    newdset.add(i)
    dgroup.set(dcolor, newdset)
  }
}

/**
 * Remove i from a partition, deleting the partition if necessary
 * @param {number} i -- index of an Activity not in-view
 * @param {Boolean} [selected] -- specify which group to remove from
 */
export function setRemove(i, selected) {
  const A = itemsArray[i]
  selected = selected || A.selected

  const pgroup = selected
    ? partitions.path.selected
    : partitions.path.unselected
  const pcolor = A.colors.path
  const pset = pgroup.get(pcolor)

  pset.remove(i)
  if (pset.isEmpty()) {
    pgroup.delete(pcolor)
  }

  const dgroup = selected ? partitions.dot.selected : partitions.dot.unselected
  const dcolor = A.colors.dot
  const dset = dgroup.get(dcolor)
  dset.remove(i)
  if (dset.isEmpty()) {
    dgroup.delete(dcolor)
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

  setAdd(i, A.selected)
  setRemove(i, !A.selected)
}

/**
 *  Create iterator of Activity objects from a BitSet of indices
 * @param  {BitSet} bitSet
 * @return {[type]}
 */
function makeArrayFromBitSet(bitSet, arr) {
  arr = [] || arr
  bitSet.forEach(i => arr.push(itemsArray[i]))
  return arr
}

function makeGroupFromMap(sourceMap, destMap) {
  sourceMap = sourceMap || destMap
  sourceMap.forEach((color, bitSet) => destMap.set(color, makeArrayFromBitSet(bitSet)))
}

function makePathColorGroups() {
  return {
    selected: makeGroupFromMap(partitions.path.selected),
    unselected: makeGroupFromMap(partitions.path.unselected)
  }
}

function makeDotColorGroups() {
  return {
    selected: makeGroupFromMap(partitions.dot.selected),
    unselected: makeGroupFromMap(partitions.dot.unselected)
  }
}


function makePathStyleGroups() {
  const groups = []
  const parts = partitions.path

  if (parts.selected.size) {
    const utemplate = {
      lineWidth: options.unselected.pathWidth,
      globalAlpha: options.unselected.pathOpacity,
      strokeStyle: options.unselected.pathColor
    }

    parts.unselected.forEach((color, bitSet) => {
      const style = {...utemplate, lineStyle: color}
      const group = makeArrayFromBitSet(bitSet)
      groups.push({style, group})
    })

    const stemplate = {
      lineWidth: options.selected.pathWidth,
      globalAlpha: options.selected.pathOpacity,
      strokeStyle: options.selected.pathColor
    }
    parts.selected.forEach((color, bitSet) => {
      const style = {...stemplate, lineStyle: color}
      const group = makeArrayFromBitSet(bitSet)
      groups.push({style, group})
    })
  } else {
    const template = {
      lineWidth: options.normal.pathWidth
      globalAlpha: options.normal.pathOpacity,
      strokeStyle: options.normal.pathColor
    }
    parts.unselected.forEach((color, bitSet) => {
      const style = {...utemplate, lineStyle: color}
      const group = makeArrayFromBitSet(bitSet)
      groups.push({style, group})
    })
  }

  return groups
}

