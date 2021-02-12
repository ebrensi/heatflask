/**
 * Bitset Class Adapted from Daniel Lemire's TypedFastBitSet.js
 */
type W = i32
const BITS_PER_WORD: usize = 32
const SHIFT: u8 = 5 // = log2(BITS_PER_WORD)

// type W = i64
// const BITS_PER_WORD: usize = 64
// const SHIFT = 10  // = log2(BITS_PER_WORD)

const BYTES_PER_WORD: usize = BITS_PER_WORD / 8

export function add(ptr: usize, len: usize, index: usize): void {
  const w: usize = index >>> SHIFT
  if (w >= len) throw "Range Error"

  const byteLoc: usize = ptr + w * BYTES_PER_WORD
  const word: W = load<W>(byteLoc)
  store<W>(byteLoc, word | ((<W>1) << index))
}

/**
 * If the value was not in the set, add it, otherwise remove it
 */
export function flip(ptr: usize, len: usize, index: usize): void {
  const w: usize = index >>> SHIFT
  if (w >= len) throw "Range Error"

  const byteLoc: usize = ptr + w * BYTES_PER_WORD

  const word: W = load<W>(byteLoc)
  store<W>(byteLoc, word ^ ((<W>1) << index))
}

export function remove(ptr: usize, len: usize, index: usize): void {
  const w: usize = index >>> SHIFT
  if (w >= len) throw "Range Error"
  const byteLoc: usize = ptr + w * BYTES_PER_WORD
  const word: W = load<W>(byteLoc)
  store<W>(byteLoc, word & ~((<W>1) << index))
}

/**
 * Is the value contained in the set? Is the bit at true, or false?
 */
export function has(ptr: usize, len: usize, index: usize): boolean {
  const w: usize = index >>> SHIFT
  if (w >= len) throw "Range Error"
  const word: W = load<W>(ptr + w * BYTES_PER_WORD)
  return (word & ((<W>1) << index)) != 0
}

export function clear(ptr: usize, len: usize): void {
  memory.fill(ptr, 0, len * BYTES_PER_WORD)
}

// How many values stored in the set? How many set bits?
export function size(ptr: usize, len: usize): u32 {
  let sum: u32 = 0
  let w: usize = 0
  while (w < len) {
    sum += <u32>popcnt<W>(load<W>(ptr + w * BYTES_PER_WORD))
    w++
  }
  return sum
}

export function isEmpty(ptr: usize, len: usize): boolean {
  for (let i = 0; i < len; i++) {
    if (load<W>(ptr + i * BYTES_PER_WORD) !== 0) return false
  }
  return true
}

export function equals(
  ptr1: usize,
  len1: usize,
  ptr2: usize,
  len2: usize
): boolean {
  const mcount: usize = min<usize>(len1, len2)
  let k: usize = 0

  for (; k < mcount; ++k) {
    const byteOffset: usize = k * BYTES_PER_WORD
    if (load<W>(ptr1 + byteOffset) != load<W>(ptr2 + byteOffset)) return false
  }

  for (k = len1; k < len2; ++k) {
    const byteOffset: usize = k * BYTES_PER_WORD
    if (load<W>(ptr2 + byteOffset) != 0) return false
  }

  for (k = len2; k < len1; ++k) {
    const byteOffset: usize = k * BYTES_PER_WORD
    if (load<W>(ptr1 + byteOffset) != 0) return false
  }
  return true
}

// Check if two bitsets intersect
export function intersects(
  ptr1: usize,
  len1: usize,
  ptr2: usize,
  len2: usize
): boolean {
  const mincount: usize = min<usize>(len1, len2)
  for (let k: usize = 0; k < mincount; ++k) {
    const byteOffset: usize = k * BYTES_PER_WORD
    const word1: W = load<W>(ptr1 + byteOffset)
    const word2: W = load<W>(ptr2 + byteOffset)
    if ((word1 & word2) !== 0) return true
  }
  return false
}

// Computes the size of the intersection of two BitSets
export function intersection_size(
  ptr1: usize,
  len1: usize,
  ptr2: usize,
  len2: usize
): u32 {
  const mincount: usize = min<usize>(len1, len2)
  let answer: u32 = 0
  for (let k: u32 = 0; k < mincount; ++k) {
    const byteOffset: usize = k * BYTES_PER_WORD
    const word1: W = load<W>(ptr1 + byteOffset)
    const word2: W = load<W>(ptr2 + byteOffset)
    answer += <u32>popcnt<W>(word1 & word2)
  }
  return answer
}

