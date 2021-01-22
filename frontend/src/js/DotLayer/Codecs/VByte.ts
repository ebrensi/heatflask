/**
 * Compression for lists of small integers
 *
 * Adapted for Heatflask from Daniel Lemire's
 * FastIntegerCompression.js : a fast integer compression library in JavaScript.
 *
 */

type NumericArray = number[] | Uint16Array | Uint8Array | Uint32Array

function bytelog(val: number): number {
  if (val < 1 << 7) {
    return 1
  } else if (val < 1 << 14) {
    return 2
  } else if (val < 1 << 21) {
    return 3
  } else if (val < 1 << 28) {
    return 4
  }
  return 5
}

/** Compute how many bytes an array of non-negative integers would use once compressed
 */
function compressedSizeInBytes(input: NumericArray) {
  const c = input.length
  let answer = 0
  for (let i = 0; i < c; i++) {
    answer += bytelog(input[i])
  }
  return answer
}

/** Compress an array of integers,
 */
export function compress(input: NumericArray): ArrayBuffer {
  const c = input.length,
    buf = new ArrayBuffer(compressedSizeInBytes(input)),
    view = new Int8Array(buf)
  let pos = 0
  for (let i = 0; i < c; i++) {
    const val = input[i]
    if (val < 1 << 7) {
      view[pos++] = val
    } else if (val < 1 << 14) {
      view[pos++] = (val & 0x7f) | 0x80
      view[pos++] = val >>> 7
    } else if (val < 1 << 21) {
      view[pos++] = (val & 0x7f) | 0x80
      view[pos++] = ((val >>> 7) & 0x7f) | 0x80
      view[pos++] = val >>> 14
    } else if (val < 1 << 28) {
      view[pos++] = (val & 0x7f) | 0x80
      view[pos++] = ((val >>> 7) & 0x7f) | 0x80
      view[pos++] = ((val >>> 14) & 0x7f) | 0x80
      view[pos++] = val >>> 21
    } else {
      view[pos++] = (val & 0x7f) | 0x80
      view[pos++] = ((val >>> 7) & 0x7f) | 0x80
      view[pos++] = ((val >>> 14) & 0x7f) | 0x80
      view[pos++] = ((val >>> 21) & 0x7f) | 0x80
      view[pos++] = val >>> 28
    }
  }
  return buf
}

/** from a compressed array of non-negative integers stored ArrayBuffer,
 *  compute the number of compressed integers by scanning the input
 */
export function computeHowManyIntegers(input: ArrayBuffer): number {
  const view = new Int8Array(input)
  const c = view.length

  let count = 0
  for (let i = 0; i < c; i++) {
    count += input[i] >>> 7
  }

  return c - count
}

/** Uncompress an array of non-negative integers from an ArrayBuffer
 */
export function* uncompress(input: ArrayBuffer): Generator<number> {
  const inbyte = new Int8Array(input)
  const end = inbyte.length
  let pos = 0
  while (end > pos) {
    let c = inbyte[pos++]
    let v = c & 0x7f
    if (c >= 0) {
      yield v
      continue
    }
    c = inbyte[pos++]
    v |= (c & 0x7f) << 7
    if (c >= 0) {
      yield v
      continue
    }
    c = inbyte[pos++]
    v |= (c & 0x7f) << 14
    if (c >= 0) {
      yield v
      continue
    }
    c = inbyte[pos++]
    v |= (c & 0x7f) << 21
    if (c >= 0) {
      yield v
      continue
    }
    c = inbyte[pos++]
    v |= c << 28
    yield v
  }
}

/* ***** For Signed Integers ********* */
function zigzag_encode(val: number) {
  return (val + val) ^ (val >> 31)
}

function zigzag_decode(val: number) {
  return (val >> 1) ^ -(val & 1)
}

/**
 * compute how many bytes an array of signed integers would use once compressed
 */
function compressedSizeInBytesSigned(arr: NumericArray) {
  const c = arr.length
  const bzze = (i) => bytelog(zigzag_encode(arr[i]))
  let answer = 0
  for (let i = 0; i < c; i++) answer += bzze(i)
  return answer
}

/**
 * Compress an array of integers. Encodes signed integers at a small performance and size cost.
 */
export function compressSigned(arr: NumericArray): ArrayBuffer {
  const c = arr.length
  const buf = new ArrayBuffer(compressedSizeInBytesSigned(arr))
  const view = new Int8Array(buf)
  let pos = 0

  for (let i = 0; i < c; i++) {
    const val = zigzag_encode(arr[i])
    if (val < 1 << 7) {
      view[pos++] = val
    } else if (val < 1 << 14) {
      view[pos++] = (val & 0x7f) | 0x80
      view[pos++] = val >>> 7
    } else if (val < 1 << 21) {
      view[pos++] = (val & 0x7f) | 0x80
      view[pos++] = ((val >>> 7) & 0x7f) | 0x80
      view[pos++] = val >>> 14
    } else if (val < 1 << 28) {
      view[pos++] = (val & 0x7f) | 0x80
      view[pos++] = ((val >>> 7) & 0x7f) | 0x80
      view[pos++] = ((val >>> 14) & 0x7f) | 0x80
      view[pos++] = val >>> 21
    } else {
      view[pos++] = (val & 0x7f) | 0x80
      view[pos++] = ((val >>> 7) & 0x7f) | 0x80
      view[pos++] = ((val >>> 14) & 0x7f) | 0x80
      view[pos++] = ((val >>> 21) & 0x7f) | 0x80
      view[pos++] = val >>> 28
    }
  }
  return buf
}

/**
 * uncompress an array of integer from an ArrayBuffer
 */
export function* uncompressSigned(buf: ArrayBuffer): IterableIterator<number> {
  const inbyte = new Int8Array(buf)
  const end = inbyte.length
  let pos = 0

  while (end > pos) {
    let c = inbyte[pos++],
      v = c & 0x7f
    if (c >= 0) {
      yield zigzag_decode(v)
      continue
    }
    c = inbyte[pos++]
    v |= (c & 0x7f) << 7
    if (c >= 0) {
      yield zigzag_decode(v)
      continue
    }
    c = inbyte[pos++]
    v |= (c & 0x7f) << 14
    if (c >= 0) {
      yield zigzag_decode(v)
      continue
    }
    c = inbyte[pos++]
    v |= (c & 0x7f) << 21
    if (c >= 0) {
      yield zigzag_decode(v)
      continue
    }
    c = inbyte[pos++]
    v |= c << 28
    yield zigzag_decode(v)
  }
}

