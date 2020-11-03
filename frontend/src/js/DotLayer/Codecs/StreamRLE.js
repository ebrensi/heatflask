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

/**
 * A RLE-encoded list of numbers and lists. A sub-list [a,b] indicates a repeated b times.
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

import { compress, uncompress } from "./VByte.js"

/**
 * Decode RLE list
 * @param {RLElist} rle_list -- RLE (Run Length Encoded) list of integers
 * @param {BitSet|Set} exclude -- indices of elements to exclude
 * @yield {Number}
 */
export function* decodeList(rle_list, exclude) {
  const len = rle_list.length
  let count = 0
  for (let i = 0, el; i < len; i++) {
    el = rle_list[i]
    if (el instanceof Array) {
      const value = el[0]
      for (let j = 0; j < el[1]; j++) {
        if (!exclude || !exclude.has(count++)){
          yield value
        }
      }
    } else if (!exclude || !exclude.has(count++)) {
      yield el
    }
  }
}

/** Decode a (RLE-encoded as a List) array of successive differences
 * @param {RLElist} -- rle_list
 * @param {Number} [first_value] -- The initial value of the original list
 * @param {exclude} [BitSet|Set] -- Set of indices to exclude
 * @yield {Number}
 */
export function* decodeDiffList(rle_list, first_value, exclude) {
  let running_sum = first_value || 0
  const len = rle_list.length
  let count = 0
  yield running_sum
  for (let i = 0, el; i < len; i++) {
    el = rle_list[i]
    if (el instanceof Array) {
      for (let j = 0; j < el[1]; j++) {
        running_sum += el[0]
        if (!exclude || !exclude.has(count++)){
          yield running_sum
        }
      }
    } else {
      running_sum += el
      if (!exclude || !exclude.has(count++)){
        yield running_sum
      }
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
 *
 * @param {RLElist} rle_list
 * @returns {RLEinfo}
 */
function listInfo(rle_list) {
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
  const { len, max } = listInfo(rle_list),
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
 * Encode regular list of integers (not RLElist) into RLEbuff
 * @param  {Iterator} list -- iterable list of integers (must have .next() method)
 * @return {RLEbuff}      [description]
 */
export function encodeBuf(list) {
  // we start off with regular array because we dont know how long it will be
  const rle = []
  let max = 0
  let repCount = 0

  let num1 = list.next().value
  for (const num2 of list) {
    if (num2 > max) {
      max = num2
    }

    if (num2 === num1) {
      repCount++
    } else if (repCount) {
      if (repCount > 1) {
        rle.push(0)          // rep flag
        rle.push(repCount+1) // how many repeated
        rle.push(num2)       // the value
      } else {
        // if only two are repeated then just push them
        rle.push(num2)
        rle.push(num2)
      }
      repCount = 0 // reset the rep count

    } else {
      rle.push(num2)
    }
  }
  /*
   * Now we have a list of values and a max value.
   *   We create a typed array with the smallest type that will hold the max value
   */
  const ArrayConstructor = max >> 8 ? (max >> 16 ? Uint32Array : Uint16Array) : Uint8Array

  return ArrayConstructor.from(rle)
}

export function encode2CompressedBuf(list) {
  const buf = encodeBuf(list)
  return compress(buf)
}


/**
 * Iterate successive differences of a list of values
 * @param {Iterator} list -- iterable list of numbers
 * @yield {Number}
 */
function *diffs(list) {
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
export function encodeDiffBuf(list) {
  return encodeBuf(diffs(list))
}

export function encode2CompressedDiffBuf(list) {
  const buf = encodeDiffBuf(list)
  return compress(buf)
}


export function* decodeBuf(buf) {
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
 * @param {RLEBuff} buf
 * @param {Number} [first_value=0] The first value of the original list
 * @yield {Number}
 */
export function* decodeDiffBuf(buf, first_value = 0) {
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
export function* decodeCompressedDiffBuf(cbuf, first_value = 0) {
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
export function decodeCompressedDiffBuf2(cbuf, idxSet, first_value = 0) {
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