// Computes the intersection of two BitSets
export function intersection(
  ptr1: usize,
  len1: usize,
  ptr2: usize,
  len2: usize,
  resultPtr: usize,
  resultLen: usize
): void {
  const mincount = min<usize>(len1, len2)
  if (resultLen < mincount) throw "RangeError"
  for (let k: usize = 0; k < mincount; ++k) {
    const byteOffset: usize = k * BYTES_PER_WORD
    const word1: W = load<W>(ptr1 + byteOffset)
    const word2: W = load<W>(ptr2 + byteOffset)
    store<W>(resultPtr + byteOffset, word1 & word2)
  }
  for (let k = mincount; k < resultLen; k++) {
    const byteOffset: usize = k * BYTES_PER_WORD
    store<W>(resultPtr + byteOffset, 0)
  }
}

// Computes the size of the difference A - B
export function difference_size(
  ptrA: usize,
  lenA: usize,
  ptrB: usize,
  lenB: usize
): u32 {
  const mincount = min<usize>(lenA, lenB)
  let answer: u32 = 0
  let k: usize = 0
  for (; k < mincount; ++k) {
    const byteOffset: usize = k * BYTES_PER_WORD
    const wordA: W = load<W>(ptrA + byteOffset)
    const wordB: W = load<W>(ptrB + byteOffset)
    answer += <W>popcnt<W>(wordA & ~wordB)
  }
  for (; k < lenA; ++k) {
    const byteOffset: usize = k * BYTES_PER_WORD
    const wordA: W = load<W>(ptrA + byteOffset)
    answer += <u32>popcnt<W>(wordA)
  }
  return answer
}

// Computes A - Boolean
export function difference(
  ptrA: usize,
  lenA: usize,
  ptrB: usize,
  lenB: usize,
  resultPtr: usize,
  resultLen: usize
): void {
  if (resultLen < lenA) throw "RangeError"

  const mincount: usize = min<usize>(lenA, lenB)
  let k: usize = 0
  for (; k < mincount; ++k) {
    const byteOffset: usize = k * BYTES_PER_WORD
    const wordA: W = load<W>(ptrA + byteOffset)
    const wordB: W = load<W>(ptrB + byteOffset)
    store<W>(resultPtr + byteOffset, wordA & ~wordB)
  }
  // remaining words are all part of difference
  if (resultPtr == ptrA) return

  while (k < lenA) {
    const byteOffset: usize = k * BYTES_PER_WORD
    const wordA: W = load<W>(ptrA + byteOffset)
    store<W>(resultPtr + byteOffset, wordA)
    k++
  }
}

/**
 * Given a BitSet A specified by(ptr, len) and another BitSet S of indices
 * (ptrIdx, lenIdx), populate the result BitSet C with a subset of A.
 * example: A = {3,10,20,100,200,201}, S = {0,3,5} ==> C = {3,100,201}
 */
export function subset(
  ptr: usize,
  len: usize,
  ptrIdx: usize,
  lenIdx: usize,
  resultPtr: usize,
  resultLen: usize
): void {
  if (resultLen < len) throw "RangeError"

  clear(resultPtr, resultLen)

  const idxGen = bitSubSet.imap()

  const c = this.words.length
  let next = idxGen.next().value
  let i = 0

  for (let k = 0; k < c; ++k) {
    let w = this.words[k]
    while (w !== 0) {
      const t = w & -w
      w ^= t
      if (i++ === next) {
        newSet.add((k << 5) + hammingWeight((t - 1) | 0))
        next = idxGen.next().value
      }
    }
  }
  return
}

export function iterator(ptr: usize, len: usize): (i: u32) => u32 {
  let k: usize = 0
  let word: W = 0
  let i: u32 = 0

  return (target: u32): u32 => {
    // idiot-proofing: we start over if sought index is past
    if (i > target) {
      i = 0
      word = 0
      k = 0
    }

    while (true) {
      // fast-forward to the first non-zero word
      while (word == 0) {
        if (k >= len) return NaN

        const byteOffset: usize = k++ * BYTES_PER_WORD
        word = load<W>(ptr + byteOffset)
      }

      // extract bits from this word until it is zero
      do {
        const t: W = word & -word
        word ^= t
        if (i++ === target) return (k << 5) + popcnt<W>(t - 1)
      } while (word !== 0)
    }
  }
}

