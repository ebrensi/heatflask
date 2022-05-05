type DiffArray = Uint8Array | Int8Array

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
  const increasing = ntype !== 0

  // next two bytes are start value as Int16
  const start_val = new DataView(enc.buffer, enc.byteOffset + 1, 2).getInt16(
    0,
    true
  )

  // The rest is encoded diffs as signed/unisgned depending
  // on whether or not the original is increasing
  const array = increasing ? Uint8Array : Int8Array
  const enc_diffs = new array(enc.buffer, enc.byteOffset + 3, enc.length - 3)

  const rl_marker = increasing ? 255 : -128
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
