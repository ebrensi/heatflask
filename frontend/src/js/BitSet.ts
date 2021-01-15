type anyArray = Array<number> | Uint32Array | Uint16Array | Uint8Array

/**
 * Bitset Class Adapted from Daniel Lemire's TypedFastBitSet.js
 * @class
 * @constructor
 * @param {Iterable.<Number>} iterable An iterable of integers
 */
export class BitSet {
  words: Uint32Array

  constructor(n: number) {
    let count: number = n ? (n + 32) >>> 5 : 8
    this.words = new Uint32Array(count)
  }

  static fromWords(words: Uint32Array): BitSet {
    const answer = Object.create(BitSet.prototype)
    answer.words = words
    return answer
  }

  [Symbol.iterator]() {
    return this.imap()
  }

  /**
   * Add the value (Set the bit at {@link index} to true)
   * @param {Number} index
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
   * @param  {Number} index
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
  clear() {
    this.words.fill(0)
    return this
  }

  /**
   * Set the bit at {@link index} to false
   * @param  {Number} index [description]
   * @return {BitSet} This {@link BitSet}
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
   * @return {Boolean} Is anything in this {@link BitSet}?
   */
  isEmpty(): Boolean {
    const c: number = this.words.length
    for (let i = 0; i < c; i++) {
      if (this.words[i] !== 0) return false
    }
    return true
  }

  /**
   * Is the value contained in the set? Is the bit at {@link index} true, or false?
   * @param  {Number}  index
   * @return {Boolean}
   */
  has(index: number): Boolean {
    return (this.words[index >>> 5] & (1 << index)) !== 0
  }

  // Tries to add the value (Set the bit at index to true), return 1 if the
  // value was added, return 0 if the value was already present
  checkedAdd(index: number): number {
    const w:number = index >>> 5
    if (w >= this.words.length) {
      throw new RangeError(
        `cannot access word ${w} of ${this.words.length}-word bitset`
      )
    }
    let word = this.words[w]
    let newword = word | (1 << index)
    this.words[w] = newword
    return (newword ^ word) >>> index
  }

  // Resize the bitset so that we can write a value at index
  resize(index: number): BitSet {
    let count: number = (index + 32) >>> 5 // just what is needed
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

  // fast function to compute the Hamming weight of a 32-bit unsigned integer
  hammingWeight(v: number): number {
    v -= (v >>> 1) & 0x55555555 // works with signed or unsigned shifts
    v = (v & 0x33333333) + ((v >>> 2) & 0x33333333)
    return (((v + (v >>> 4)) & 0xf0f0f0f) * 0x1010101) >>> 24
  }

  // fast function to compute the Hamming weight of four 32-bit unsigned integers
  hammingWeight4(v1: number, v2: number, v3: number, v4: number): number {
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

  // How many values stored in the set? How many set bits?
  size(): number {
    let answer = 0
    const c = this.words.length
    const w = this.words
    let i = 0
    for (; i < c; i++) {
      answer += this.hammingWeight(w[i])
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
        return (k << 5) + this.hammingWeight((t - 1) | 0)
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
        return (k << 5) + this.hammingWeight((t - 1) | 0)
      }
    }
    return 0
  }

  // Return an array with the set bit locations (values)
  array(ArrayConstructor): anyArray {
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
      while (w != 0) {
        let t = w & -w
        answer[pos++] = (k << 5) + this.hammingWeight((t - 1) | 0)
        w ^= t
      }
    }
    return answer
  }

  // Execute a function on each of many values
  forEach(fnc: (t: number) => U): void {
    const c = this.words.length
    for (let k = 0; k < c; ++k) {
      let w = this.words[k]
      while (w != 0) {
        let t = w & -w
        fnc((k << 5) + this.hammingWeight((t - 1) | 0))
        w ^= t
      }
    }
  }

  // Iterate the members of this BitSet
  *imap(fnc?: (t: number) => U): IterableIterator<number> {
    fnc = fnc || ((i) => i)
    const c = this.words.length
    for (let k = 0; k < c; ++k) {
      let w = this.words[k]
      while (w != 0) {
        let t = w & -w
        yield fnc((k << 5) + this.hammingWeight((t - 1) | 0))
        w ^= t
      }
    }
  }

  // iterate a subset of this BitSet, where the subset is a BitSet
  // i.e. for each i in subBitSet, yield the i-th member of this BitSet
  *imap_subset(bitSubSet: BitSet, fnc?: (t: number) => U): IterableIterator<number> {
    const idxGen = bitSubSet.imap()

    let pos = 0,
      next = idxGen.next(),
      k = 0,
      w = this.words[0]

    while (!next.done) {
      let t,
        next_pos = next.value
      while (pos++ < next_pos) {
        t = w & -w
        w ^= t
        if (w == 0) w = this.words[++k]
      }
      yield fnc((k << 5) + this.hammingWeight((t - 1) | 0))
      next = idxGen.next()
    }
  }