/*
 * Define a class
 */
export class BitSet {
  words: Uint32Array

  constructor(n?: number) {
    const count: number = n ? (n + 32) >>> 5 : 8
    this.words = new Uint32Array(count)
  }

  static fromWords(words: Uint32Array): BitSet {
    const answer = Object.create(BitSet.prototype)
    answer.words = words
    return answer
  }

  /**
   * Set the bit at {@link index} to false
   * @param  {Number} index [description]
   * @return {BitSet} This {@link BitSet}
   */

  /**
   * Return true if no bit is set
   * @return {Boolean} Is anything in this {@link BitSet}?
   */

  // Resize the bitset so that we can write a value at index
  resize(index: number): BitSet {
    const count: number = (index + 32) >>> 5 // just what is needed
    if (this.words.length >= count) return this
    const newWords = new Uint32Array(count)
    newWords.set(this.words, 0)
    this.words = newWords
    return this
  }

  // Return an array with the set bit locations (values)
  array(ArrayConstructor?: anyArrayConstructor): anyArray {
    const max = this.max()
    ArrayConstructor =
      ArrayConstructor || max >>> 8
        ? max >>> 16
          ? Uint32Array
          : Uint16Array
        : Uint8Array

    const answer = new ArrayConstructor(this.size())
    let pos = 0 | 0
    const c = this.words.length
    for (let k = 0; k < c; ++k) {
      let w = this.words[k]
      while (w !== 0) {
        const t = w & -w
        answer[pos++] = (k << 5) + hammingWeight((t - 1) | 0)
        w ^= t
      }
    }
    return answer
  }

  // Execute a function on each of many values
  forEach(fnc: (t: number) => unknown): void {
    const c = this.words.length
    for (let k = 0; k < c; ++k) {
      let w = this.words[k]
      while (w !== 0) {
        const t = w & -w
        fnc((k << 5) + hammingWeight((t - 1) | 0))
        w ^= t
      }
    }
  }

  // Iterate the members of this BitSet
  *imap(fnc?: Sequence<T>): IterableIterator<T> {
    fnc = fnc || ((i) => i)
    const c = this.words.length
    for (let k = 0; k < c; ++k) {
      let w = this.words[k]
      while (w !== 0) {
        const t = w & -w
        yield fnc((k << 5) + hammingWeight((t - 1) | 0))
        w ^= t
      }
    }
  }

  // iterate a subset of this BitSet, where the subset is a BitSet
  // i.e. for each i in subBitSet, yield the i-th member of this BitSet
  *imap_subset(bitSubSet: BitSet, fnc?: Sequence<T>): IterableIterator<T> {
    const idxGen = bitSubSet.imap()

    let pos = 0
    let next = idxGen.next()
    let k = 0
    let w = this.words[0]

    while (!next.done) {
      let t: number
      const next_pos = next.value
      while (pos++ < next_pos) {
        t = w & -w
        w ^= t
        if (w === 0) w = this.words[++k]
      }
      yield fnc((k << 5) + hammingWeight((t - 1) | 0))
      next = idxGen.next()
    }
  }

  new_subset(bitSubSet: BitSet): BitSet {
    const newSet = BitSet.fromWords(new Uint32Array(this.words.length))
    const idxGen = bitSubSet.imap()

    const c = this.words.length
    let next = idxGen.next().value
    let i = 0

    for (let k = 0; k < c; ++k) {
      let w = this.words[k]
      while (w !== 0) {
        const t = w & -w
        w ^= t
        if (i++ === next) {
          newSet.add((k << 5) + hammingWeight((t - 1) | 0))
          next = idxGen.next().value
        }
      }
    }
    return newSet.trim()
  }

  // Creates a copy of this bitmap
  clone(result: BitSet): BitSet {
    if (result) {
      result.resize((this.words.length << 5) - 1)
      result.words.set(this.words)
      result.words.fill(0, this.words.length)
      return result
    } else return BitSet.fromWords(this.words.slice())
  }

