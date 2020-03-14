

const data = {};

const onmessage = function(event) {
    let msg = event.data;

    if ("hello" in msg){  
        data.name = msg.hello;
        postMessage(`Hello! ${data.name} at your service!`);
    }
};


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


/**
 * Based off of [the offical Google document](https://developers.google.com/maps/documentation/utilities/polylinealgorithm)
 *
 * Some parts from [this implementation](http://facstaff.unca.edu/mcmcclur/GoogleMaps/EncodePolyline/PolylineEncoder.js)
 * by [Mark McClure](http://facstaff.unca.edu/mcmcclur/)
 *
 * modified by Efrem Rensi
 * 
 */

const Polyline = {
    /**
     * Decodes to a [latitude, longitude] coordinates array.
     *
     * This is adapted from the implementation in Project-OSRM.
     *
     * @param {String} str
     * @param {Number} precision
     * @returns {Array}
     *
     * @see https://github.com/Project-OSRM/osrm-frontend/blob/master/WebContent/routing/OSRM.RoutingGeometry.js
     */
    decode: function*(str, precision) {
        let index = 0,
            lat = 0,
            lng = 0,
            coordinates = [],
            shift = 0,
            result = 0,
            byte = null,
            latitude_change,
            longitude_change,
            factor = Math.pow(10, Number.isInteger(precision) ? precision : 5),
            latLng = new Float32Array(2);

        // Coordinates have variable length when encoded, so just keep
        // track of whether we've hit the end of the string. In each
        // loop iteration, a single coordinate is decoded.
        while (index < str.length) {

            // Reset shift, result, and byte
            byte = null;
            shift = 0;
            result = 0;

            do {
                byte = str.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);

            latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));

            shift = result = 0;

            do {
                byte = str.charCodeAt(index++) - 63;
                result |= (byte & 0x1f) << shift;
                shift += 5;
            } while (byte >= 0x20);

            longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));

            lat += latitude_change;
            lng += longitude_change;

            latLng[0] = lat / factor;
            latLng[1] = lng / factor;

            yield latLng;
        }
    },

    lengthInPoints: function(str) {
        let byte, count = 0, index =0;

        while (index < str.length) {
            do
                byte = str.charCodeAt(index++) - 63;
            while (byte >= 0x20);

            do
                byte = str.charCodeAt(index++) - 63;
            while (byte >= 0x20);

            count ++;
        }
        return count;
    },
 
    decode2Buf: function(str, n, precision) {
        n = n || this.lengthInPoints(str);
        const buf = new Float32Array(2*n),
              decoder = this.decode(str, precision);
        
        let i = 0;
        for (const latLng of decoder)
            buf.set(latLng, 2*i++);
        return buf
    },

    iterBuf: function*(buf){
        const len = buf.length;
        for (let i=0; i<len; i+=2)
            yield buf.subarray(i, i+2);
    }

};

