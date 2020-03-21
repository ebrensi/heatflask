
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


