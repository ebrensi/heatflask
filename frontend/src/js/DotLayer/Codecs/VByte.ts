/**
 * Compression for lists of small integers
 *
 * Adapted for Heatflask from Daniel Lemire's
 * FastIntegerCompression.js : a fast integer compression library in JavaScript.
 *
 * @module
 *
 */

function bytelog(val) {
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
 * @param {Array.<Number>} input an array of non-negative integers
 * @returns {Number} size in bytes of VByte compressed buffer
 */
function compressedSizeInBytes(input) {
  const c = input.length
  let answer = 0
  for (let i = 0; i < c; i++) {
    answer += bytelog(input[i])
  }
  return answer
}

/** Compress an array of integers,
 *
 *  @param {Array.<Number>} input An array of non-negative integers
 *  @returns {ArrayBuffer}
 */
export function compress(input) {
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

/* from a compressed array of non-negative integers stored ArrayBuffer,
 *  compute the number of compressed integers by scanning the input
 *
 *  @param {ArrayBuffer} input An ArrayBuffer created by {@link compress}
 *  @returns {Number}
 */
export function computeHowManyIntegers(input) {
  const view = new Int8Array(input),
    c = view.length

  let count = 0
  for (let i = 0; i < c; i++) {
    count += input[i] >>> 7
  }

  return c - count
}

/** Uncompress an array of non-negative integers from an ArrayBuffer
 *
 * @generator
 * @param {ArrayBuffer} input An ArrayBuffer created by {@link compress}
 * @yields {Number} Non-negative integers
 */
export function* uncompress(input) {
  const inbyte = new Int8Array(input),
    end = inbyte.length
  let pos = 0
  while (end > pos) {
    let c = inbyte[pos++],
      v = c & 0x7f
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
function zigzag_encode(val) {
  return (val + val) ^ (val >> 31)
}

function zigzag_decode(val) {
  return (val >> 1) ^ -(val & 1)
}

/**
 * compute how many bytes an array of signed integers would use once compressed
 * @param {Array.<Number>} input An array of possibly negative integers
 * @returns {Number}
 */
function compressedSizeInBytesSigned(input) {
  const c = input.length
  const bzze = (i) => bytelog(zigzag_encode(input[i]))

  let answer = 0

  for (let i = 0; i < c; i++) answer += bzze(i)
  return answer
}

/**
 * Compress an array of integers. Encodes signed integers at a small performance and size cost.
 *
 * @param {Array.<Number>} input An array of integers
 * @returns {ArrayBuffer}
 */
export function compressSigned(input) {
  const c = input.length,
    buf = new ArrayBuffer(compressedSizeInBytesSigned(input)),
    view = new Int8Array(buf)
  let pos = 0

  for (let i = 0; i < c; i++) {
    let val = zigzag_encode(input[i])
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
 * @generator
 * @param {ArrayBuffer} input An ArrayBuffer created by {@link compressSigned}
 * @yields {Number}
 *
 */
export function* uncompressSigned(input) {
  const inbyte = new Int8Array(input)
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
