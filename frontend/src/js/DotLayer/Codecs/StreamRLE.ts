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
  firstValue?: number,
  exclusions?: anySet
): IterableIterator<number> {
  let sum = firstValue || 0
  let i = 0
  const check = exclusions ? () => !exclusions.has(i++) : () => true
  if (check()) yield sum

  for (const num of arr) {
    sum += num
    if (check()) yield sum
  }
}

/**
 * The number of values in the original (non RLE-encoded) list
 */
export function decode1Length(rleList: RLElist1): number {
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
export function* decode1(rleList: RLElist1): IterableIterator<number> {
  const len = rleList.length

  for (let i = 0, el; i < len; i++) {
    el = rleList[i]
    if (el instanceof Array) {
      const value = el[0]

      for (let j = 0; j < el[1]; j++) yield value
    } else yield el
  }
}

/**
 * Decode a (RLE-encoded as a List) array of successive differences
 * into the original values
 */
export function decode1Diffs(
  rleList: RLElist1,
  firstValue?: number,
  exclusions?: anySet
): IterableIterator<number> {
  return cumulativeSum(decode1(rleList), firstValue, exclusions)
}

/**
 * Transcode RLElist into alternate form
 */
export function* transcode(rleList: RLElist1): RLElist2 {
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
export function* encode2(list: IterableIterator<number>): RLElist2 {
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
 * note: you need to remember the first value yourself
 */
export function encode2Diffs(list: Iterable<number>): RLElist2 {
  return encode2(diffs(list))
}

export function decode2Length(rleList: RLElist2): number {
  let len = 0 // we count the start value!
  for (const el of rleList) {
    if (el) len++
    else {
      const reps = rleList.next().value - 1
      len += reps
    }
  }
  return len
}

export function* decode2(rleList: RLElist2): IterableIterator<number> {
  for (const el of rleList) {
    if (el) yield el
    else {
      const reps = rleList.next().value
      const repeated = rleList.next().value
      for (let j = 0; j < reps; j++) {
        yield repeated
      }
    }
  }
}

/**
 * Decode a RLEList2 of diffs into the original integer values
 */
export function decode2Diffs(
  rleList: RLElist2,
  firstValue = 0
): IterableIterator<number> {
  const decodedDiffs = decode2(rleList)
  return cumulativeSum(decodedDiffs, firstValue)
}

/*
 * ****** Unit tests *******
 */

import { DEV_BUNDLE } from "../../Env"
if (DEV_BUNDLE) doUnitTests()

type lizt = IterableIterator<number> | number[]
function equal(list1: lizt, list2: lizt): boolean {
  const iter1 = list1[Symbol.iterator]()
  const iter2 = list2[Symbol.iterator]()
  let done1: boolean
  let done2: boolean
  while (!done1 && !done2) {
    const next1 = iter1.next()
    const next2 = iter2.next()
    const v1 = next1.value
    const v2 = next2.value
    if (v1 !== v2) return false
    done1 = next1.done
    done2 = next2.done
  }
  if (!done1 || !done2) return false
  return true
}

function doUnitTests(): void {
  const log = console.log
  log("Unit Testing StreamRLE")

  const list = [0, 1, 4, 5, 6, 7, 9]
  const diffs = [1, 3, 1, 1, 1, 2]
  const rle1EncodedDiffs: RLElist1 = [1, 3, [1, 3], 2]
  const rle2EncodedDiffs = [1, 3, 0, 3, 1, 2]

  const exclusions = [0, 3, 6]
  const listWexclusions = [1, 4, 6, 7]

  // cumulativeSum test
  const summedDiffs = cumulativeSum(diffs, 0)
  if (!equal(summedDiffs, list)) throw "bad cumulativeSum"

  // length test
  if (decode1Length(rle1EncodedDiffs) !== diffs.length)
    throw "bad decode1Length"

  // decodeList1 test
  const decoded1 = decode1(rle1EncodedDiffs)
  if (!equal(decoded1, diffs)) throw "bad decode1"

  // decodeDiffList1 test
  const diffDecoded1 = decode1Diffs(rle1EncodedDiffs, 0)
  if (!equal(diffDecoded1, list)) throw "bad decode1Diffs"

  // transcode test
  const transcoded = transcode(rle1EncodedDiffs)
  if (!equal(transcoded, rle2EncodedDiffs)) throw "bad transcode"

  // encode2
  const encoded2 = encode2(diffs.values())
  if (!equal(encoded2, rle2EncodedDiffs)) throw "bad encode2"

  // encode2Diffs
  const encoded22 = encode2Diffs(list)
  if (!equal(encoded22, rle2EncodedDiffs)) throw "bad encode2Diffs"

  // decode2Length
  if (decode2Length(rle2EncodedDiffs.values()) !== diffs.length)
    throw "bad decode2Length"

  // decode2
  const decoded2 = decode2(rle2EncodedDiffs.values())
  if (!equal(decoded2, diffs)) throw "bad decode2"

  // decode2Diffs
  const diffDecoded2 = decode2Diffs(rle2EncodedDiffs.values(), 0)
  if (!equal(diffDecoded2, list)) throw "bad decode2Diffs"

  // decode1 test with exclusions
  const decoded1excl = decode1(rle1EncodedDiffs, exclusions)
}
