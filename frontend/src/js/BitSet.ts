type anyArray = Array<number> | Uint32Array | Uint16Array | Uint8Array
type anyArrayConstructor =
  | ArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor
  | Uint8ArrayConstructor

/** Bitset Class Adapted from Daniel Lemire's TypedFastBitSet.js */
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

  [Symbol.iterator]() {
    return this.imap((i: number) => i)
  }

  /**
   * Add the value (Set the bit at {@link index} to true)
   */
  add(index: number): BitSet {
    const w: number = index >>> 5
    if (w >= this.words.length) {
      throw new RangeError(
        `cannot access word ${w} of ${this.words.length}-word bitset`
      )
    }
    this.words[w] |= 1 << index
    return this
  }

  /**
   * If the value was not in the set, add it, otherwise remove it (flip bit at {@link index})
   */
  flip(index: number): BitSet {
    const w: number = index >>> 5
    if (w >= this.words.length) {
      throw new RangeError(
        `cannot access word ${w} of ${this.words.length} bitset`
      )
    }
    this.words[w] ^= 1 << index
    return this
  }

  /**
   * Remove all values, reset memory usage
   */
  clear(): BitSet {
    this.words.fill(0)
    return this
  }

  /**
   * Set the bit at {@link index} to false
   */
  remove(index: number): BitSet {
    const w: number = index >>> 5
    if (w >= this.words.length) {
      throw new RangeError(
        `cannot access word ${w} of ${this.words.length}-word bitset`
      )
    }
    this.words[w] &= ~(1 << index)
    return this
  }

  /**
   * Return true if no bit is set
   */
  isEmpty(): boolean {
    const c: number = this.words.length
    for (let i = 0; i < c; i++) {
      if (this.words[i] !== 0) return false
    }
    return true
  }

  /**
   * Is the value contained in the set? Is the bit at {@link index} true, or false?
   */
  has(index: number): boolean {
    return (this.words[index >>> 5] & (1 << index)) !== 0
  }

  // Tries to add the value (Set the bit at index to true), return 1 if the
  // value was added, return 0 if the value was already present
  checkedAdd(index: number): number {
    const w: number = index >>> 5
    if (w >= this.words.length) {
      throw new RangeError(
        `cannot access word ${w} of ${this.words.length}-word bitset`
      )
    }
    const word = this.words[w]
    const newword = word | (1 << index)
    this.words[w] = newword
    return (newword ^ word) >>> index
  }

  // Resize the bitset so that we can write a value at index
  resize(index: number): BitSet {
    const count: number = (index + 32) >>> 5 // just what is needed
    if (this.words.length >= count) return this
    const newWords = new Uint32Array(count)
    newWords.set(this.words, 0)
    this.words = newWords
    return this
  }

  // Reduce the memory usage to a minimum
  trim(): BitSet {
    let nl: number = this.words.length
    while (nl > 0 && this.words[nl - 1] === 0) {
      nl--
    }
    this.words = this.words.slice(0, nl)
    return this
  }

  // How many values stored in the set? How many set bits?
  size(): number {
    let answer = 0
    const c = this.words.length
    const w = this.words
    let i = 0
    for (; i < c; i++) {
      answer += hammingWeight(w[i])
    }
    return answer
  }

  min(): number {
    const c = this.words.length
    let w
    for (let k = 0; k < c; ++k) {
      w = this.words[k]
      if (w !== 0) {
        const t = w & -w
        return (k << 5) + hammingWeight((t - 1) | 0)
      }
    }
  }

  max(): number {
    const c = this.words.length - 1
    for (let k = c; k >= 0; --k) {
      let w = this.words[k]
      if (w !== 0) {
        let t = 0
        while (w !== 0) {
          t = w & -w
          w ^= t
        }
        return (k << 5) + hammingWeight((t - 1) | 0)
      }
    }
    return 0
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
  *imap(fnc?: (t: number) => unknown): IterableIterator<unknown> {
    fnc = fnc || ((i: number) => i)
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
  *imap_subset(
    bitSubSet: BitSet,
    fnc?: (t: number) => unknown
  ): IterableIterator<unknown> {
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

  equals(other: BitSet): boolean {
    const mcount = Math.min(this.words.length, other.words.length)
    for (let k = 0 | 0; k < mcount; ++k) {
      if (this.words[k] !== other.words[k]) return false
    }
    if (this.words.length < other.words.length) {
      const c = other.words.length
      for (let k = this.words.length; k < c; ++k) {
        if (other.words[k] !== 0) return false
      }
    } else if (other.words.length < this.words.length) {
      const c = this.words.length
      for (let k = other.words.length; k < c; ++k) {
        if (this.words[k] !== 0) return false
      }
    }
    return true
  }

  // Check if this bitset intersects with another one,
  // no bitmap is modified
  intersects(other: BitSet): boolean {
    const newcount = Math.min(this.words.length, other.words.length)
    for (let k = 0 | 0; k < newcount; ++k) {
      if ((this.words[k] & other.words[k]) !== 0) return true
    }
    return false
  }

  // Computes the size of the intersection between this bitset and another one
  intersection_size(other: BitSet): number {
    const newcount = Math.min(this.words.length, other.words.length)
    let answer = 0 | 0
    for (let k = 0 | 0; k < newcount; ++k) {
      answer += hammingWeight(this.words[k] & other.words[k])
    }

    return answer
  }

  // Computes the intersection between this bitset and another one,
  // the current bitmap is modified  (and returned by the function)
  intersection(other: BitSet, result?: BitSet): BitSet {
    result = result || this
    const count = Math.min(this.words.length, other.words.length)
    result.resize((count << 5) - 1)
    const c = count
    let k = 0 | 0
    for (; k + 7 < c; k += 8) {
      result.words[k] = this.words[k] & other.words[k]
      result.words[k + 1] = this.words[k + 1] & other.words[k + 1]
      result.words[k + 2] = this.words[k + 2] & other.words[k + 2]
      result.words[k + 3] = this.words[k + 3] & other.words[k + 3]
      result.words[k + 4] = this.words[k + 4] & other.words[k + 4]
      result.words[k + 5] = this.words[k + 5] & other.words[k + 5]
      result.words[k + 6] = this.words[k + 6] & other.words[k + 6]
      result.words[k + 7] = this.words[k + 7] & other.words[k + 7]
    }
    for (; k < c; ++k) {
      result.words[k] = this.words[k] & other.words[k]
    }
    return result
  }

  // Computes the intersection between this bitset and another one,
  // a new bitmap is generated
  new_intersection(other: BitSet): BitSet {
    return this.intersection(other, new BitSet())
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
    result = result || this
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

  // Computes the size of the difference between this bitset and another one
  difference_size(other: BitSet): number {
    const newcount = Math.min(this.words.length, other.words.length)
    let answer = 0 | 0
    let k = 0 | 0
    for (; k < newcount; ++k) {
      answer += hammingWeight(this.words[k] & ~other.words[k])
    }
    const c = this.words.length
    for (; k < c; ++k) {
      answer += hammingWeight(this.words[k])
    }
    return answer
  }

  // Computes the difference between this bitset and another one,
  // the other bitset is modified (and returned by the function)
  // (for this set A and other set B,
  //   this computes B = A - B  and returns B)
  difference(other: BitSet, result?: BitSet): BitSet {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    if (!result) result = this
    else result.resize((this.words.length << 5) - 1)

    const mincount = Math.min(this.words.length, other.words.length)
    let k = 0 | 0
    for (; k + 7 < mincount; k += 8) {
      result.words[k] = this.words[k] & ~other.words[k]
      result.words[k + 1] = this.words[k + 1] & ~other.words[k + 1]
      result.words[k + 2] = this.words[k + 2] & ~other.words[k + 2]
      result.words[k + 3] = this.words[k + 3] & ~other.words[k + 3]
      result.words[k + 4] = this.words[k + 4] & ~other.words[k + 4]
      result.words[k + 5] = this.words[k + 5] & ~other.words[k + 5]
      result.words[k + 6] = this.words[k + 6] & ~other.words[k + 6]
      result.words[k + 7] = this.words[k + 7] & ~other.words[k + 7]
    }
    for (; k < mincount; ++k) {
      result.words[k] = this.words[k] & ~other.words[k]
    }
    // remaining words are all part of difference
    if (k < this.words.length) {
      result.words.set(this.words.subarray(k), k)
    }

    return result
  }

  // Computes the difference between this bitset and another one,
  // a new bitmap is generated
  new_difference(other: BitSet): BitSet {
    return this.difference(other, new BitSet()) // should be fast enough
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
    result = result || this
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

  // Returns a string representation
  toString(bitField?: boolean): string {
    let str
    if (bitField) {
      const max = this.max()
      const arr = new Uint8Array(max)
      for (let j = 0; j < max; j++) {
        arr[j] = this.has(j) ? 1 : 0
      }
      str = arr.join("") || "0"
    } else {
      str = "{" + this.array().join(",") + "}"
    }
    return str
  }

  /**
   * Returns a function that returns the next set member each time
   * it is called.  Optionally it can be called with the index of the next
   * element to return.
   *
   * Another way to describe it is that this returns a sort of element-array
   * S where S(i) is the i-th element, but i must be larger every time S(i)
   * is called.
   */
  iterator(): (x?: number) => number {
    const c = this.words.length
    let k = -1
    let w = 0
    let i = 0

    return (target?: number): number => {
      // idiot-proofing
      if (i > target) throw new RangeError()

      for (;;) {
        // fast-forward to the first non-zero word
        while (w === 0) {
          if (++k >= c) return
          w = this.words[k]
        }

        // extract bits from this word until it is zero
        do {
          const t = w & -w
          w ^= t
          if (i++ === target || target === undefined)
            return (k << 5) + hammingWeight((t - 1) | 0)
        } while (w !== 0)
      }
    }
  }
}

// fast function to compute the Hamming weight of a 32-bit unsigned integer
function hammingWeight(v: number): number {
  v -= (v >>> 1) & 0x55555555 // works with signed or unsigned shifts
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
  return (((v + (v >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24
}

// fast function to compute the Hamming weight of four 32-bit unsigned integers
function hammingWeight4(
  v1: number,
  v2: number,
  v3: number,
  v4: number
): number {
  v1 -= (v1 >>> 1) & 0x55555555 // works with signed or unsigned shifts
  v2 -= (v2 >>> 1) & 0x55555555 // works with signed or unsigned shifts
  v3 -= (v3 >>> 1) & 0x55555555 // works with signed or unsigned shifts
  v4 -= (v4 >>> 1) & 0x55555555 // works with signed or unsigned shifts

  v1 = (v1 & 0x33333333) + ((v1 >>> 2) & 0x33333333)
  v2 = (v2 & 0x33333333) + ((v2 >>> 2) & 0x33333333)
  v3 = (v3 & 0x33333333) + ((v3 >>> 2) & 0x33333333)
  v4 = (v4 & 0x33333333) + ((v4 >>> 2) & 0x33333333)

  v1 = (v1 + (v1 >>> 4)) & 0xf0f0f0f
  v2 = (v2 + (v2 >>> 4)) & 0xf0f0f0f
  v3 = (v3 + (v3 >>> 4)) & 0xf0f0f0f
  v4 = (v4 + (v4 >>> 4)) & 0xf0f0f0f
  return ((v1 + v2 + v3 + v4) * 0x1010101) >>> 24
}

export { BitSet as default }
