
/**
 * Based off of [the offical Google document](https://developers.google.com/maps/documentation/utilities/polylinealgorithm)
 *
 * Some parts from [this implementation](http://facstaff.unca.edu/mcmcclur/GoogleMaps/EncodePolyline/PolylineEncoder.js)
 * by [Mark McClure](http://facstaff.unca.edu/mcmcclur/)
 *
 * modified by Efrem Rensi
 * 
 */

Polyline = {
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
    }
};

StreamRLE = {
    // decode a (possibly RLE-encoded) array of successive differences into
    //  an array of the original values
    //  This will decode both [1, 2,2,2,2,2,2, 5] and [1, [2,6], 5] into
    //    [0, 1, 3, 5, 7, 9, 11, 13, 18]
    decoder: function*(rle_list, first_value=0) {
        let running_sum = first_value,
            len = rle_list.length;
        for (let i=0; i<len; i++) {
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

    transCode2Buf: function(rle_list) {
        let len = rle_list.length,
            buf = new Int16Array(len);

        for (let i=0, j=0; i<len; i++) {
            el = rle_list[i];

            if (el instanceof Array) {
                buf[j++] = -el[1];
                buf[j++] = el[0];
            } else
                buf[j++] = el;
        }

        return buf;
    },

    decodeBuf: function*(buf, first_value=0) {
        let running_sum = first_value,
            len = buf.length;

        for (let i=0; i<len; i++) {
            el = buf[i];
            if (el < 0) {
                repeated = buf[++i];
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