const StreamRLE = {
    // decode a (RLE-encoded) array of successive differences into
    //  an array of the original values
    //  This will decode both [1, 2,2,2,2,2,2, 5] and [1, [2,6], 5] into
    //    [0, 1, 3, 5, 7, 9, 11, 13, 18]
    decodeList: function*(rle_list, first_value=0) {
        let running_sum = first_value,
            len = rle_list.length;
        yield running_sum;
        for (let i=0, el; i<len; i++) {
            el = rle_list[i];
            if (el instanceof Array) {
                for (let j=0; j<el[1]; j++) {
                    running_sum += el[0];
                    yield running_sum;
                }
            } else {
                running_sum += el;
                yield running_sum;
            }
        }
    },

    _decodedListLength: function(rle_list) {
      let len = 0; // We don't count the start value!
      for (const el of rle_list) {
        if (el instanceof Array)
          len += el[1];
        else
          len++;
      }
      return len
    },

    // We store RLE stream data locally a little differently.
    //  a run of repeated values is represented by 
    //  3 consecutive values 0, runlength, value
    //  which allows us to avoid storing negative numbers.
    _transcodeInfo: function(rle_list) {
      let len = 0, // We don't count the start value!
          max = 0;

      for (const el of rle_list) {
        if (el instanceof Array) {
            if (el[1] > 2)
              len += 3;
            else
              len += 2;

            if (el[0] > max) max = el[0];
            if (el[1] > max) max = el[1];

        } else {
            len++;
            if (el > max) max = el;
        }
      }
      return {len: len, max: max}
    },

    transcode2Buf: function(rle_list) {
      // debugger;
        const {len, max} = this._transcodeInfo(rle_list),
              ArrayConstructor = (max >> 8)? ((max >> 16)? Uint32Array : Uint16Array) : Uint8Array, 
              buf = new ArrayConstructor(len);

        let j = 0;
        for (const el of rle_list) {
            if (el instanceof Array) {
                if (el[1] > 2) {
                  // this is only efficient if we have a
                  // run of 3 or more repeated values
                  buf[j++] = 0;
                  buf[j++] = el[1];
                  buf[j++] = el[0];
                } else {
                  // we only have two so we flatten it
                  buf[j++] = el[0];
                  buf[j++] = el[0];
                }
          
            } else
                buf[j++] = el;
        }
        return buf
    },

    transcode2CompressedBuf: function(rle_list) {
        const buf = this.transcode2Buf(rle_list);
        return VByte.compress(buf);
    },

    decodeBuf: function*(buf, first_value=0) {
        let running_sum = first_value,
            len = buf.length;

        yield running_sum;

        for (let i=0, el; i<len; i++) {
            el = buf[i];
            if (el === 0) {
                const n = buf[++i],
                      repeated = buf[++i];
                for (let j=0; j<n; j++) {
                    running_sum += repeated;
                    yield running_sum;
                }
            } else {
                running_sum += el;
                yield running_sum;
            }
        }
    },

    decodeCompressedBuf: function*(cbuf, first_value=0) {
        const bufGen = VByte.uncompress(cbuf);

        let running_sum = first_value;
        yield running_sum;

        for (const el of bufGen) {
            if (el === 0) {
                const n = bufGen.next().value,
                      repeated = bufGen.next().value;

                for (let j=0; j<n; j++) {
                    running_sum += repeated;
                    yield running_sum;
                }
            } else {
                running_sum += el;
                yield running_sum;
            }
        }
    },

    decodeCompressedBuf2: function(cbuf, idxSet, first_value=0) {
        const bufGen = VByte.uncompress(cbuf);
        let j = 0, k, repeated,
            sum = first_value; // j is our counter for bufGen

        return idxSet.imap(i => {
          // we will return the i-th element of bufGen
          
          // ..if we are continuing a repeat streak
          while (k > 0) {
            sum += repeated;
            k--;
            if (++j == i)
              return sum
          }

          if (j == i) 
            return sum
          else {

            while (j < i) {
              const el = bufGen.next().value;
              if (el === 0) {
                k = bufGen.next().value;
                repeated = bufGen.next().value;
                while (k--) {
                  sum += repeated;
                  if (++j == i)
                    return sum
                }

              } else {
                sum += el;
                j++;
              }
            }
            return sum
          }

        });
    }
};

/**
 * FastIntegerCompression.js : a fast integer compression library in JavaScript.
 * (c) the authors (Daniel Lemire)
 * Licensed under the Apache License, Version 2.0.
 *
 *  Modified by Efrem Rensi Jan 2020
 */

