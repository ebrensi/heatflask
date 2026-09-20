/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
type DiffArray = Uint8Array | Int8Array | Int16Array | Int32Array

function decoded_length(enc: DiffArray, rl_marker: number) {
  let L = 1
  let i = 0
  while (i < enc.length) {
    if (enc[i] == rl_marker) {
      L += enc[i + 2]
      i += 3
    } else {
      L++
      i++
    }
  }
  return L
}

type TypedArray =
  | Int8Array
  | Uint8Array
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Uint8ClampedArray
  | Float32Array
  | Float64Array

/** TypeScript decoder for custom Run-Length-Diff encoding */
export function rld_decode(enc: Uint8Array, ArrayConstructor) {
  // First byte is ntype as Int8
  const ntype = enc[0]

  /* Then the start value: Int16, except in type 3 where it is Int32, so the
   * diffs begin at byte 3 or byte 5. */
  const header = new DataView(enc.buffer, enc.byteOffset)
  const start_val =
    ntype === 3 ? header.getInt32(1, true) : header.getInt16(1, true)
  const headerBytes = ntype === 3 ? 5 : 3

  /* The rest is the encoded diffs. ntype says how wide they are:
   *   0 = signed 8-bit
   *   1 = unsigned 8-bit (the values never decrease)
   *   2 = signed 16-bit
   *   3 = signed 32-bit
   * Type 2 exists because a pause in recording can leave hundreds of metres
   * between consecutive altitude samples, which does not fit in a byte. Type 3
   * is for what does not fit in an int16 either: an activity left recording
   * after it ended leaves a gap of hours in the time stream. */
  let enc_diffs: DiffArray
  let rl_marker: number

  if (ntype === 3) {
    /* A wide view needs an aligned offset and the payload starts at an odd
     * byte, so copy it out: slice() returns a fresh buffer at offset 0. */
    const bytes = enc.slice(headerBytes)
    enc_diffs = new Int32Array(bytes.buffer, 0, bytes.length >> 2)
    rl_marker = -2147483648
  } else if (ntype === 2) {
    const bytes = enc.slice(headerBytes)
    enc_diffs = new Int16Array(bytes.buffer, 0, bytes.length >> 1)
    rl_marker = -32768
  } else if (ntype === 1) {
    enc_diffs = new Uint8Array(
      enc.buffer,
      enc.byteOffset + headerBytes,
      enc.length - headerBytes
    )
    rl_marker = 255
  } else {
    enc_diffs = new Int8Array(
      enc.buffer,
      enc.byteOffset + headerBytes,
      enc.length - headerBytes
    )
    rl_marker = -128
  }
  const L = decoded_length(enc_diffs, rl_marker)

  const decoded = new ArrayConstructor(L)
  decoded[0] = start_val
  let cumsum = start_val
  let i = 0 // enc_diffs counter
  let j = 1 // decoded counter
  while (i < enc_diffs.length) {
    if (enc_diffs[i] == rl_marker) {
      const d = enc_diffs[i + 1]
      const reps = enc_diffs[i + 2]
      const endreps = j + reps
      while (j < endreps) {
        cumsum += d
        decoded[j++] = cumsum
      }
      i += 3
    } else {
      cumsum += enc_diffs[i++]
      decoded[j++] = cumsum
    }
  }
  return decoded
}
