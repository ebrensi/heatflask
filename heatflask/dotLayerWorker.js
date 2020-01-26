
/*


*/

let myItems = {};
let name;


window.onmessage = function(event) {
    let msg = event.data;
    const project = CRS.makePT(0);

    if ("addItems" in msg) {
        const newItems = msg.addItems;
        Object.assign(myItems, newItems);

        for (const A of Object[newItems].values()) {
            
        }
    }

    if ("removeItems" in msg) {
        for (const id in msg.removeItems){
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
    const P = Simplifier.simplify(
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