  new_subset(bitSubSet: BitSet): BitSet {
    const newSet = BitSet.fromWords(new Uint32Array(this.words.length))
    const idxGen = bitSubSet.imap()

    let c = this.words.length
    let next = idxGen.next().value
    let i = 0

    for (let k = 0; k < c; ++k) {
      let w = this.words[k]
      while (w != 0) {
        let t = w & -w
        w ^= t
        if (i++ == next) {
          newSet.add((k << 5) + this.hammingWeight((t - 1) | 0))
          next = idxGen.next().value
        }
      }
    }
    return newSet.trim()
  }

  // Creates a copy of this bitmap
  clone(recycled: BitSet): BitSet {
    if (recycled) {
      recycled.resize((this.words.length << 5) - 1)
      recycled.words.set(this.words)
      recycled.words.fill(0, this.words.length)
      return recycled
    } else return BitSet.fromWords(this.words.slice())
  }

  // Check if this bitset intersects with another one,
  // no bitmap is modified
  intersects(otherbitmap: BitSet): Boolean {
    let newcount = Math.min(this.words.length, otherbitmap.words.length)
    for (let k = 0 | 0; k < newcount; ++k) {
      if ((this.words[k] & otherbitmap.words[k]) !== 0) return true
    }
    return false
  }

  // Computes the intersection between this bitset and another one,
  // the current bitmap is modified  (and returned by the function)
  intersection(otherbitmap: BitSet): BitSet {
    let newcount = Math.min(this.words.length, otherbitmap.words.length)
    let k = 0 | 0

    for (; k + 7 < newcount; k += 8) {
      this.words[k] &= otherbitmap.words[k]
      this.words[k + 1] &= otherbitmap.words[k + 1]
      this.words[k + 2] &= otherbitmap.words[k + 2]
      this.words[k + 3] &= otherbitmap.words[k + 3]
      this.words[k + 4] &= otherbitmap.words[k + 4]
      this.words[k + 5] &= otherbitmap.words[k + 5]
      this.words[k + 6] &= otherbitmap.words[k + 6]
      this.words[k + 7] &= otherbitmap.words[k + 7]
    }
    for (; k < newcount; ++k) {
      this.words[k] &= otherbitmap.words[k]
    }
    let c = this.words.length
    for (let k = newcount; k < c; ++k) {
      this.words[k] = 0
    }
    return this
  }

  // Computes the size of the intersection between this bitset and another one
  intersection_size(otherbitmap: BitSet): number {
    let newcount = Math.min(this.words.length, otherbitmap.words.length)
    let answer = 0 | 0
    for (let k = 0 | 0; k < newcount; ++k) {
      answer += this.hammingWeight(this.words[k] & otherbitmap.words[k])
    }

    return answer
  }

  // Computes the intersection between this bitset and another one,
  // a new bitmap is generated
  new_intersection(otherbitmap: BitSet): BitSet {
    let count = Math.min(this.words.length, otherbitmap.words.length)
    const words = new Uint32Array(count)
    let c = count
    let k = 0 | 0
    for (; k + 7 < c; k += 8) {
      words[k] = this.words[k] & otherbitmap.words[k]
      words[k + 1] = this.words[k + 1] & otherbitmap.words[k + 1]
      words[k + 2] = this.words[k + 2] & otherbitmap.words[k + 2]
      words[k + 3] = this.words[k + 3] & otherbitmap.words[k + 3]
      words[k + 4] = this.words[k + 4] & otherbitmap.words[k + 4]
      words[k + 5] = this.words[k + 5] & otherbitmap.words[k + 5]
      words[k + 6] = this.words[k + 6] & otherbitmap.words[k + 6]
      words[k + 7] = this.words[k + 7] & otherbitmap.words[k + 7]
    }
    for (; k < c; ++k) {
      words[k] = this.words[k] & otherbitmap.words[k]
    }
    return BitSet.fromWords(words)
  }

  equals(otherbitmap: BitSet): Boolean {
    let mcount = Math.min(this.words.length, otherbitmap.words.length)
    for (let k = 0 | 0; k < mcount; ++k) {
      if (this.words[k] != otherbitmap.words[k]) return false
    }
    if (this.words.length < otherbitmap.words.length) {
      let c = otherbitmap.words.length
      for (let k = this.words.length; k < c; ++k) {
        if (otherbitmap.words[k] != 0) return false
      }
    } else if (otherbitmap.words.length < this.words.length) {
      let c = this.words.length
      for (let k = otherbitmap.words.length; k < c; ++k) {
        if (this.words[k] != 0) return false
      }
    }
    return true
  }

