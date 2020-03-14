/**
 * BitSet.js : a fast bit set implementation in JavaScript.
 * (c) the authors
 * Licensed under the Apache License, Version 2.0.
 *
 * Speed-optimized BitSet implementation for modern browsers and JavaScript engines.
 *
 * A BitSet is an ideal data structure to implement a Set when values being stored are
 * reasonably small integers. It can be orders of magnitude faster than a generic set implementation.
 * The BitSet implementation optimizes for speed, leveraging commonly available features
 * like typed arrays.
 *
 * Simple usage :
 *  // let BitSet = require("BitSet");// if you use node
 *  let b = new BitSet();// initially empty
 *  b.add(1);// add the value "1"
 *  b.has(1); // check that the value is present! (will return true)
 *  b.add(2);
 *  console.log(""+b);// should display {1,2}
 *  b.add(10);
 *  b.array(); // would return [1,2,10]
 *
 *  let c = new BitSet([1,2,3,10]); // create bitset initialized with values 1,2,3,10
 *  c.difference(b); // from c, remove elements that are in b
 *  let su = c.union_size(b);// compute the size of the union (bitsets are unchanged)
 * c.union(b); // c will contain all elements that are in c and b
 * let s1 = c.intersection_size(b);// compute the size of the intersection (bitsets are unchanged)
 * c.intersection(b); // c will only contain elements that are in both c and b
 * c = b.clone(); // create a (deep) copy of b and assign it to c.
 * c.equals(b); // check whether c and b are equal
 *
 *   See README.md file for a more complete description.
 *
 * You can install the library under node with the command line
 *   npm install BitSet
 */
'use strict';

// you can provide an iterable
function BitSet(iterable) {
  this.words = [];

  if ( Array.isArray(iterable) ||
    (ArrayBuffer.isView(iterable) && !(iterable instanceof DataView)) ) {
      for (let i=0,len=iterable.length;i<len;i++) {
        this.add(iterable[i]);
    }
  } else if (iterable && (iterable[Symbol.iterator] !== undefined)) {
      let iterator = iterable[Symbol.iterator]();
      let current = iterator.next();
      while(!current.done) {
        this.add(current.value);
        current = iterator.next();
      }
  }
}

BitSet.fromWords = function(words) {
  const answer = Object.create(BitSet.prototype);
  answer.words = words; 
}

BitSet.new_filter = function(iterable, fnc) {
  const answer = Object.create(BitSet.prototype);
  answer.words = [];
  return answer.filter(iterable, fnc) 
};

BitSet.prototype.filter = function(iterable, fnc) {
  this.clear();
  if ( Array.isArray(iterable) ||
    (ArrayBuffer.isView(iterable) && !(iterable instanceof DataView)) ) {
      const n = iterable.length;
      this.resize(n);
      for (let i=0;i<n;i++) {
        if (fnc(iterable[i]))
          this.words[i >>> 5] |= 1 << i ;
      }
  } else if (iterable[Symbol.iterator] !== undefined) {
      let iterator = iterable[Symbol.iterator]();
      let current = iterator.next();
      let i = 0;
      while(!current.done) {
        if (fnc(current.value))
          this.words[i >>> 5] |= 1 << i ;
        current = iterator.next();
      }
  }
  return this;
}

// Add the value (Set the bit at index to true)
BitSet.prototype.add = function(index) {
  this.resize(index);
  this.words[index >>> 5] |= 1 << index ;
  return this
};

// If the value was not in the set, add it, otherwise remove it (flip bit at index)
BitSet.prototype.flip = function(index) {
  this.resize(index);
  this.words[index >>> 5] ^= 1 << index ;
};

// Remove all values, reset memory usage
BitSet.prototype.clear = function() {
  this.words = []
  return this
};

// Set the bit at index to false
BitSet.prototype.remove = function(index) {
  const w = index >>> 5;
  if (w <= this.words.length)
    this.words[w] &= ~(1 << index);
  return this
};

// Return true if no bit is set
BitSet.prototype.isEmpty = function(index) {
  const c = this.words.length;
  for (let i = 0; i < c; i++) {
    if (this.words[i] !== 0) return false;
  }
  return true;
};

// Is the value contained in the set? Is the bit at index true or false? Returns a boolean
BitSet.prototype.has = function(index) {
  return (this.words[index  >>> 5] & (1 << index)) !== 0;
};

