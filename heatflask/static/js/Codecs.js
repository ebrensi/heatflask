
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

        return coordinates;
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
        const buf = new Float32Array(2*n);
            decoder = this.decode(str, precision);
        
        let i = 0;
        for (let latLng of decoder) {
            buf.set(latLng, i++ << 1);
        }
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

    transcode2CompressedBuf: function(rle_list) {
        let len = rle_list.length,
            buf = new Int16Array(len);

        for (let i=0, j=0, el; i<len; i++) {
            el = rle_list[i];

            if (el instanceof Array) {
                buf[j++] = -el[1];
                buf[j++] = el[0];
            } else
                buf[j++] = el;
        }

        return VByte.compressSigned(buf);
    },

    decodeBuf: function*(buf, first_value=0) {
        let running_sum = first_value,
            len = buf.length;

        for (let i=0, el; i<len; i++) {
            el = buf[i];
            if (el < 0) {
                const repeated = buf[++i];
                for (let j=0; j<-el; j++) {
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
        const bufGen = VByte.uncompressSigned(cbuf);

        let running_sum = first_value;

        for (const el of bufGen) {
            if (el < 0) {
                const repeated = bufGen.next().value;

                for (let j=0; j<-el; j++) {
                    running_sum += repeated;
                    yield running_sum;
                }
            } else {
                running_sum += el;
                yield running_sum;
            }
        }
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

    // private function
    _zigzag_encode: function(val) {
      return (val + val) ^ (val >> 31);;
    },

    // private function
    _zigzag_decode: function(val) {
      return  (val >> 1) ^ (- (val & 1));
    },

    // compute how many bytes an array of integers would use once compressed
    // input is expected to be an array of integers, some of them can be negative
    computeCompressedSizeInBytesSigned: function(input) {
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
}