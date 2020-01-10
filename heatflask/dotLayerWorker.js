
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
        debugger;
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

function _forEach(llt, func) {
    for (const idx=0, len=llt.length/3; idx < len; idx++) {
        const i = 3*idx,
              p = llt.subarray(i, i+2);
        func(p);
    }
} 


function project(llt, zoom, smoothFactor, hq=false, ttol=60) {
    // console.time("simplify-project");
    P = Simplifier.simplify(
        llt,
        smoothFactor,
        hq=hq,
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
              numPoints = pointsBuf.length / 3;

        let newPoints = new Array(),
            tP = T( [P[0], P[1]] ),
            prevPoint = [tP[0], tP[1], P[2]],
            point, j=1;

        newPoints.push(prevPoint);

        for (let idx=1; idx < numPoints; idx++) {
            let i = 3*idx;
            tP = T( [P[i], P[i+1]] );
            point = [tP[0], tP[1], P[i+2]];

            if (this.getSqDist(point, prevPoint) > sqTolerance) {
                newPoints.push(point);
                prevPoint = point;
            }
        }

        if (prevPoint !== point) newPoints.push(point);

        return newPoints;
    },

    simplifyDPStep: function(points, first, last, sqTolerance, simplified) {
        let maxSqDist = sqTolerance,
            index;

        for (let i = first + 1; i < last; i++) {
            const sqDist = this.getSqSegDist(points[i], points[first], points[last]);

            if (sqDist > maxSqDist) {
                index = i;
                maxSqDist = sqDist;
            }
        }

        if (maxSqDist > sqTolerance) {
            if (index - first > 1)
                this.simplifyDPStep(points, first, index, sqTolerance, simplified);
            
            simplified.push(points[index]);
            
            if (last - index > 1) 
                this.simplifyDPStep(points, index, last, sqTolerance, simplified);
        }
    },

    // simplification using Ramer-Douglas-Peucker algorithm
    simplifyDouglasPeucker: function(points, sqTolerance) {
        const last = points.length - 1;

        let simplified = [points[0]];
        this.simplifyDPStep(points, 0, last, sqTolerance, simplified);
        simplified.push(points[last]);

        return simplified;
    },

    simplify: function(points, tolerance, hq=false, transform=null) {

        const sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1;
        this.transform = transform || this.transform;

        // console.time("RDsimp");
        points = hq ? points : this.simplifyRadialDist(points, sqTolerance);
        // console.timeEnd("RDsimp");
        // console.log(`n = ${points.length}`)
        // console.time("DPsimp")
        points = this.simplifyDouglasPeucker(points, sqTolerance);
        // console.timeEnd("DPsimp");

        // now points is an Array of points, so we put it
        // into a Float32Array buffer
        const numPoints = points.length;

        let P = new Float32Array(numPoints * 3);
        for (let idx=0; idx<numPoints; idx++) {
            let point = points[idx],
                i = 3 * idx;
            P[i] = point[0];
            P[i+1] = point[1];
            P[i+2] = point[2];
        }

        return P;
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