// you can provide an iterable
const VByte =  {

    // private function
    _bytelog: function(val) {
      if (val < (1 << 7)) {
        return 1;
      } else if (val < (1 << 14)) {
        return 2;
      } else if (val < (1 << 21)) {
        return 3;
      } else if (val < (1 << 28)) {
        return 4;
      }
      return 5;
    },

    // compute how many bytes an array of integers would use once compressed
// input is expected to be an array of non-negative integers
    compressedSizeInBytes: function(input) {
      const c = input.length;
      let answer = 0;
      for(let i = 0; i < c; i++) {
        answer += this._bytelog(input[i]);
      }
      return answer;
    },

    // Compress an array of integers, return a compressed buffer (as an ArrayBuffer).
    // It is expected that the integers are non-negative: the caller is responsible
    // for making this check. Floating-point numbers are not supported.
    compress: function(input) {
      const c = input.length,
            buf = new ArrayBuffer(this.compressedSizeInBytes(input)),
            view   = new Int8Array(buf);
      let pos = 0;
      for(let i = 0; i < c; i++) {
        const val = input[i];
        if (val < (1 << 7)) {
          view[pos++] = val ;
        } else if (val < (1 << 14)) {
          view[pos++] = (val & 0x7F) | 0x80;
          view[pos++] = val >>> 7;
        } else if (val < (1 << 21)) {
          view[pos++] = (val & 0x7F) | 0x80;
          view[pos++] = ( (val >>> 7) & 0x7F ) | 0x80;
          view[pos++] = val >>> 14;
        } else if (val < (1 << 28)) {
          view[pos++] = (val & 0x7F ) | 0x80 ;
          view[pos++] = ( (val >>> 7) & 0x7F ) | 0x80;
          view[pos++] = ( (val >>> 14) & 0x7F ) | 0x80;
          view[pos++] = val >>> 21;
        } else {
          view[pos++] = ( val & 0x7F ) | 0x80;
          view[pos++] = ( (val >>> 7) & 0x7F ) | 0x80;
          view[pos++] = ( (val >>> 14) & 0x7F ) | 0x80;
          view[pos++] = ( (val >>> 21) & 0x7F ) | 0x80;
          view[pos++] = val >>> 28;
        }
      }
      return buf;
    },

    // from a compressed array of integers stored ArrayBuffer, compute the number of compressed integers by scanning the input
    computeHowManyIntegers: function(input) {
      const view = new Int8Array(input),
            c = view.length;

      let count = 0;
      for(let i = 0; i < c; i++) {
        count += (input[i]>>>7);
      }

      return c - count;
    },

    // uncompress an array of integer from an ArrayBuffer, return the array
    // it is assumed that they were compressed using the compress function, the caller
    // is responsible for ensuring that it is the case.
    uncompress: function*(input) {
      const inbyte = new Int8Array(input),
            end = inbyte.length;
      let pos = 0;
      while (end > pos) {
            let c = inbyte[pos++],
                v = c & 0x7F;
            if (c >= 0) {
              yield v;
              continue;
            }
            c = inbyte[pos++];
            v |= (c & 0x7F) << 7;
            if (c >= 0) {
              yield v;
              continue;
            }
            c = inbyte[pos++];
            v |= (c & 0x7F) << 14;
            if (c >= 0) {
              yield v;
              continue;
            }
            c = inbyte[pos++];
            v |= (c & 0x7F) << 21;
            if (c >= 0) {
              yield v;
              continue;
            }
            c = inbyte[pos++];
            v |= c << 28;
            yield v;
      }
    },

    // ***** For Signed Integers *********
    _zigzag_encode: function(val) {
      return (val + val) ^ (val >> 31);;
    },

    _zigzag_decode: function(val) {
      return  (val >> 1) ^ (- (val & 1));
    },

    // compute how many bytes an array of integers would use once compressed
    // input is expected to be an array of integers, some of them can be negative
    compressedSizeInBytesSigned: function(input) {
      const c = input.length;
      const bytelog = this._bytelog,
            zze = this._zigzag_encode,
            bzze = i => bytelog(zze(input[i]));
      
      let answer = 0;

      for(let i = 0; i < c; i++)
        answer += bzze(i)
      return answer;
    },

    // Compress an array of integers, return a compressed buffer (as an ArrayBuffer).
    // The integers can be signed (negative), but floating-point values are not supported.
    compressSigned: function(input) {
      const c = input.length,
            buf = new ArrayBuffer(this.computeCompressedSizeInBytesSigned(input)),
            view = new Int8Array(buf),
            zze = this._zigzag_encode;
      let pos = 0;

      for(let i = 0; i < c; i++) {
        let val = zze(input[i]);
        if (val < (1 << 7)) {
          view[pos++] = val ;
        } else if (val < (1 << 14)) {
          view[pos++] = (val & 0x7F) | 0x80;
          view[pos++] = val >>> 7;
        } else if (val < (1 << 21)) {
          view[pos++] = (val & 0x7F) | 0x80;
          view[pos++] = ( (val >>> 7) & 0x7F ) | 0x80;
          view[pos++] = val >>> 14;
        } else if (val < (1 << 28)) {
          view[pos++] = (val & 0x7F ) | 0x80 ;
          view[pos++] = ( (val >>> 7) & 0x7F ) | 0x80;
          view[pos++] = ( (val >>> 14) & 0x7F ) | 0x80;
          view[pos++] = val >>> 21;
        } else {
          view[pos++] = ( val & 0x7F ) | 0x80;
          view[pos++] = ( (val >>> 7) & 0x7F ) | 0x80;
          view[pos++] = ( (val >>> 14) & 0x7F ) | 0x80;
          view[pos++] = ( (val >>> 21) & 0x7F ) | 0x80;
          view[pos++] = val >>> 28;
        }
      }
      return buf;
    },

    // uncompress an array of integer from an ArrayBuffer, return the array
    // it is assumed that they were compressed using the compressSigned function, the caller
    // is responsible for ensuring that it is the case.
    uncompressSigned: function*(input) {
      const inbyte = new Int8Array(input);
      const end = inbyte.length;
      let pos = 0;
      const zzd = this._zigzag_decode;

      while (end > pos) {
            let c = inbyte[pos++],
                v = c & 0x7F;
            if (c >= 0) {
              yield zzd(v)
              continue;
            }
            c = inbyte[pos++];
            v |= (c & 0x7F) << 7;
            if (c >= 0) {
              yield zzd(v)
              continue;
            }
            c = inbyte[pos++];
            v |= (c & 0x7F) << 14;
            if (c >= 0) {
              yield zzd(v)
              continue;
            }
            c = inbyte[pos++];
            v |= (c & 0x7F) << 21;
            if (c >= 0) {
              yield zzd(v)
              continue;
            }
            c = inbyte[pos++];
            v |= c << 28;
            yield zzd(v)
      }
    }
};





