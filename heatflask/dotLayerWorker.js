
/*

 For projectio job, this worker expects an object
 {
    project: {batch id},
    id: {activity id},
    zoom: {map zoom level},
    smoothFactor: {for simplify},
    hq: {high quality switch for simplify},
    llt: {latlngtime Float32Array}
 } 


*/
let name, myItems = {};

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
        const ids_to_project = msg.project;

        let projected = {}, transferables = [];

        for (const id of ids_to_project) {
            if (id in myItems) {
                let A = myItems[id],
                    zoom = msg.zoom;

                if (!A.projected)
                    A.projected = {}

                if (!A.projected[zoom])
                    A.projected[zoom] = project(A.llt, zoom, msg.smoothFactor, msg.hq);

                const P = A.projected[zoom];

                projected[id] = P;
                // transferables.push(P.P.buffer);
                // transferables.push(P.dP.buffer);
            }
        } 

        msg.name = name;
        msg.project = Object.keys(projected);
        msg.projected = projected;

        postMessage(msg);
        // console.log(`${name} projected`, msg);
   
    } else if ("hello" in msg){  
        name = msg["hello"];
        console.log(`${name} started`)
    }
};



function project(llt, zoom, smoothFactor, ttol=60) {
    // console.time("simplify-project");
    P = Simplifier.simplify(
        llt,
        smoothFactor,
        transform=(latLngPoint) => CRS.project(latLngPoint, zoom)
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
    // rest of the code doesn't care about point format

    // basic distance-based simplification with transform
    simplifyRadialDist: function(pointsBuf, sqTolerance) {
        const T = this.transform,
              P = pointsBuf,
              size = pointsBuf.length;

        let newPoints = new Float32Array(pointsBuf.length),
            tP = T( P.subarray(0,2) );

        newPoints.set([tP[0], tP[1], P[2]], 0);
        let prevPoint = newPoints.subarray(0,2),
            point = newPoints.subarray(3, 5),
            j = 3; 

        for (let i=3; i < size; i+=3) {
            let i2 = i+2,
                tP = T( P.subarray(i, i+2) );
            newPoints.set([tP[0], tP[1], P[i+2]], j);
            
            if (this.getSqDist(point, prevPoint) > sqTolerance) {
                prevPoint = point;
                j += 3;
                point = newPoints.subarray(j, j+2);
            }
        }

        if (point[0] != 0 || point[1] != 0)
            j += 3;

        console.log(`reduction ${j / pointsBuf.length}`);
        return newPoints.slice(0,j);
    },

    simplifyDPStep: function(points, first, last, sqTolerance, bitArray) {
        let maxSqDist = sqTolerance,
            index;

        for (let idx = first + 1; idx < last; idx++) {
            const fi = 3*first,
                i = 3*idx,
                li = 3*last,
                pf = points.subarray(fi, fi+2),
                pi = points.subarray(i, i+2),
                pl = points.subarray(li, li+2),
                sqDist = this.getSqSegDist(pi, pf, pl);

            if (sqDist > maxSqDist) {
                index = idx;
                maxSqDist = sqDist;
            }
        }

        if (maxSqDist > sqTolerance) {
            if (index - first > 1)
                this.simplifyDPStep(points, first, index, sqTolerance, bitArray);
            
            bitArray.set(index, true);
            
            if (last - index > 1) 
                this.simplifyDPStep(points, index, last, sqTolerance, bitArray);
        }
    },

    // simplification using Ramer-Douglas-Peucker algorithm
    simplifyDouglasPeucker: function(points, sqTolerance) {
        const n = points.length/3;

        let bitArray = new FastBitArray(n);

        bitArray.set(0, true);
        bitArray.set(n-1, true);

        this.simplifyDPStep(points, 0, n-1, sqTolerance, bitArray);

        const newPoints = new Float32Array(3*bitArray.count());
        
        let j = 0;
        bitArray.forEach(idx => {
            const i = 3 * idx,
                  point = points.subarray(i, i+3);
            newPoints.set(point, j);
            j += 3;
        });

        return newPoints
    },

    simplify: function(points, tolerance, transform=null) {

        const sqTolerance = tolerance * tolerance;
        this.transform = transform || this.transform;

        // console.time("RDsimp");
        points = this.simplifyRadialDist(points, sqTolerance);
        // console.timeEnd("RDsimp");
        // console.log(`n = ${points.length}`)
        // console.time("DPsimp")
        points = this.simplifyDouglasPeucker(points, sqTolerance);
        // console.timeEnd("DPsimp");

        return points;
    },

    transform: function(point) {
        return point;
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
    T: null,

    makeTransformation: function() {
        const S = 0.5 / (Math.PI * this.EARTH_RADIUS),
              T = {A: S, B: 0.5, C: -S, D: 0.5};
        this.T = T;
        return T;
    },
 
    project: function(latlngpt, zoom) {
        const max = this.MAX_LATITUDE,
            R = this.EARTH_RADIUS,
            rad = this.RAD,
            lat = Math.max(Math.min(max, latlngpt[0]), -max),
            sin = Math.sin(lat * rad),
            scale = 256 * Math.pow(2, zoom);
        
        let x = R * latlngpt[1] * rad,
            y = R * Math.log((1 + sin) / (1 - sin)) / 2;

        // Transformation
        T = this.T || this.makeTransformation();
        x = scale * (T.A * x + T.B);
        y = scale * (T.C * y + T.D);
        return [x,y]
    }
};
