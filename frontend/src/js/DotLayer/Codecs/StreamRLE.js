/**
 * A collection of functions for RLE encoding/decoding lists of integers.
 * We actually are concerned with two different methods of an RLE encoded list:
 *   (1) RLE-List -- An Array of numbers and subarrays (see {@link RLElist})
 *
 *   (2) RLE-Buffer -- A typed-array of integers. (see {@link RLEbuff})
 *
 * We have methods to encode and decode, as well as Transcode from one encoding to the other.
 *
 * @module
 */

/**
 * A RLE-encoded list of numbSers and lists. A sub-list [a,b] indicates a repeated b times.
 * eg. Both [1,2,2,2,2,2,2,5] and [1, [2,6], 5] represent the unencoded list
 *    [0, 1, 3, 5, 7, 9, 11, 13, 18]
 *
 * @typedef {Array.<Number, Array.<Number>>} RLElist
 */

/**
 * A VByte-encoded ArrayBuffer representing a RLE-encoded sequence of integers.
 * A run of repeated values is represented by 3 consecutive values:
 *      0, runlength, value.
 * @typedef {Object} RLEbuff
 */

/**
 * @typedef {Object} RLEinfo
 * @property {number} len - Length of the RLE-encoded list
 * @property {number} max - Max Value in the list (used for determining type of typed-array)
 */

import { compress, uncompress } from "VByte.js"

/** Decode a (RLE-encoded as a List) array of successive differences into
 * @generator
 * @param {RLElist} rle_list
 * @param {Number} [first_value=0] The initial value of the original list
 * @yield {Number}
 */
export function* decodeList(rle_list, first_value = 0) {
  let running_sum = first_value,
    len = rle_list.length
  yield running_sum
  for (let i = 0, el; i < len; i++) {
    el = rle_list[i]
    if (el instanceof Array) {
      for (let j = 0; j < el[1]; j++) {
        running_sum += el[0]
        yield running_sum
      }
    } else {
      running_sum += el
      yield running_sum
    }
  }
}

/**
 * The number of values in the original (non RLE-encoded) list
 * @param  {RLElist}
 * @return {Number}
 */
export function decodedListLength(rle_list) {
  let len = 0 // We don't count the start value!
  for (const el of rle_list) {
    if (el instanceof Array) len += el[1]
    else len++
  }
  return len
}

/**
 * Info about the data resulting from transcoding a List-sublist RLE list
 * into a VByte-encoded buffer.
 *
 * We store RLE stream data locally a little differently.
 *  a run of repeated values is represented by
 *  3 consecutive values 0, runlength, value
 *  which allows us to avoid storing negative numbers.
 *
 * @param {RLElist} rle_list
 * @returns {RLEinfo}
 */
function transcodeInfo(rle_list) {
  let len = 0, // We don't count the start value!
    max = 0

  for (const el of rle_list) {
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
export function transcode2Buf(rle_list) {
  const { len, max } = transcodeInfo(rle_list),
    ArrayConstructor =
      max >> 8 ? (max >> 16 ? Uint32Array : Uint16Array) : Uint8Array,
    buf = new ArrayConstructor(len)

  let j = 0
  for (const el of rle_list) {
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
 * Transcode to a VByte-encoded {@link RLEbuff}.
 * @param  {RLElist} rle_list
 * @return {ArrayBuffer}
 */
export function transcode2CompressedBuf(rle_list) {
  const buf = transcode2Buf(rle_list)
  return compress(buf)
}

/**
 * Decode a into the original integer values
 * @param {RLEBuff} buf
 * @param {Number} [first_value=0] The first value of the original list
 * @yield {Number}
 */
export function* decodeBuf(buf, first_value = 0) {
  let running_sum = first_value,
    len = buf.length

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
 * Decode a VByte-encoded {@link RLEBuff} into the original integer values
 * @generator
 * @param {ArrayBuffer} cbuf
 * @param {Number} [first_value=0] The first value of the original list
 * @yield {Number}
 */
export function* decodeCompressedBuf(cbuf, first_value = 0) {
  const bufGen = uncompress(cbuf)

  let running_sum = first_value
  yield running_sum

  for (const el of bufGen) {
    if (el === 0) {
      const n = bufGen.next().value,
        repeated = bufGen.next().value

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
 * Decode VByte-encoded {@link RLEBuff} into a subsequence of the original integer values.
 * The indices of the original values are expected as a {@link BitSet}.
 *
 * (Alternative method)
 * @generator
 * @param  {ArrayBuffer} cbuf
 * @param  {BitSet} idxSet
 * @param  {Number} [first_value=0] The first value of the original list
 * @yields {Number}
 */
export function decodeCompressedBuf2(cbuf, idxSet, first_value = 0) {
  const bufGen = uncompress(cbuf)
  let j = 0,
    k,
    repeated,
    sum = first_value // j is our counter for bufGen

  return idxSet.imap((i) => {
    // we will return the i-th element of bufGen

    // ..if we are continuing a repeat streak
    while (k > 0) {
      sum += repeated
      k--
      if (++j == i) return sum
    }

    if (j == i) return sum
    else {
      while (j < i) {
        const el = bufGen.next().value
        if (el === 0) {
          k = bufGen.next().value
          repeated = bufGen.next().value
          while (k--) {
            sum += repeated
            if (++j == i) return sum
          }
        } else {
          sum += el
          j++
        }
      }
      return sum
    }
  })
}