const Simplifier = {
    /* 
        Adapted from V. Agafonkin's simplify.js implementation of
        Douglas-Peucker simplification algorithm
    */

    // points is a function p(i) that directly accesses the i-th point
    // of our data set.  we must assume that the point we get is
    // a pointer to he same memory location every time, so we need to make copy
    // ourselves.
    simplify: function(points, n, tolerance) {
        const sqTolerance = tolerance * tolerance;

        let idxBitSet = this.simplifyRadialDist(points, n, sqTolerance);
        
        const idx = idxBitSet.array(),
              subset = i => points(idx[i]),
        
              idxBitSubset = this.simplifyDouglasPeucker(
                subset, idx.length, sqTolerance
              );
        
        idxBitSet = idxBitSet.new_subset(idxBitSubset);

        return idxBitSet
    },

    // basic distance-based simplification
    simplifyRadialDist: function(points, n, sqTolerance) {
        const selectedIdx = new BitSet(),
              prevPoint = new Float32Array(2);

        let point = points(0), i;
        prevPoint[0] = point[0];
        prevPoint[1] = point[1];
        selectedIdx.add(0);

        for (i=1; i<n; i++) {
            point = points(i); 
            if (this.getSqDist(point, prevPoint) > sqTolerance) {
                selectedIdx.add(i++);
                prevPoint[0] = point[0];
                prevPoint[1] = point[1];
            }
        }
        
        if (!this.equal(point, prevPoint))
            selectedIdx.add(i)

        return selectedIdx;
    },

    // simplification using Ramer-Douglas-Peucker algorithm
    simplifyDouglasPeucker: function(points, n, sqTolerance) {
        const bitSet = new BitSet(),
              buffer = new Float32Array(4),
              p1 = buffer.subarray(0, 2),
              p2 = buffer.subarray(2, 4);
        
        bitSet.add(0);
        const first = points(0);
        p1[0] = first[0];
        p1[1] = first[1];

        bitSet.add(n-1);
        const last = points(n-1);
        p2[0] = last[0];
        p2[1] = last[1];

        this.simplifyDPStep(points, 0, n-1, sqTolerance, bitSet, p1, p2);

        return bitSet
    },

    simplifyDPStep: function(points, firstIdx, lastIdx, sqTolerance, bitSet, p1, p2) {
        let maxSqDist = sqTolerance,
            index;

        for (let idx = firstIdx + 1; idx < lastIdx; idx++) {
            const sqDist = this.getSqSegDist( points(idx), p1, p2 );

            if (sqDist > maxSqDist) {
                index = idx;
                maxSqDist = sqDist;
            }
        }

        if (maxSqDist > sqTolerance) {
            if (index - firstIdx > 1) {
                const p = points(index);
                p2[0] = p[0];
                p2[1] = p[1];
                this.simplifyDPStep(points, firstIdx, index, sqTolerance, bitSet, p1, p2);
            }
            
            bitSet.add(index);
            
            if (lastIdx - index > 1) {
                const p = points(index);
                p1[0] = p[0];
                p1[1] = p[1];
                this.simplifyDPStep(points, index, lastIdx, sqTolerance, bitSet, p1, p2);
            }
        }
    },

    equal: function(p1, p2) {
        return p1[0] == p2[0] && p1[1] == p2[1]
    },

    // square distance between 2 points
    getSqDist: function(p1, p2) {

        const dx = p1[0] - p2[0],
              dy = p1[1] - p2[1];

        return dx * dx + dy * dy;
    },

    // square distance from a point to a segment
    getSqSegDist: function(p, p1, p2) {

        let x = p1[0],
            y = p1[1],
            dx = p2[0] - x,
            dy = p2[1] - y;

        if (dx !== 0 || dy !== 0) {

            const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);

            if (t > 1) {
                x = p2[0];
                y = p2[1];

            } else if (t > 0) {
                x += dx * t;
                y += dy * t;
            }
        }

        dx = p[0] - x;
        dy = p[1] - y;

        return dx * dx + dy * dy;
    }
};