  // Computes the number of changed elements between this bitset and another one
  change_size(other: BitSet): number {
    const mincount = Math.min(this.words.length, other.words.length)
    let answer = 0 | 0
    let k = 0 | 0
    for (; k < mincount; ++k) {
      answer += hammingWeight(this.words[k] ^ other.words[k])
    }
    const longer = this.words.length > other.words.length ? this : other
    const c = longer.words.length
    for (; k < c; ++k) {
      answer += hammingWeight(longer.words[k])
    }
    return answer
  }

  // Computes the changed elements (XOR) between this bitset and another one,
  // the current bitset is modified (and returned by the function)
  change(other: BitSet, result?: BitSet): BitSet {
    if (!result) result = this
    const maxcount = Math.max(this.words.length, other.words.length)
    result.resize((maxcount << 5) - 1)

    const mincount = Math.min(this.words.length, other.words.length)
    let k = 0 | 0
    for (; k + 7 < mincount; k += 8) {
      result.words[k] = this.words[k] ^ other.words[k]
      result.words[k + 1] = this.words[k + 1] ^ other.words[k + 1]
      result.words[k + 2] = this.words[k + 2] ^ other.words[k + 2]
      result.words[k + 3] = this.words[k + 3] ^ other.words[k + 3]
      result.words[k + 4] = this.words[k + 4] ^ other.words[k + 4]
      result.words[k + 5] = this.words[k + 5] ^ other.words[k + 5]
      result.words[k + 6] = this.words[k + 6] ^ other.words[k + 6]
      result.words[k + 7] = this.words[k + 7] ^ other.words[k + 7]
    }
    for (; k < mincount; ++k) {
      result.words[k] = this.words[k] ^ other.words[k]
    }
    // remaining words are all part of change
    const bm = other.words.length > this.words.length ? other : this
    result.words.set(bm.words.subarray(k), k)
    return result
  }

  // Computes the change between this bitset and another one,
  // a new bitmap is generated
  new_change(other: BitSet): BitSet {
    return this.change(other, new BitSet())
  }

  // Computes the size union between this bitset and another one
  union_size(other: BitSet): number {
    const mcount = Math.min(this.words.length, other.words.length)
    let answer = 0 | 0
    for (let k = 0 | 0; k < mcount; ++k) {
      answer += hammingWeight(this.words[k] | other.words[k])
    }
    if (this.words.length < other.words.length) {
      const c = other.words.length
      for (let k = this.words.length; k < c; ++k) {
        answer += hammingWeight(other.words[k] | 0)
      }
    } else {
      const c = this.words.length
      for (let k = other.words.length; k < c; ++k) {
        answer += hammingWeight(this.words[k] | 0)
      }
    }
    return answer
  }

  /**
   * Computes the union of two bitsets.  By default this BitSet is modified,
   * but you can specify the destination bitset as result.
   */
  union(other: BitSet, result?: BitSet): BitSet {
    if (!result) result = this
    const count = Math.max(this.words.length, other.words.length)
    result.resize((count << 5) - 1)
    const mcount = Math.min(this.words.length, other.words.length)
    let k = 0
    for (; k + 7 < mcount; k += 8) {
      result.words[k] = this.words[k] | other.words[k]
      result.words[k + 1] = this.words[k + 1] | other.words[k + 1]
      result.words[k + 2] = this.words[k + 2] | other.words[k + 2]
      result.words[k + 3] = this.words[k + 3] | other.words[k + 3]
      result.words[k + 4] = this.words[k + 4] | other.words[k + 4]
      result.words[k + 5] = this.words[k + 5] | other.words[k + 5]
      result.words[k + 6] = this.words[k + 6] | other.words[k + 6]
      result.words[k + 7] = this.words[k + 7] | other.words[k + 7]
    }
    for (; k < mcount; ++k) {
      result.words[k] = this.words[k] | other.words[k]
    }
    if (k < this.words.length) result.words.set(this.words.subarray(k), k)
    else if (k < other.words.length)
      result.words.set(other.words.subarray(k), k)

    return result
  }

  /**
   * Computes the union of two bitsets, creating a new one for the result.
   */
  new_union(other: BitSet): BitSet {
    return this.union(other, new BitSet())
  }
}

export { BitSet as default }
