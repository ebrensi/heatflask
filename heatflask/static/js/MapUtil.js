

const Simplifier = {
    /* 
        Adapted from V. Agafonkin's simplify.js implementation of
        Douglas-Peucker simplification algorithm
    */

    // points is a function p(i) that directly accesses the i-th point
    // of our data set. 
    simplify: function(points, n, tolerance) {
        const sqTolerance = tolerance * tolerance;
        
        let idxBitSet = this.simplifyRadialDist(points, n, sqTolerance);
        
        const idx = idxBitSet.array(Uint16Array),
              subset = i => points(idx[i]),
        
              idxBitSubset = this.simplifyDouglasPeucker(
                subset, idx.length, sqTolerance
              );
        
        idxBitSet = idxBitSet.new_subset(idxBitSubset);

        return idxBitSet
    },

    // basic distance-based simplification
    simplifyRadialDist: function(points, n, sqTolerance) {
        const selectedIdx = new BitSet();

        // let prevPoint = pointsIterator.next().value;
        let prevPoint = points(0),
            point, i;
        selectedIdx.add(0);

        for (i=1; i<n; i++) {
            point = points(i); 
            if (this.getSqDist(point, prevPoint) > sqTolerance) {
                selectedIdx.add(i++);
                prevPoint = point;
            }
        }
        
        if (!this.equal(point, prevPoint))
            selectedIdx.add(i++)

        return selectedIdx;
    },

    // simplification using Ramer-Douglas-Peucker algorithm
    simplifyDouglasPeucker: function(points, n, sqTolerance) {
        let bitSet = new BitSet();

        bitSet.add(0);
        bitSet.add(n-1);

        this.simplifyDPStep(points, 0, n-1, sqTolerance, bitSet);

        return bitSet
    },

    simplifyDPStep: function(points, first, last, sqTolerance, bitSet) {
        let maxSqDist = sqTolerance,
            index;

        for (let idx = first + 1; idx < last; idx++) {
            const sqDist = this.getSqSegDist(
                points(idx),
                points(first),
                points(last)
            );

            if (sqDist > maxSqDist) {
                index = idx;
                maxSqDist = sqDist;
            }
        }

        if (maxSqDist > sqTolerance) {
            if (index - first > 1)
                this.simplifyDPStep(points, first, index, sqTolerance, bitSet);
            
            bitSet.add(index);
            
            if (last - index > 1) 
                this.simplifyDPStep(points, index, last, sqTolerance, bitSet);
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

        return latlngpt => {
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
        
        return (p_in)  => {
            const p_out = p_in;
            p_out[0] = scale * (A * p_in[0] + B);
            p_out[1] = scale * (C * p_in[1] + D);
            return p_out
        };
    },

    makePT(zoom) {
        const P = this.Projection(),
              T = this.Transformation(zoom);
        return llpt => T(P(llpt));
    }
};