const CRS = {
    // This is a streamlined version of Leaflet's EPSG:3857 crs,
    // which can run independently of Leaflet.js (i.e. in a worker thread)
    //  latlngpt is a a 2d-array [lat,lng] rather than a latlng object
    code: 'EPSG:3857',
    MAX_LATITUDE: 85.0511287798,
    EARTH_RADIUS: 6378137,
    RAD: Math.PI / 180,

    // Note: These operations are done in-place!!

    // This projects LatLng coordinate onto a rectangular grid 
    Projection: function() {
        const max = this.MAX_LATITUDE,
              R = this.EARTH_RADIUS,
              rad = this.RAD;

        return function(latlngpt){
            const lat = Math.max(Math.min(max, latlngpt[0]), -max),
                  sin = Math.sin(lat * rad),
                  p_out = latlngpt;

            p_out[0] = R * latlngpt[1] * rad;
            p_out[1] = R * Math.log((1 + sin) / (1 - sin)) / 2;
            return p_out
        };
    },

    // This scales distances between points to a given zoom level
    Transformation: function(zoom) {
        const S = 0.5 / (Math.PI * this.EARTH_RADIUS),
              A = S, B = 0.5, C = -S, D = 0.5,
              scale = 2 ** (8 + zoom);   
        
        return function(p_in){
            const p_out = p_in;
            p_out[0] = scale * (A * p_in[0] + B);
            p_out[1] = scale * (C * p_in[1] + D);
            return p_out
        };
    },

    makePT(zoom) {
        const P = this.Projection(),
              T = this.Transformation(zoom);
        return function(llpt){ return T(P(llpt)) };
    }
};
