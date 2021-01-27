/**
 * A collection of functions for RLE encoding/decoding lists of integers.
 * We actually are concerned with two different methods of an RLE encoded list:
 *   (1) RLE-List -- An Array of numbers and subarrays (see {@link RLElist})
 *
 *   (2) RLE-Buffer -- A typed-array of integers. (see {@link RLEbuff})
 *
 * We have methods to encode and decode, as well as Transcode from one encoding to the other.
 *
 */
import { compress, uncompress } from "./VByte"
import type { BitSet } from "../../BitSet"
/**
 * A RLE-encoded list of numbers and lists. A sub-list [a,b] indicates a repeated b times.
 * eg. Both [1,2,2,2,2,2,2,5] and [1, [2,6], 5] represent the unencoded list
 *    [0, 1, 3, 5, 7, 9, 11, 13, 18]
 */
export type RLElist = Array<number | [number, number]>
type anySet = BitSet | Set<number>

/**
 * Decode RLE list
 */
export function* decodeList(
  rleList: RLElist,
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
 */
export function* decodeDiffList(
  rleList: RLElist,
  first_value = 0,
  exclude?: anySet
): IterableIterator<number> {
  let running_sum = first_value
  const len = rleList.length
  let count = 0
  yield running_sum
  for (let i = 0, el; i < len; i++) {
    el = rleList[i]
    if (el instanceof Array) {
      for (let j = 0; j < el[1]; j++) {
        running_sum += el[0]
        if (!exclude || !exclude.has(count++)) {
          yield running_sum
        }
      }
    } else {
      running_sum += el
      if (!exclude || !exclude.has(count++)) {
        yield running_sum
      }
    }
  }
}

/**
 * The number of values in the original (non RLE-encoded) list
 */
export function decodedListLength(rleList: RLElist): number {
  let len = 0 // We don't count the start value!
  for (const el of rleList) {
    if (el instanceof Array) len += el[1]
    else len++
  }
  return len
}

/**
 * Info about the data resulting from transcoding a List-sublist RLE list
 * into a VByte-encoded buffer.
 */
function listInfo(rleList: RLElist) {
  let len = 0 // We don't count the start value!
  let max = 0

  for (const el of rleList) {
    if (el instanceof Array) {
      if (el[1] > 2) len += 3
      else len += 2

      if (el[0] > max) max = el[0]
      if (el[1] > max) max = el[1]
    } else {
      len++
      if (el > max) max = el
    }
  }
  return { len: len, max: max }
}

/**
 * @param {RLElist}
 * @return {RLEbuff}
 */
export function transcode2Buf(rleList: RLElist): number[] {
  const { len } = listInfo(rleList)
  const buf = new Array(len)

  let j = 0
  for (const el of rleList) {
    if (el instanceof Array) {
      if (el[1] > 2) {
        /* this is only efficient if we have a run of
           3 or more repeated values */
        buf[j++] = 0
        buf[j++] = el[1]
        buf[j++] = el[0]
      } else {
        // we only have two so we flatten it
        buf[j++] = el[0]
        buf[j++] = el[0]
      }
    } else buf[j++] = el
  }
  return buf
}

/**
 * Transcode to a VByte-encoded buffer.
 */
export function transcode2CompressedBuf(rleList: RLElist): ArrayBuffer {
  const buf = transcode2Buf(rleList)
  return compress(buf)
}

/**
 * Encode regular list of integers (not RLElist) into RLEbuff
 * @param  {Iterator} list -- iterable list of integers (must have .next() method)
 * @return {RLEbuff}      [description]
 */
export function encodeBuf(list: IterableIterator<number>): number[] {
  // we start off with regular array because we dont know how long it will be
  const rle = []
  let repCount = 0

  let lastNum = list.next().value
  for (const num of list) {
    if (num === lastNum) {
      repCount++
    } else if (repCount) {
      // We've reached the end of a run
      if (repCount > 1) {
        rle.push(0) // rep flag
        rle.push(repCount + 1) // how many repeated
        rle.push(lastNum) // the value
      } else {
        // if only two are repeated then just push them
        rle.push(lastNum)
        rle.push(lastNum)
      }
      rle.push(num)
      repCount = 0 // reset the rep count
    } else {
      rle.push(num)
    }

    lastNum = num
  }

  return rle
}

export function encode2CompressedBuf(
  list: IterableIterator<number>
): ArrayBuffer {
  const buf = encodeBuf(list)
  return compress(buf)
}

/**
 * Iterate successive differences of a list of values
 */
function* diffs(list: IterableIterator<number>) {
  let val1 = list.next().value
  for (const val2 of list) {
    yield val2 - val1
    val1 = val2
  }
}

/**
 * Encode successive diffs of a list of integers into an RLEbuff
 * @param  {Iterator} list -- iterable list of integers
 * @return {RLEbuff}
 */
export function encodeDiffBuf(list: IterableIterator<number>): number[] {
  return encodeBuf(diffs(list))
}

export function encode2CompressedDiffBuf(
  list: IterableIterator<number>
): ArrayBuffer {
  const buf = encodeDiffBuf(list)
  return compress(buf)
}

export function* decodeBuf(buf: number[]): IterableIterator<number> {
  const len = buf.length
  for (let i = 0, el; i < len; i++) {
    el = buf[i]
    if (el === 0) {
      const n = buf[++i]
      const repeated = buf[++i]
      for (let j = 0; j < n; j++) {
        yield repeated
      }
    } else {
      yield el
    }
  }
}

/**
 * Decode a RLEbuff of diffs into the original integer values
 */
export function* decodeDiffBuf(
  buf: number[],
  first_value = 0
): IterableIterator<number> {
  let running_sum = first_value
  const len = buf.length

  yield running_sum

  for (let i = 0, el; i < len; i++) {
    el = buf[i]
    if (el === 0) {
      const n = buf[++i],
        repeated = buf[++i]
      for (let j = 0; j < n; j++) {
        running_sum += repeated
        yield running_sum
      }
    } else {
      running_sum += el
      yield running_sum
    }
  }
}

/**
 * Returns a function that returns the next encoded member each time
 * it is called.  Optionally it can be called with the index of the next
 * number to return.
 *
 * Another way to describe it is that this returns a sort of element-array
 * S where S(i) is the i-th element, but i must be larger every time S(i)
 * is called.
 */
export function uncompressVByteRLEIterator(
  buf: ArrayBuffer,
  runningSum = 0
): (i: number) => number {
  const inbyte = new Int8Array(buf)
  const end = inbyte.length
  let pos = 0
  let reps = 1
  let si = 0
  let currentVal = 0

  const getNextVal = () => {
    // get the next value
    if (pos >= end) throw RangeError
    let c = inbyte[pos++]
    let v = c & 0x7f
    if (c >= 0) return v

    c = inbyte[pos++]
    v |= (c & 0x7f) << 7
    if (c >= 0) return v

    c = inbyte[pos++]
    v |= (c & 0x7f) << 14
    if (c >= 0) return v

    c = inbyte[pos++]
    v |= (c & 0x7f) << 21
    if (c >= 0) return v

    c = inbyte[pos++]
    v |= c << 28
    return v
  }

  return (targetPos?: number) => {
    while (true) {
      while (reps > 0) {
        runningSum += currentVal
        if (si++ === targetPos || targetPos === undefined) return runningSum //{ v: runningSum, i: si }
        reps--
      }

      while ((currentVal = getNextVal()) !== 0) {
        runningSum += currentVal
        if (si++ === targetPos || targetPos === undefined) return runningSum //{ v: runningSum, i: si }
      }

      reps = getNextVal()
      currentVal = getNextVal()
    }
  }
}
