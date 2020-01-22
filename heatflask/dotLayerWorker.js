
/*


*/

let myItems = {};
let name;


onmessage = function(event) {
    let msg = event.data;

    if ("addItems" in msg) {
        const newItems = msg.addItems;
        Object.assign(myItems, newItems);
    }

    if ("removeItems" in msg) {
        for (id in msg.removeItems){
            if (id in myItems)
                delete myItems[id];
        }
    } 

    if ("project" in msg) {
        const ids_to_project = msg.project,
              zoom = msg.zoom;

        const projectPoint = CRS.makePT(zoom),
              sf = msg.smoothFactor,
              TS = streamData => this.transformSimplify(streamData, sf, projectPoint),
              projected = {},
              transferables = [];

        for (const id of ids_to_project) {
            if (!(id in myItems))
                continue

            const A = myItems[id],
                  P = TS(A.data);

            // mask the indices of any bad segments
            // if ( !("badSegTimes" in A) )
            //     A.badSegTimes = badSegTimes(A.data, msg.ttol);

            // let bst = A.badSegTimes;
            
            // if (bst && bst.length) {
            //     let time = i => A.llt[3*i+2],
            //         start = 0,
            //         end = A.llt.length / 3;
                    
            //     P.bad = [];
            //     for (const t of bst) {
            //         const i = binarySearch(time, t, start, end);
            //         if (i) P.bad.push(i);
            //         start = i;
            //    } 
            // }

            // Send results back to main thread
            projected[id] = P;
            transferables.push(P.P.buffer);
            transferables.push(P.dP.buffer);

            msg.name = self.name;
            msg.project = Object.keys(projected);
            msg.projected = projected;
        }
        
        if (msg.project.length)
            postMessage(msg, transferables);

    } else if ("hello" in msg){  
        self.name = msg.hello;
        // console.log(`${self.name} started`);
        postMessage(msg);
    }
};

function badSegTimes(llt, ttol) {
    const n = llt.length / 3,
          time = i => llt[3*i+2],
          arr = [];
    
    let max = 0;

    for (let i=1, tprev=time(0); i<n; i++) {
        let t = time(i),
            dt = t - tprev;
        
        if (dt > ttol)
            arr.push(tprev);
        
        if (dt > max)
            max = dt;

        tprev = t;
    }
    arr.sort((a,b) => a-b);
    return arr.length? arr : null
}

function binarySearch(map, x, start, end) {        
    if (start > end) return false; 
   
    let mid = Math.floor((start + end) / 2); 

    if (map(mid) === x) return mid; 
          
    if(map(mid) > x)  
        return binarySearch(map, x, start, mid-1); 
    else
        return binarySearch(map, x, mid+1, end); 
} 

function transformSimplify(streamData, smoothFactor, transform=null) {

    // console.time("simplify-project");
    P = Simplifier.simplify(
        streamData,
        smoothFactor,
        transform
    );
    // console.timeEnd("simplify-project");
    // console.log(`n = ${P.length/3}`);

    // Compute speed for each valid segment
    // A segment is valid if it doesn't have too large time gap
    // console.time("deriv");
    const numPoints = P.length/3,
          numSegs = numPoints - 1;
    let dP = new Float32Array(numSegs * 2);

    for ( let idx = 0; idx < numSegs; idx++ ) {
        let i = 3 * idx,
            j = 2 * idx,
            dt = P[i+5] - P[i+2];

        dP[j] = (P[i+3] - P[i]) / dt;
        dP[j+1] = (P[i+4] - P[i+1]) / dt;
    }
    // console.timeEnd("deriv");

    return {P: P, dP: dP}
};

Simplifier = {
    /* 
        Adapted from V. Agafonkin's simplify.js implementation of
        Douglas-Peucker simplification algorithm
    */

    simplify: function(points, tolerance, transform=null) {

        const sqTolerance = tolerance * tolerance;
        this.transform = transform || p => p;

        // console.time("RDsimp");
        [pointsBuf, n] = this.simplifyRadialDist(points, sqTolerance);
        // console.timeEnd("RDsimp");
        // console.log(`n = ${points.length}`)
        // console.time("DPsimp")
        points = this.simplifyDouglasPeucker(pointsBuf, n, sqTolerance);
        // console.timeEnd("DPsimp");

        return points;
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
    },

    // basic distance-based simplification
    //  where input is a generator. n is the
    //  estimated size (in points) of the output
    simplifyRadialDist: function(pointsGen, n, sqTolerance) {
        let j;
        const selectedIdx = new BitSet(),
              newPoints = new Float32Array(2*n),
              points = i => newPoints.subarray(j=2*i, j+2);

        let firstPoint = pointsGen.next().value;
        newPoints.set(firstPoint);
        selectedIdx.add(0);

        let prevPoint = points(0),
            i = 1; 

        for (p of pointsGen) {
            let point = points(i);
            point.set(p);
            
            if (this.getSqDist(point, prevPoint) > sqTolerance) {
                selectedIdx.add(i++);
                prevPoint = point;
            }
        }
        
        if (point[0] != prevPoint[0] || point[1] != prevPoint[1])
            selectedIdx.add(i++)

        return {mask: selectedIdx, points: newPoints, count: i};
    },

     // simplification using Ramer-Douglas-Peucker algorithm
    simplifyDouglasPeucker: function(points, n, sqTolerance) {
        let bitSet = new BitSet(), z;

        bitSet.add(0);
        bitSet.add(n-1);

        this.simplifyDPStep(points, 0, n-1, sqTolerance, bitSet);

        const newPoints = new Float32Array(2*bitSet.size()),
              point = i => points.subarray(z=2*i, z+2);
        
        let j = 0;
        bitSet.forEach(i => {
            newPoints.set(point(i), j);
            j += 2;
        });

        return newPoints
    },

    simplifyDPStep: function(points, first, last, sqTolerance, bitSet) {
        let maxSqDist = sqTolerance,
            point = i => points.subarray(j=3*i, j+2),
            index;

        for (let idx = first + 1; idx < last; idx++) {
            const sqDist = this.getSqSegDist(
                point(idx),
                point(first),
                point(last)
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
    }
};

CRS = {
    // This is a streamlined version of Leaflet's EPSG:3857 crs,
    // which can run independently of Leaflet.js (i.e. in a worker thread)
    //  latlngpt is a a 2d-array [lat,lng] rather than a latlng object
    code: 'EPSG:3857',
    MAX_LATITUDE: 85.0511287798,
    EARTH_RADIUS: 6378137,
    RAD: Math.PI / 180,

    // This projects LatLng coordinates onto a rectangular grid 
    Projection: function() {
        const max = this.MAX_LATITUDE,
              R = this.EARTH_RADIUS,
              rad = this.RAD,
              p_out = new Float32Array(2);

        return latlngpt => {
            const lat = Math.max(Math.min(max, latlngpt[0]), -max),
                  sin = Math.sin(lat * rad);
            p_out[0] = R * latlngpt[1] * rad;
            p_out[1] = R * Math.log((1 + sin) / (1 - sin)) / 2;
            return p_out
        };
    },

    // This scales distances between points to a given zoom level
    Transformation: function(zoom) {
        const S = 0.5 / (Math.PI * this.EARTH_RADIUS),
              A = S, B = 0.5, C = -S, D = 0.5,
              scale = 1 << (8 + zoom),
              p_out = new Float32Array(2);    
        
        return (p_in)  => {
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