  // Computes the changed elements (XOR) between this bitset and another one,
  // the current bitset is modified (and returned by the function)
  change(otherbitmap: BitSet): BitSet {
    const mincount = Math.min(this.words.length, otherbitmap.words.length)
    let k = 0 | 0
    for (; k + 7 < mincount; k += 8) {
      this.words[k] ^= otherbitmap.words[k]
      this.words[k + 1] ^= otherbitmap.words[k + 1]
      this.words[k + 2] ^= otherbitmap.words[k + 2]
      this.words[k + 3] ^= otherbitmap.words[k + 3]
      this.words[k + 4] ^= otherbitmap.words[k + 4]
      this.words[k + 5] ^= otherbitmap.words[k + 5]
      this.words[k + 6] ^= otherbitmap.words[k + 6]
      this.words[k + 7] ^= otherbitmap.words[k + 7]
    }
    for (; k < mincount; ++k) {
      this.words[k] ^= otherbitmap.words[k]
    }
    // remaining words are all part of change
    if (otherbitmap.words.length > this.words.length) {
      this.resize((otherbitmap.words.length << 5) - 1)
      this.words.set(otherbitmap.words.subarray(k), k)
    }
    return this
  }

  // Computes the change between this bitset and another one,
  // a new bitmap is generated
  new_change(otherbitmap: BitSet, recycled: BitSet) {
    if (otherbitmap.words.length > this.words.length) {
      return this.clone(recycled).change(otherbitmap)
    } else {
      return otherbitmap.clone(recycled).change(this)
    }
  }

  // Computes the number of changed elements between this bitset and another one
  change_size(otherbitmap: BitSet): number {
    var mincount = Math.min(this.words.length, otherbitmap.words.length)
    var answer = 0 | 0
    var k = 0 | 0
    for (; k < mincount; ++k) {
      answer += this.hammingWeight(this.words[k] ^ otherbitmap.words[k])
    }
    var longer =
      this.words.length > otherbitmap.words.length ? this : otherbitmap
    var c = longer.words.length
    for (; k < c; ++k) {
      answer += this.hammingWeight(longer.words[k])
    }
    return answer
  }

  // Computes the difference between this bitset and another one,
  // the current bitset is modified (and returned by the function)
  difference(otherbitmap: BitSet): number {
    let newcount = Math.min(this.words.length, otherbitmap.words.length)
    let k = 0 | 0
    for (; k + 7 < newcount; k += 8) {
      this.words[k] &= ~otherbitmap.words[k]
      this.words[k + 1] &= ~otherbitmap.words[k + 1]
      this.words[k + 2] &= ~otherbitmap.words[k + 2]
      this.words[k + 3] &= ~otherbitmap.words[k + 3]
      this.words[k + 4] &= ~otherbitmap.words[k + 4]
      this.words[k + 5] &= ~otherbitmap.words[k + 5]
      this.words[k + 6] &= ~otherbitmap.words[k + 6]
      this.words[k + 7] &= ~otherbitmap.words[k + 7]
    }
    for (; k < newcount; ++k) {
      this.words[k] &= ~otherbitmap.words[k]
    }
    return this
  }

  // Computes the size of the difference between this bitset and another one
  difference_size(otherbitmap: BitSet): number {
    let newcount = Math.min(this.words.length, otherbitmap.words.length)
    let answer = 0 | 0
    let k = 0 | 0
    for (; k < newcount; ++k) {
      answer += this.hammingWeight(this.words[k] & ~otherbitmap.words[k])
    }
    let c = this.words.length
    for (; k < c; ++k) {
      answer += this.hammingWeight(this.words[k])
    }
    return answer
  }

  // Computes the difference between this bitset and another one,
  // the other bitset is modified (and returned by the function)
  // (for this set A and other set B,
  //   this computes B = A - B  and returns B)
  difference2(otherbitmap: BitSet): BitSet {
    const mincount = Math.min(this.words.length, otherbitmap.words.length)
    let k = 0 | 0
    for (; k + 7 < mincount; k += 8) {
      otherbitmap.words[k] = this.words[k] & ~otherbitmap.words[k]
      otherbitmap.words[k + 1] = this.words[k + 1] & ~otherbitmap.words[k + 1]
      otherbitmap.words[k + 2] = this.words[k + 2] & ~otherbitmap.words[k + 2]
      otherbitmap.words[k + 3] = this.words[k + 3] & ~otherbitmap.words[k + 3]
      otherbitmap.words[k + 4] = this.words[k + 4] & ~otherbitmap.words[k + 4]
      otherbitmap.words[k + 5] = this.words[k + 5] & ~otherbitmap.words[k + 5]
      otherbitmap.words[k + 6] = this.words[k + 6] & ~otherbitmap.words[k + 6]
      otherbitmap.words[k + 7] = this.words[k + 7] & ~otherbitmap.words[k + 7]
    }
    for (; k < mincount; ++k) {
      otherbitmap.words[k] = this.words[k] & ~otherbitmap.words[k]
    }
    // remaining words are all part of difference
    if (k < this.words.length) {
      otherbitmap.resize((this.words.length << 5) - 1)
      otherbitmap.words.set(this.words.subarray(k), k)
    } else {
      otherbitmap.words.fill(0, k)
    }
    return otherbitmap
  }

