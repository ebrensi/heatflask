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
  this.size = size;
  this.words = new Uint32Array((size + 31) >>> 5);
}

// Add the value (Set the bit at index to val)
FastBitArray.prototype.set = function(index, val) {
  if (index >= this.size)
    return

  if (val)
    this.words[index >>> 5] |= 1 << index;
  else
    this.words[index  >>> 5] &= ~(1 << index);
};

// negate this array up to size
FastBitArray.prototype.negate = function() {
  const W = this.size >>> 5,
        L = this.words.length;

  for (let w=0; w <= W; w++) {
    this.words[w] = ~this.words[w];
  }

  const mask = (1 << (this.size % 32)) - 1;

  this.words[W] &= mask;

  for (let w=W+1; w < L; w++) {
    this.words[w] = 0;
  }
  return this;
};

// Is the value contained in the set? Is the bit at index true or false? Returns a boolean
FastBitArray.prototype.val = function(index) {
  if (index >= this.size)
    return

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
  return this
};

FastBitArray.prototype.clear = function(){
  this.words.fill(0);
  return this
};

FastBitArray.prototype.maxSize = function() {
  return this.words.length << 5;
}


FastBitArray.recycle = function(bitArray, size) {
  if (bitArray)
    return bitArray.reuse(size);
  else
    return new FastBitArray(size);
};

// Resize the bitset so that we can write a value at index
FastBitArray.prototype.reuse = function(n, clear=true) {
  this.size = n;
  let count = this.words.length;
  if ((count << 5) >= n) {
    if (clear)
      this.clear();
  } else {
    count = (n + 31) >>> 5;
    let newwords = new Uint32Array(count);
    if (!clear) {
      newwords.set(this.words);// hopefully, this copy is fast
      this.words = newwords;
    }
  }
  return this
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

// Return true if no bit is set
FastBitArray.prototype.isEmpty = function(index) {
  const c = this.words.length;
  for (var  i = 0; i < c; i++) {
    if (this.words[i] !== 0) return false;
  }
  return true;
};

// Return an array with the set bit locations (values)
FastBitArray.prototype.array = function() {
  let count = this.count(),
      ArrayConstructor = (count >> 16)? 
          Uint32Array : (count >> 8) ? Uint16Array : Uint8Array,
      answer =  new ArrayConstructor(count),
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

FastBitArray.prototype.iterate = function*(n) {
  let pos = 0 | 0;
      wc = this.words.length | 0;
  for (let k = 0; k < wc; ++k) {
    let w =  this.words[k];
    while ((w != 0) && (!n || pos < n) ) {
      let t = w & -w;
      yield (k << 5) + this.hammingWeight((t - 1) | 0);
      
      pos++;
      w ^= t;
    }
  }
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

FastBitArray.filter = function(array, func, bitArray=null) {
  const n = array.length;;

  bitArray = bitArray || new FastBitArray(n);

  let i = 0;
  for (let obj of array)
    bitArray.set(i++, !!func(obj));

  return bitArray
};

FastBitArray.prototype.filter = function(array, func) {
  return FastBitArray.filter(array, func, self)
};

// Computes the intersection between this bitset and another one,
// this is overwritten
FastBitArray.prototype.intersect = function(sourcebitmap) {
  const c = this.count();
  for (let k = 0 | 0; k < c; ++k) {
    this.words[k] &= sourcebitmap.words[k];
  }
  return this;
};


FastBitArray.prototype.copyFrom = function(sourcebitmap) {
  this.words.set(sourcebitmap.words);
  return this
}

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

// module.exports = FastBitArray;