// Tries to add the value (Set the bit at index to true), return 1 if the
// value was added, return 0 if the value was already present
BitSet.prototype.checkedAdd = function(index) {
  this.resize(index);
  let word = this.words[index  >>> 5]
  let newword = word | (1 << index)
  this.words[index >>> 5] = newword
  return (newword ^ word) >>> index
};


// Reduce the memory usage to a minimum
BitSet.prototype.trim = function(index) {
  let nl = this.words.length
  while ((nl > 0) && (this.words[nl - 1] === 0)) {
      nl--;
  }
  this.words = this.words.slice(0,nl);
};


// Resize the bitset so that we can write a value at index
BitSet.prototype.resize = function(index) {
  let count = (index + 32) >>> 5;// just what is needed
  for(let i = this.words.length; i < count; i++) this.words[i] = 0;
  return this
};

// fast function to compute the Hamming weight of a 32-bit unsigned integer
BitSet.prototype.hammingWeight = function(v) {
  v -= ((v >>> 1) & 0x55555555);// works with signed or unsigned shifts
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return ((v + (v >>> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
};


// fast function to compute the Hamming weight of four 32-bit unsigned integers
BitSet.prototype.hammingWeight4 = function(v1,v2,v3,v4) {
  v1 -= ((v1 >>> 1) & 0x55555555);// works with signed or unsigned shifts
  v2 -= ((v2 >>> 1) & 0x55555555);// works with signed or unsigned shifts
  v3 -= ((v3 >>> 1) & 0x55555555);// works with signed or unsigned shifts
  v4 -= ((v4 >>> 1) & 0x55555555);// works with signed or unsigned shifts

  v1 = (v1 & 0x33333333) + ((v1 >>> 2) & 0x33333333);
  v2 = (v2 & 0x33333333) + ((v2 >>> 2) & 0x33333333);
  v3 = (v3 & 0x33333333) + ((v3 >>> 2) & 0x33333333);
  v4 = (v4 & 0x33333333) + ((v4 >>> 2) & 0x33333333);

  v1 = v1 + (v1 >>> 4) & 0xF0F0F0F;
  v2 = v2 + (v2 >>> 4) & 0xF0F0F0F;
  v3 = v3 + (v3 >>> 4) & 0xF0F0F0F;
  v4 = v4 + (v4 >>> 4) & 0xF0F0F0F;
  return (( (v1 + v2 + v3 + v4) * 0x1010101) >>> 24);
};

// How many values stored in the set? How many set bits?
BitSet.prototype.size = function() {
  let answer = 0;
  const c = this.words.length;
  const w = this.words;
  let i = 0;
  for (; i < c; i++) {
    answer += this.hammingWeight(w[i]);
  }
  return answer;
};

BitSet.prototype.min = function() {
  const c = this.words.length;
  let w;
  for (let k = 0; k < c; ++k) {
    w =  this.words[k];
    if (w != 0) {
      const t = w & -w;
      return (k << 5) + this.hammingWeight((t - 1) | 0);
    }
  }
};

BitSet.prototype.max = function() {
  let pos = 0 | 0;
  const c = this.words.length-1;
  for (let k = c; k >= 0; --k) {
    let w =  this.words[k];
    if (w != 0) {
      let t = 0;
      while (w != 0) {
        t = w & -w;
        w ^= t;
      }
      return (k << 5) + this.hammingWeight((t - 1) | 0);
    }
  }
  return 0
};

// Return an array with the set bit locations (values)
BitSet.prototype.array = function(ArrayConstructor) {
  const max = this.max();
  ArrayConstructor = ArrayConstructor || (max >> 8)? ((max >> 16)? Uint32Array : Uint16Array) : Uint8Array 

  const answer = new ArrayConstructor(this.size());
  let pos = 0 | 0;
  const c = this.words.length;
  for (let k = 0; k < c; ++k) {
    let w =  this.words[k];
    while (w != 0) {
      let t = w & -w;
      answer[pos++] = (k << 5) + this.hammingWeight((t - 1) | 0);
      w ^= t;
    }
  }
  return answer;
};

// Return an array with the set bit locations (values)
BitSet.prototype.forEach = function(fnc) {
  const c = this.words.length;
  for (let k = 0; k < c; ++k) {
    let w =  this.words[k];
    while (w != 0) {
      let t = w & -w;
      fnc((k << 5) + this.hammingWeight((t - 1) | 0));
      w ^= t;
    }
  }
};

// Iterate the members of this BitSet
BitSet.prototype.imap = function*(fnc) {
  fnc = fnc || (i => i);
  const c = this.words.length;
  for (let k = 0; k < c; ++k) {
    let w = this.words[k];
    while (w != 0) {
      let t = w & -w;
      yield fnc((k << 5) + this.hammingWeight((t - 1) | 0));
      w ^= t;
    }
  }
};

BitSet.prototype[Symbol.iterator] = function (){
  return this.imap()
};

//   with the option to "fast-forward" 
//  to a position set by this.next(position).
BitSet.prototype.imap_find = function*(fnc, next_pos) {
  const c = this.words.length,
        w = this.words[0];

  let pos = 0,
      k = 0;

  for (let k = 0; k < c; ++k) {
    let w = this.words[k];
    while (w != 0) {
      let t = w & -w;

      if (next_pos === undefined || pos == next_pos) {
        next_pos = yield fnc((k << 5) + this.hammingWeight((t - 1) | 0));
      }
      pos++;
      w ^= t;
    }
  }
};

// iterate a subset of this BitSet, where the subset is a BitSet
// i.e. for each i in subBitSet, yield the i-th member of this BitSet
BitSet.prototype.imap_subset = function*(bitSubSet, fnc) {
  const idxGen = bitSubSet.imap();

  let pos = 0,
      next = idxGen.next(),
      k = 0, 
      w = this.words[0];

  while (!next.done) {
    let t, next_pos = next.value;
    while (pos++ < next_pos) {
      t = w & -w;
      w ^= t;
      if (w == 0)
        w = this.words[++k];
    }
    yield fnc((k << 5) + this.hammingWeight((t - 1) | 0));
    next = idxGen.next();
  }
};

BitSet.prototype.new_subset = function(bitSubSet) {
  const newSet = Object.create(BitSet.prototype),
        idxGen = bitSubSet.imap();

  newSet.words = [];
        
  let c = this.words.length,
      next = idxGen.next().value,
      i = 0;

  for (let k = 0; k < c; ++k) {
    let w =  this.words[k];
    while (w != 0) {
      let t = w & -w;
      w ^= t;
      if (i++ == next) {
        newSet.add((k << 5) + this.hammingWeight((t - 1) | 0));
        next = idxGen.next().value;
      }
    }
  }
  return newSet
};

// Creates a copy of this bitmap
BitSet.prototype.clone = function() {
  let clone = Object.create(BitSet.prototype);
  clone.words = this.words.slice();
  return clone;
};

// Check if this bitset intersects with another one,
// no bitmap is modified
BitSet.prototype.intersects = function(otherbitmap) {
  let newcount = Math.min(this.words.length,otherbitmap.words.length);
  for (let k = 0 | 0; k < newcount; ++k) {
    if ((this.words[k] & otherbitmap.words[k]) !== 0) return true;
  }
  return false;
};

// Computes the intersection between this bitset and another one,
// the current bitmap is modified  (and returned by the function)
BitSet.prototype.intersection = function(otherbitmap) {
  let newcount = Math.min(this.words.length,otherbitmap.words.length);
  let k = 0 | 0;
  for (; k + 7 < newcount; k += 8) {
    this.words[k] &= otherbitmap.words[k];
    this.words[k + 1] &= otherbitmap.words[k + 1];
    this.words[k + 2] &= otherbitmap.words[k + 2];
    this.words[k + 3] &= otherbitmap.words[k + 3];
    this.words[k + 4] &= otherbitmap.words[k + 4];
    this.words[k + 5] &= otherbitmap.words[k + 5];
    this.words[k + 6] &= otherbitmap.words[k + 6];
    this.words[k + 7] &= otherbitmap.words[k + 7];
  }
  for (; k < newcount; ++k) {
    this.words[k] &= otherbitmap.words[k];
  }
  let c = this.words.length;
  for (let k = newcount; k < c; ++k) {
    this.words[k] = 0;
  }
  return this;
};

// Computes the size of the intersection between this bitset and another one
BitSet.prototype.intersection_size = function(otherbitmap) {
  let newcount = Math.min(this.words.length,otherbitmap.words.length);
  let answer = 0 | 0;
  for (let k = 0 | 0; k < newcount; ++k) {
    answer += this.hammingWeight(this.words[k] & otherbitmap.words[k]);
  }

  return answer;
};

// Computes the intersection between this bitset and another one,
// a new bitmap is generated
BitSet.prototype.new_intersection = function(otherbitmap) {
  let answer = Object.create(BitSet.prototype);
  let count = Math.min(this.words.length,otherbitmap.words.length);
  answer.words = new Array(count);
  let c = count;
  let k = 0 | 0;
  for (; k + 7  < c; k += 8) {
      answer.words[k] = this.words[k] & otherbitmap.words[k];
      answer.words[k+1] = this.words[k+1] & otherbitmap.words[k+1];
      answer.words[k+2] = this.words[k+2] & otherbitmap.words[k+2];
      answer.words[k+3] = this.words[k+3] & otherbitmap.words[k+3];
      answer.words[k+4] = this.words[k+4] & otherbitmap.words[k+4];
      answer.words[k+5] = this.words[k+5] & otherbitmap.words[k+5];
      answer.words[k+6] = this.words[k+6] & otherbitmap.words[k+6];
      answer.words[k+7] = this.words[k+7] & otherbitmap.words[k+7];
  }
  for (; k < c; ++k) {
    answer.words[k] = this.words[k] & otherbitmap.words[k];
  }
  return answer;
};

BitSet.prototype.equals = function(otherbitmap) {
  let mcount = Math.min(this.words.length , otherbitmap.words.length);
  for (let k = 0 | 0; k < mcount; ++k) {
    if (this.words[k] != otherbitmap.words[k]) return false;
  }
  if (this.words.length < otherbitmap.words.length) {
    let c = otherbitmap.words.length;
    for (let k = this.words.length; k < c; ++k) {
      if (otherbitmap.words[k] != 0) return false;
    }
  } else if (otherbitmap.words.length < this.words.length) {
    let c = this.words.length;
    for (let k = otherbitmap.words.length; k < c; ++k) {
      if (this.words[k] != 0) return false;
    }
  }
  return true;
};

// Computes the change (XOR) between this bitset and another one,
// the current bitset is modified (and returned by the function)
BitSet.prototype.change = function(otherbitmap) {
  let newcount = Math.max(this.words.length, otherbitmap.words.length);
  let k = 0 | 0;
  for (; k + 7 < newcount; k += 8) {
    this.words[k] ^= otherbitmap.words[k];
    this.words[k + 1] ^= otherbitmap.words[k + 1];
    this.words[k + 2] ^= otherbitmap.words[k + 2];
    this.words[k + 3] ^= otherbitmap.words[k + 3];
    this.words[k + 4] ^= otherbitmap.words[k + 4];
    this.words[k + 5] ^= otherbitmap.words[k + 5];
    this.words[k + 6] ^= otherbitmap.words[k + 6];
    this.words[k + 7] ^= otherbitmap.words[k + 7];
  }
  for (; k < newcount; ++k) {
    this.words[k] ^= otherbitmap.words[k];
  }
  return this;
};

// Computes the difference between this bitset and another one,
// the current bitset is modified (and returned by the function)
BitSet.prototype.difference = function(otherbitmap) {
  let newcount = Math.min(this.words.length,otherbitmap.words.length);
  let k = 0 | 0;
  for (; k + 7 < newcount; k += 8) {
    this.words[k] &= ~otherbitmap.words[k];
    this.words[k + 1] &= ~otherbitmap.words[k + 1];
    this.words[k + 2] &= ~otherbitmap.words[k + 2];
    this.words[k + 3] &= ~otherbitmap.words[k + 3];
    this.words[k + 4] &= ~otherbitmap.words[k + 4];
    this.words[k + 5] &= ~otherbitmap.words[k + 5];
    this.words[k + 6] &= ~otherbitmap.words[k + 6];
    this.words[k + 7] &= ~otherbitmap.words[k + 7];
  }
  for (; k < newcount; ++k) {
    this.words[k] &= ~otherbitmap.words[k];
  }
  return this;
};

// Computes the size of the difference between this bitset and another one
BitSet.prototype.difference_size = function(otherbitmap) {
  let newcount = Math.min(this.words.length,otherbitmap.words.length);
  let answer = 0 | 0;
  let k = 0 | 0;
  for (; k < newcount; ++k) {
    answer += this.hammingWeight(this.words[k] & (~otherbitmap.words[k]));
  }
  let c = this.words.length;
  for (; k < c; ++k) {
    answer += this.hammingWeight(this.words[k]);
  }
  return answer;
};

// Returns a string representation
BitSet.prototype.toString = function() {
  return '{' + this.array().join(',') + '}';
};

// Computes the union between this bitset and another one,
// the current bitset is modified  (and returned by the function)
BitSet.prototype.union = function(otherbitmap) {
  let mcount = Math.min(this.words.length,otherbitmap.words.length);
  let k = 0 | 0;
  for (; k + 7  < mcount; k += 8) {
    this.words[k] |= otherbitmap.words[k];
    this.words[k + 1] |= otherbitmap.words[k + 1];
    this.words[k + 2] |= otherbitmap.words[k + 2];
    this.words[k + 3] |= otherbitmap.words[k + 3];
    this.words[k + 4] |= otherbitmap.words[k + 4];
    this.words[k + 5] |= otherbitmap.words[k + 5];
    this.words[k + 6] |= otherbitmap.words[k + 6];
    this.words[k + 7] |= otherbitmap.words[k + 7];
  }
  for (; k < mcount; ++k) {
    this.words[k] |= otherbitmap.words[k];
  }
  if (this.words.length < otherbitmap.words.length) {
    this.resize((otherbitmap.words.length  << 5) - 1);
    let c = otherbitmap.words.length;
    for (let k = mcount; k < c; ++k) {
      this.words[k] = otherbitmap.words[k];
    }
  }
  return this;
};

BitSet.prototype.new_union = function(otherbitmap) {
  let answer = Object.create(BitSet.prototype);
  let count = Math.max(this.words.length,otherbitmap.words.length);
  answer.words = new Array(count);
  let mcount = Math.min(this.words.length,otherbitmap.words.length);
  let k = 0;
  for (; k + 7  < mcount; k += 8) {
      answer.words[k] = this.words[k] | otherbitmap.words[k];
      answer.words[k+1] = this.words[k+1] | otherbitmap.words[k+1];
      answer.words[k+2] = this.words[k+2] | otherbitmap.words[k+2];
      answer.words[k+3] = this.words[k+3] | otherbitmap.words[k+3];
      answer.words[k+4] = this.words[k+4] | otherbitmap.words[k+4];
      answer.words[k+5] = this.words[k+5] | otherbitmap.words[k+5];
      answer.words[k+6] = this.words[k+6] | otherbitmap.words[k+6];
      answer.words[k+7] = this.words[k+7] | otherbitmap.words[k+7];
  }
  for (; k < mcount; ++k) {
      answer.words[k] = this.words[k] | otherbitmap.words[k];
  }
  let c = this.words.length;
  for (let k = mcount; k < c; ++k) {
      answer.words[k] = this.words[k] ;
  }
  let c2 = otherbitmap.words.length;
  for (let k = mcount; k < c2; ++k) {
      answer.words[k] = otherbitmap.words[k] ;
  }
  return answer;
};

// Computes the difference between this bitset and another one,
// a new bitmap is generated
BitSet.prototype.new_difference = function(otherbitmap) {
  return this.clone().difference(otherbitmap);// should be fast enough
};

// Computes the size union between this bitset and another one
BitSet.prototype.union_size = function(otherbitmap) {
  let mcount = Math.min(this.words.length,otherbitmap.words.length);
  let answer = 0 | 0;
  for (let k = 0 | 0; k < mcount; ++k) {
    answer += this.hammingWeight(this.words[k] | otherbitmap.words[k]);
  }
  if (this.words.length < otherbitmap.words.length) {
    let c = otherbitmap.words.length;
    for (let k = this.words.length ; k < c; ++k) {
      answer += this.hammingWeight(otherbitmap.words[k] | 0);
    }
  } else {
    let c = this.words.length;
    for (let k = otherbitmap.words.length ; k < c; ++k) {
      answer += this.hammingWeight(this.words[k] | 0);
    }
  }
  return answer;
};