  // Returns a string representation
  toString(type: any): string {
    let str
    if (type) {
      const max = this.max()
      const arr = new Uint8Array(max)
      for (let j = 0; j < max; j++) {
        arr[j] = this.has(j)
      }
      str = arr.join("") || "0"
    } else {
      str = "{" + this.array().join(",") + "}"
    }
    return str
  }

  // Computes the union between this bitset and another one,
  // the current bitset is modified  (and returned by the function)
  union(otherbitmap: BitSet): BitSet {
    let mcount = Math.min(this.words.length, otherbitmap.words.length)
    let k = 0 | 0
    for (; k + 7 < mcount; k += 8) {
      this.words[k] |= otherbitmap.words[k]
      this.words[k + 1] |= otherbitmap.words[k + 1]
      this.words[k + 2] |= otherbitmap.words[k + 2]
      this.words[k + 3] |= otherbitmap.words[k + 3]
      this.words[k + 4] |= otherbitmap.words[k + 4]
      this.words[k + 5] |= otherbitmap.words[k + 5]
      this.words[k + 6] |= otherbitmap.words[k + 6]
      this.words[k + 7] |= otherbitmap.words[k + 7]
    }
    for (; k < mcount; ++k) {
      this.words[k] |= otherbitmap.words[k]
    }
    if (this.words.length < otherbitmap.words.length) {
      this.resize((otherbitmap.words.length << 5) - 1)
      this.words.set(otherbitmap.words.subarray(k), k)
    }
    return this
  }

  new_union(otherbitmap: BitSet, recycled: BitSet) {
    let count = Math.max(this.words.length, otherbitmap.words.length)
    const words = recycled
      ? recycled.resize((count << 5) - 1).words
      : new Uint32Array(count)
    let mcount = Math.min(this.words.length, otherbitmap.words.length)
    let k = 0
    for (; k + 7 < mcount; k += 8) {
      words[k] = this.words[k] | otherbitmap.words[k]
      words[k + 1] = this.words[k + 1] | otherbitmap.words[k + 1]
      words[k + 2] = this.words[k + 2] | otherbitmap.words[k + 2]
      words[k + 3] = this.words[k + 3] | otherbitmap.words[k + 3]
      words[k + 4] = this.words[k + 4] | otherbitmap.words[k + 4]
      words[k + 5] = this.words[k + 5] | otherbitmap.words[k + 5]
      words[k + 6] = this.words[k + 6] | otherbitmap.words[k + 6]
      words[k + 7] = this.words[k + 7] | otherbitmap.words[k + 7]
    }
    for (; k < mcount; ++k) {
      words[k] = this.words[k] | otherbitmap.words[k]
    }
    if (k < this.words.length) words.set(this.words.subarray(k), k)
    else if (k < otherbitmap.words.length)
      words.set(otherbitmap.words.subarray(k), k)

    return recycled || BitSet.fromWords(words)
  }

  // Computes the difference between this bitset and another one,
  // a new bitmap is generated
  new_difference(otherbitmap: BitSet, recycled: BitSet) {
    return this.clone(recycled).difference(otherbitmap) // should be fast enough
  }

  // Computes the size union between this bitset and another one
  union_size(otherbitmap: BitSet): number {
    let mcount = Math.min(this.words.length, otherbitmap.words.length)
    let answer = 0 | 0
    for (let k = 0 | 0; k < mcount; ++k) {
      answer += this.hammingWeight(this.words[k] | otherbitmap.words[k])
    }
    if (this.words.length < otherbitmap.words.length) {
      let c = otherbitmap.words.length
      for (let k = this.words.length; k < c; ++k) {
        answer += this.hammingWeight(otherbitmap.words[k] | 0)
      }
    } else {
      let c = this.words.length
      for (let k = otherbitmap.words.length; k < c; ++k) {
        answer += this.hammingWeight(this.words[k] | 0)
      }
    }
    return answer
  }
}

export { BitSet as default }
