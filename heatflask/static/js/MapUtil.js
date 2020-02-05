

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
