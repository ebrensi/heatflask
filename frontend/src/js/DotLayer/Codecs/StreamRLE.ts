/**
 * A collection of functions for RLE encoding/decoding lists of integers. *
 */
import type { BitSet } from "../../BitSet"
/**
 * A RLE-encoded list of numbers and lists. A sub-list [a,b] indicates a repeated b times.
 * eg. Both [1,2,2,2,2,2,2,5] and [1, [2,6], 5] represent the unencoded list
 *    [0, 1, 3, 5, 7, 9, 11, 13, 18]
 */
export type RLElist1 = Array<number | [number, number]>
export type RLElist2 = IterableIterator<number>

type anySet = BitSet | Set<number>

/**
 * Iterate successive differences of a list of values
 */
function* diffs(list: Iterable<number>): IterableIterator<number> {
  let val1
  for (const val2 of list) {
    if (val1 !== undefined) yield val2 - val1
    val1 = val2
  }
}

function* cumulativeSum(
  arr: Iterable<number>,
  firstValue?: number
): IterableIterator<number> {
  let sum = firstValue || 0
  for (const num of arr) yield (sum += num)
}

/**
 * The number of values in the original (non RLE-encoded) list
 */
export function decodedList1Length(rleList: RLElist1): number {
  let len = 0 // We don't count the start value!
  for (const el of rleList) {
    if (el instanceof Array) len += el[1]
    else len++
  }
  return len
}

/**
 * Decode RLE list
 */
export function* decodeList1(
  rleList: RLElist1,
  exclude?: anySet
): IterableIterator<number> {
  const len = rleList.length
  let count = 0
  for (let i = 0, el; i < len; i++) {
    el = rleList[i]
    if (el instanceof Array) {
      const value = el[0]
      for (let j = 0; j < el[1]; j++) {
        if (!exclude || !exclude.has(count++)) {
          yield value
        }
      }
    } else if (!exclude || !exclude.has(count++)) {
      yield el
    }
  }
}

/**
 * Decode a (RLE-encoded as a List) array of successive differences
 * into the original values
 */
export function* decodeDiffList1(
  rleList: RLElist1,
  firstValue?: number,
  exclude?: anySet
): IterableIterator<number> {
  const decodedDiffs = decodeList1(rleList, exclude)
  return cumulativeSum(decodedDiffs, firstValue)
}

/**
 * Transcode RLElist into alternate form
 */
export function* transcodeList(rleList: RLElist1): RLElist2 {
  for (const el of rleList) {
    if (el instanceof Array) {
      if (el[1] > 2) {
        /* this is only efficient if we have a run of
           3 or more repeated values */
        yield 0
        yield el[1]
        yield el[0]
      } else {
        // we only have two so we flatten it
        yield el[0]
        yield el[0]
      }
    } else yield el
  }
}

/**
 * Encode regular list of integers (not RLElist) into an RLElist2
 */
export function* encode(
  list: IterableIterator<number>
): RLElist2 {
  // we start off with regular array because we dont know how long it will be
  let reps = 0
  let nextNum: number
  let num = list.next().value

  while (num !== undefined) {
    while ((nextNum = list.next().value) === num) reps++

    if (reps) {
      yield 0 // rep flag
      yield reps + 1 // how many repeated
      reps = 0
    }
    yield num
    num = nextNum
  }
}

/**
 * Encode successive diffs of a list of integers into an RLElist2
 */
export function encodeDiffs(list: Iterable<number>): RLElist2{
  return encode(diffs(list))
}


export function decodedList2Length(rleList: RLElist2): number {
  let len = 1 // we count the start value!
  for (const el of rleList) {
    if (el) len++
      else {
      const reps = rleList.next().value() - 1
      len += reps
    }
  }
  return len
}


export function* decodeList2(rleList: RLElist2): IterableIterator<number> {
  for (const el of rleList) {
    if (el) yield el
    else {
      const reps = rleList.next().value()
      const repeated = rleList.next().value()
      for (let j = 0; j < reps; j++) {
        yield repeated
      }
    }
  }
}


/**
 * Decode a RLEList2 of diffs into the original integer values
 */
export function decodeDiffList2(
  rleList: RLElist2,
  firstValue = 0
): IterableIterator<number> {
  const decodedDiffs = decodeList2(rleList)
  return cumulativeSum(decodedDiffs, firstValue)
}
