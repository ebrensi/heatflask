/**
 * FastBitArray.js : a fast bit array implementation in JavaScript.
 * This is a very minimal fork of TypedFastBitSet.js by Daniel Lemire.
 * No type checking, error checking, or auto-resizing is done
 * so make sure you know what you are doing. 
 */
'use strict';

// FastBitArray is initialized with a number representing
// the maximum index we expect. an exception is thrown if 
// typed arrays are not supported
function FastBitArray(size) {
  this.words = new Uint32Array((size + 32) >>> 5);
}

// Add the value (Set the bit at index to true)
FastBitArray.prototype.set = function(index) {
  this.words[index >>> 5] |= 1 << index ;
};

// Set the bit at index to false
FastBitArray.prototype.unset = function(index) {
  this.words[index  >>> 5] &= ~(1 << index);
};

// If the value was not in the set, add it, otherwise remove it (flip bit at index)
FastBitArray.prototype.flip = function(index) {
  this.words[index >>> 5] ^= 1 << index ;
};

// Is the value contained in the set? Is the bit at index true or false? Returns a boolean
FastBitArray.prototype.val = function(index) {
  try {
    return (this.words[index  >>> 5] & (1 << index)) !== 0;
  }
  catch(e) {
    return false;
  }
};

// Reduce the memory usage to a minimum
FastBitArray.prototype.trim = function() {
  let nl = this.words.length
  while ((nl > 0) && (this.words[nl - 1] === 0)) {
      nl--;
  }
  this.words = this.words.slice(0,nl);
};

// Resize the bitset so that we can write a value at index
FastBitArray.prototype.resize = function(index) {
  let count = this.words.length
  if ((count << 5) > index) {
    return; //nothing to do
  }
  count = (index + 32) >>> 5;
  let newwords = new Uint32Array(count);
  newwords.set(this.words);// hopefully, this copy is fast
  this.words = newwords;
};

// fast function to compute the Hamming weight of a 32-bit unsigned integer
FastBitArray.prototype.hammingWeight = function(v) {
  v -= ((v >>> 1) & 0x55555555);// works with signed or unsigned shifts
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return ((v + (v >>> 4) & 0xF0F0F0F) * 0x1010101) >>> 24;
};


// How many values stored in the set? How many set bits?
FastBitArray.prototype.count = function() {
  let answer = 0,
      c = this.words.length;
  for (let i = 0; i < c; i++) {
    answer += this.hammingWeight(this.words[i] | 0);
  }
  return answer;
};

// Return an array with the set bit locations (values)
FastBitArray.prototype.array = function() {
  let count = this.count(),
      answer = new Array(count),
      pos = 0 | 0;
      wc = this.words.length | 0;
  for (let k = 0; k < wc; ++k) {
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
FastBitArray.prototype.forEach = function(fnc) {
  let wc = this.words.length | 0;
  for (let k = 0; k < wc; ++k) {
    let w =  this.words[k];
    while (w != 0) {
      let t = w & -w;
      fnc((k << 5) + this.hammingWeight(t - 1));
      w ^= t;
    }
  }
};

// Creates a copy of this bitmap
FastBitArray.prototype.clone = function() {
  let clone = Object.create(FastBitArray.prototype);
  clone.words = new Uint32Array(this.words);
  return clone;
};

// Returns a string representation
FastBitArray.prototype.toString = function() {
  return '{' + this.array().join(',') + '}';
};

module.exports = FastBitArray;
