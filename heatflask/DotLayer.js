/*
  DotLayer Efrem Rensi, 2020,
  inspired by L.CanvasLayer by Stanislav Sumbera,  2016 , sumbera.com
  license MIT
*/
'use strict';

/*  Note the consistent use of string literals for object
 *  properties.  We do this for external objects so that
 *  Closure-compiler won't change the names.
 */

const Leaflet = window["L"];

Leaflet["DotLayer"] = Leaflet["Layer"]["extend"]( {

    _pane: "shadowPane",
    two_pi: 2 * Math.PI,
    target_fps: 25,
    _tThresh: 100000000.0,
    C1: 1000000.0,
    C2: 200.0,
    dotScale: 1.0,

    "options": {
        "debug": true,
        "numWorkers": 0,
        "startPaused": false,
        "showPaths": true,
        "normal": {
            "dotColor": "#000000",
            "dotOpacity": 0.8,

            "pathColor": "#000000",
            "pathOpacity": 0.7,
            "pathWidth": 1,
        },

        "selected": {
            "dotColor": "#FFFFFF",
            "dotOpacity": 0.9,
            "dotStrokeColor": "#FFFFFF",
            "dotStrokeWidth": 0.5,

            "pathColor": "#000000",
            "pathOpacity": 0.8,
            "pathWidth": 1,
        },

        "dotShadows": {
            "enabled": true,
            "x": 0, "y": 5,
            "blur": 5,
            "color": "#000000"
        }
    },

    ViewBox: {

        initialize: function(map, canvases, fps_display) {
            this.map = map;
            this.canvases = canvases;
            this.fps_display = fps_display;
            this.latLng2px = CRS.makePT(0);
            this.itemIds = new BitSet();
            this.update();

            return this
        },

        getMapSize: function() {
            return this.map["getSize"]();
        },

        tol: function(zoom) {
            return zoom? 1/(2**zoom) : 1 / this._zf 
        },

        update: function(reset) {
            const m = this.map,
                  zoom = m["getZoom"](),
                  latLngMapBounds = m["getBounds"]();
            
            // some stuff that needs to be done on zoom change
            if (reset || zoom != this.zoom) {
                this.reset(zoom);
                reset = true;
            }

            const topLeft = m["containerPointToLayerPoint"]( [ 0, 0 ] ),
                   setPosition = Leaflet["DomUtil"]["setPosition"],
                    pxOrigin = m["getPixelOrigin"](),
                    mapPanePos = m["_getMapPanePos"]();

            for (let i=0, len=this.canvases.length; i<len; i++)
                setPosition( this.canvases[i], topLeft );

            this.pxOffset = mapPanePos["subtract"](pxOrigin);
            this.pxBounds = this.latLng2pxBounds(latLngMapBounds);

            // debugger;

            return reset;
        },

        reset: function(zoom) {

            this.size = this.getMapSize();
            this.zoom = zoom;
            this._zf = 2 ** zoom;

        },

        px2Container: function(px) {
            const offset = this.pxOffset,
                  zf = this._zf;

            let x = px[0], y = px[1];
            x = zf*x + offset.x;
            y = zf*y + offset.y;

            return [x,y]; 
        },

        latLng2pxBounds: function(llBounds, pxObj) {
            if (!pxObj)
                pxObj = new Float32Array(4);

            const sw = llBounds["_southWest"],
                  ne = llBounds["_northEast"];
            
            pxObj[0] = sw.lat;  // xmin
            pxObj[1] = sw.lng;  // ymax
            pxObj[2] = ne.lat;  // xmax
            pxObj[3] = ne.lng;  // ymin
            this.latLng2px(pxObj.subarray(0,2));
            this.latLng2px(pxObj.subarray(2,4));
            return pxObj
        },

        overlaps: function(activityBounds) {
            const mb = this.pxBounds,
                  ab = activityBounds,
                  xOverlaps = (ab[2] > mb[0]) && (ab[0] < mb[2]),
                  yOverlaps = (ab[3] < mb[1]) && (ab[1] > mb[3]);
            return xOverlaps && yOverlaps;
        },

        contains: function (point) {
            const mb = this.pxBounds,
                  x = point[0],
                  y = point[1],
                  xmin = mb[0], xmax = mb[2], 
                  ymin = mb[3], ymax = mb[1];

            return (xmin <= x) && (x <= xmax) &&
                   (ymin <= y) && (y <= ymax);
        },

        drawPxBounds: function(ctx, pxBounds) {
            const b = pxBounds || this.pxBounds,
                  xmin = b[0], xmax = b[2], 
                  ymin = b[3], ymax = b[1],

                  ul = this.px2Container([xmin, ymin]),
                  lr = this.px2Container([xmax, ymax]),
                  x = ul[0] + 5,
                  y = ul[1] + 5,
                  w = (lr[0] - ul[0]) - 10,
                  h = (lr[1] - ul[1]) - 10,
                  rect = {x: x, y:y, w:w, h:h};

            ctx.strokeRect(x, y, w, h);
            return rect
        },
    },

    /* DrawBox represents the rectangular region that bounds
     *   all of our drawing on the canvas. We use it primarily
     *   to minimize how much we need to clear between frames
     *   of the animation. 
     */  
    DrawBox: {
        _pad: 25,

        initialize: function(ViewBox) {
            this.ViewBox = ViewBox;
            this.reset();
        },

        reset: function() {
            this._dim = undefined;
            return this
        },

        update: function(point) {
            const x = point[0],
                  y = point[1],
                  d = this._dim || {};
            if (!d.xmin || (x < d.xmin)) d.xmin = x;
            if (!d.xmax || (x > d.xmax)) d.xmax = x;
            if (!d.ymin || (y < d.ymin)) d.ymin = y;
            if (!d.ymax || (y > d.ymax)) d.ymax = y;

            return this._dim = d;
        },

        defaultRect: function() {
            const mapSize = this.ViewBox.getMapSize();
            return {x:0, y:0, w: mapSize.x, h: mapSize.y}
        },

        rect: function(pad) {
            pad = pad || this._pad;
            const d = this._dim;
            if (!d) return this.defaultRect();
            const c = this.ViewBox,
                  mapSize = c.size,
                  min = c.px2Container([d.xmin, d.ymin]),
                  max = c.px2Container([d.xmax, d.ymax]),
                  xmin = ~~Math.max(min[0] - pad, 0),
                  xmax = ~~Math.min(max[0] + pad, mapSize.x),
                  ymin = ~~Math.max(min[1] - pad, 0),
                  ymax = ~~Math.min(max[1] + pad, mapSize.y);

            return {
                x: xmin, y: ymin, 
                w: xmax - xmin,
                h: ymax - ymin
            }
        },

        draw: function(ctx, rect) {
            const r = rect || this.rect();
            if (!r) return;
            ctx.strokeRect( r.x, r.y, r.w, r.h );
            return this
        },

        clear: function(ctx, rect) {
            const r = rect || this.rect();
            if (!r) return
            ctx.clearRect( r.x, r.y, r.w, r.h );
            return this
        }
    },

    // -- initialized is called on prototype
    "initialize": function( items, options ) {
        this._timeOffset = 0;
        Leaflet["setOptions"]( this, options );
        this._paused = this["options"]["startPaused"];
        this._timePaused = this.UTCnowSecs();

        this.heatflask_icon = new Image();
        this.heatflask_icon.src = "static/logo.png";

        this.strava_icon = new Image();
        this.strava_icon.src = "static/pbs4.png";

        this._toProject = new BitSet();
        this._items = new Map();

    //     if (this["options"]["numWorkers"] == 0)
    //         return

    //     let default_n = window.navigator.hardwareConcurrency;
    //     if (window.Worker) {
    //         const n = this["options"]["numWorkers"] || default_n;
    //         if (n) {
    //             this._workers = [];
    //             for (let i=0; i<n; i++) {
    //                 const worker = new Worker(window["DOTLAYER_WORKER_URL"]);
    //                 worker.onmessage = this._handleWorkerMessage.bind(this);
    //                 this._workers.push(worker);
    //                 worker.postMessage({
    //                     hello: `worker_${i}`,
    //                     ts: performance.now()}
    //                  );
    //             }
    //         }
    //     } else {
    //         console.log("This browser apparently doesn\'t support web workers");
    //     }
    },

    UTCnowSecs: function() {
        return performance.timing.navigationStart + performance.now();
    },

    //-------------------------------------------------------------
    "onAdd": function( map ) {
        this._map = map;
        let size = map["getSize"](),
            zoomAnimated = map["options"]["zoomAnimation"] && Leaflet["Browser"]["any3d"];

        const create = Leaflet["DomUtil"]["create"],
              addClass = Leaflet["DomUtil"]["addClass"],
              panes = map["_panes"],
              appendChild = pane => obj => panes[pane]["appendChild"](obj),
              canvases = [];

        // dotlayer canvas
        this._dotCanvas = create( "canvas", "leaflet-layer" );
        this._dotCanvas["width"] = size["x"];
        this._dotCanvas["height"] = size["y"];
        this._dotCtx = this._dotCanvas["getContext"]( "2d" );
        addClass( this._dotCanvas, "leaflet-zoom-" + ( zoomAnimated ? "animated" : "hide" ) );
        panes[this._pane]["style"]["pointerEvents"] = "none";
        appendChild(this._pane)( this._dotCanvas );
        canvases.push(this._dotCanvas);

        // create Canvas for polyline-ish things
        this._lineCanvas = create( "canvas", "leaflet-layer" );
        this._lineCanvas["width"] = size["x"];
        this._lineCanvas["height"] = size["y"];
        this._lineCtx = this._lineCanvas["getContext"]( "2d" );
        this._lineCtx["lineCap"] = "round";
        this._lineCtx["lineJoin"] = "round";
        addClass( this._lineCanvas, "leaflet-zoom-" + ( zoomAnimated ? "animated" : "hide" ) );
        appendChild("overlayPane")( this._lineCanvas );
        canvases.push(this._lineCanvas);

        if (this["options"]["debug"]) {
            // create Canvas for debugging canvas stuff
            this._debugCanvas = create( "canvas", "leaflet-layer" );
            this._debugCanvas["width"] = size["x"];
            this._debugCanvas["height"] = size["y"];
            this._debugCtx = this._debugCanvas["getContext"]( "2d" );
            addClass( this._debugCanvas, "leaflet-zoom-" + ( zoomAnimated ? "animated" : "hide" ) );
            appendChild("overlayPane")( this._debugCanvas );
            canvases.push(this._debugCanvas);
        }

        this.ViewBox.initialize(map, canvases, this.fps_display);
        this.DrawBox.initialize(this.ViewBox);

        map["on"]( this.getEvents(), this );
    },

    getEvents: function() {
        const loggit = (e) => console.log(e);

        const events = {
            // movestart: loggit,
            move: this.onMove,
            moveend: this._redraw,
            // zoomstart: loggit,
            // zoom: loggit,
            // zoomend: loggit,
            // viewreset: loggit,
            resize: this._onLayerResize
        };

        if ( this._map["options"]["zoomAnimation"] && Leaflet["Browser"]["any3d"] ) {
            events["zoomanim"] =  this._animateZoom;
        }

        return events;
    },

    "addTo": function( map ) {
        map["addLayer"]( this );
        return this;
    },

    //-------------------------------------------------------------
    "onRemove": function( map ) {
        map["_panes"]["shadowPane"]["removeChild"]( this._dotCanvas )
        this._dotCanvas = null;

        map["_panes"]["overlayPane"]["removeChild"]( this._lineCanvas );
        this._lineCanvas = null;

        if (this["options"]["debug"]) {
            map["_panes"]["overlayPane"]["removeChild"]( this._debugCanvas );
            this._debugCanvas = null;
        }

        map["off"]( this.getEvents(), this );
    },

    // --------------------------------------------------------------------

    // Call this function after items are added or reomved
    reset: function() {
        if (!this._items.size)
            return

        this._ready = false;

        this._itemsArray = Array.from(this._items.values());

        const n = this._itemsArray.length;

        if (n) {

            this.setDotColors();

            // make quick lookup bit-array for each dot color indicating 
            // which items have that color 
            const dotColors = new Set(this._itemsArray.map(A => A.dotColor));
            this._dotColorFilters = {};

            for (const color of dotColors) {
                this._dotColorFilters[color] = BitSet.new_filter(
                    this._itemsArray,
                    A => A.dotColor == color
                );
            }

            // do the same with path colors
            const pathColors = new Set(this._itemsArray.map(A => A.pathColor));
            this._pathColorFilters = {};

            for (const color of pathColors) {
                this._pathColorFilters[color] = BitSet.new_filter(
                    this._itemsArray,
                    A => A.pathColor == color
                );
            }
        }

        this._ready = true;

        this._redraw();

        if (this._paused)
            this.drawDotLayer();
        else
            this.animate();
    },


    //-------------------------------------------------------------
    _onLayerResize: function( resizeEvent ) {
        const newWidth = resizeEvent["newSize"]["x"],
              newHeight = resizeEvent["newSize"]["y"],
              options = this["options"];


        console.log("resizing canvas to", newHeight, newWidth );

        for (const canvas of [this._dotCanvas, this._lineCanvas]){
            canvas["width"] = newWidth;
            canvas["height"] = newHeight;
        }

        if (options["debug"]) {
            this._debugCanvas["width"] = newWidth;
            this._debugCanvas["height"] = newHeight;
            this._debugCtx["strokeStyle"] = "rgb(0,255,0,1)";
            this._debugCtx["lineWidth"] = 5;
            this._debugCtx["setLineDash"]([4, 10]);
        }

        const ctx = this._dotCtx;
                  
        if (options["dotShadows"]["enabled"]) {
            const shadowOpts = options["dotShadows"],
                  sx = ctx["shadowOffsetX"] = ["x"],
                  sy = ctx["shadowOffsetY"] = shadowOpts["y"];
            ctx["shadowBlur"] = shadowOpts["blur"];
            ctx["shadowColor"] = shadowOpts["color"];

        } else {
            ctx["shadowOffsetX"] = 0;
            ctx["shadowOffsetY"] = 0;
            ctx["shadowBlur"] = 0;
        }

        this.ViewBox.update(true);
    },
    //-------------------------------------------------------------

    // -------------------------------------------------------------------
    _debugCtxReset: function() {
        this._debugCtx["strokeStyle"] = "rgb(0,255,0,1)";
        this._debugCtx["lineWidth"] = 10;
        this._debugCtx["setLineDash"]([10, 5]);
    },

    drawSeg: function(P1, P2) {
        const vb = this.ViewBox,
              p1 = vb.px2Container(P1),
              p2 = vb.px2Container(P2);

        this._debugCtx["beginPath"]();
        this._debugCtx["moveTo"](p1[0], p1[1]);
        this._debugCtx["lineTo"](p2[0], p2[1]);
        this._debugCtx["stroke"]();
        return {p1: p1, p2: p2}
    },

    onMove: function om(event) {
        // prevent redrawing more often than necessary
        const ts = performance.now(),
              lr = om.lastRedraw || 0;
        if (ts - lr < 500)
            return;

        om.lastRedraw = ts;
        this._redraw(event);
    },

    _redraw: function(event) {
        if ( !this._ready )
            return;        

        this.ViewBox.update();
        this.DrawBox.reset();

        const itemsArray = this._itemsArray,
              n = itemsArray.length,
              inView = this.ViewBox.itemIds.clear(),
              toProject = this._toProject.clear(),
              zoom = this.ViewBox.zoom;

        for (let i=0; i<n; i++){
            const A = itemsArray[i];
            
            if (!this.inMapBounds(A))
                continue;

            inView.add(i);

            if (!(zoom in A.idxSet)) {    
                // prevent another instance of this function from
                // doing this
                A.idxSet[zoom] = null;
                toProject.add(i);
            }
        }
        
        // nothing to show? let's get out of here.
        if (inView.isEmpty())
            return;

        
        let t0 = performance.now();

        if (!toProject.isEmpty())
            toProject.forEach(i => this.simplify(itemsArray[i], zoom));
       
        let t1 = performance.now();
        
        this.drawPaths();
        
        let t2 = performance.now();

        console.log(`simplify: ${t1-t0}, draw: ${t2-t1}`)

    },

    addItem: function(id, polyline, pathColor, time, UTCtimestamp, llBounds, n) {
        const A = {
                id: parseInt(id),
                bounds: this.ViewBox.latLng2pxBounds(llBounds),
                px: Polyline.decode2Buf(polyline, n),
                idxSet: {},
                time: StreamRLE.transcode2CompressedBuf(time),
                n: n,
                ts: UTCtimestamp,
                pathColor: pathColor

            };
        
        this._items.set(id, A);

        // make baseline projection (convert latLngs to pixel points)
        // in-place
        const px = A.px,
              project = this.ViewBox.latLng2px;

        for (let i=0, len=px.length; i<len; i+=2)
            project(px.subarray(i, i+2));
        
    },

    removeItems: function(ids) {
        // this._postToAllWorkers({removeItems: ids});
        
        for (const id of ids)
            this._items.delete(id)
        
        this.reset()
    },

    // _postToAllWorkers: function(msg) {
    //     msg.ts = performance.now();
    //     for (const worker of this._workers)
    //         worker.postMessage(msg);
    // }, 

    // _postToWorker: function(msg, transferables) {
    //     let w = this._currentWorker || 0,
    //         n = this._workers.length;

    //     this._currentWorker = (w + 1) % n;

    //     this._workers[w].postMessage(msg, transferables);
    //     // console.log(`${msg.ts} ${msg.id} posted to ${w}`);
    // },

    // _handleWorkerMessage: function(event) {
    //     const msg = event.data;
    //     if ("project" in msg) {
    //         const zoom = msg["zoom"],
    //               relevant = zoom == this.ViewBox.zoom;
                        
    //         for (let id in msg["projected"]) {
    //             const A = this._items[id],
    //                   P = A.projected[zoom] = msg.projected[id];

    //             // if (relevant)
    //             //     A.segMask = this.makeSegMask(P.P, P.bad, A.segMask);
    //         }

    //         if (relevant) {
    //             this.drawPaths();
    //             if (this._paused)
    //                 this.drawDotLayer();
    //         }
    //     }
    // },

    _rawPoint: function(A) {
        return j => A.px.subarray(j, j+2);
    },

    // _pointsArray returns an "array" function from which we can directly
    //   access the i-th data point for any given idxSet 
    _pointsArray: function(A, idxSet) {
        let point = this._rawPoint(A),
            arrayFunc;

        if (idxSet) {
            const idx = idxSet.array(); // this is expensive. avoid it.
            arrayFunc = i => point(2*idx[i]);
        }  
        else
            arrayFunc = i => point(2*i);

        return arrayFunc
    },

    pointsArray: function(A, zoom) {
        return this._pointsArray(A, A.idxSet[zoom]);
    },

    _rawPointsGen: function*(A) {
        const pointAt = this._rawPoint(A);

        for ( let j=0, n = A.px.length; j < n; j +=2 )
            yield pointAt(j);
    },

    _pointsGen: function(A, idxSet) {
        if (idxSet)
            return idxSet.imap( this._pointsArray(A, null) );
        else
            return this._rawPointsGen(A);
    },

    pointsGen: function(A, zoom) {
        if (zoom === 0) return this._pointsGen(A);

        if (!zoom)
            zoom = this.ViewBox.zoom;

        return this._pointsGen(A, A.idxSet[zoom]);
    },

    _iterRLEstream: function(RLEstream, idxSet) {
        const stream = StreamRLE.decodeCompressedBuf(RLEstream);
        if (!idxSet)
            return stream;

        let i = 0;
        return idxSet.imap(idx => {
            let s = stream.next();
            while (i++ < idx)
                s = stream.next();
            // console.log(`${i}: ${s.value}`);
            return s.value;
        });

    },

    times: function(A) {
        const zoom = this.ViewBox.zoom,
              stream = this._iterRLEstream(A.time, A.idxSet[zoom]);

        let j = 0,
            second = stream.next();
        return A.segMask.imap(idx => {
            let first = second;
            while (j++ < idx)
                first = stream.next();
            second = stream.next();
            return [first.value, second.value];
        });
    },

    _simplify: function(A, toZoom, fromZoom) {
        const idxSet = A.idxSet[fromZoom],
              nPoints = (fromZoom == undefined)? A.px.length/2 : idxSet.size();

        const subSet = Simplifier.simplify(
            this.pointsArray(A, fromZoom),
            nPoints,
            this.ViewBox.tol(toZoom)
        );

        A.idxSet[toZoom] = (fromZoom == undefined)? subSet : idxSet.new_subset(subSet);
        return A.idxSet[toZoom]
    },

    simplify: function(A, zoom) {
        if (zoom === undefined)
            zoom = this.ViewBox.zoom;

        // simplify from the first available zoom level 
        //  higher than this one if one exists
        // const nextZoomLevel = 20;
        return this._simplify(A, zoom);
    },

    segments: function*(A, zoom, segMask) {
        let points = this.pointsGen(A, zoom);

        // segmask === null means we iterate through all segments at this zoom level,
        // not just the ones in the current view 
        if (segMask === null) {
            let p = points.next().value;

            for (let nextp of points) {
                nextp = nextp.value;
                yield [p, nextp];
                p = nextp;
            }
            return
        }

        // here we assume A has a segmask and use the segmask for the
        // current view-box if one isn't provided
        if (!segMask)
            segMask = A.segMask;
    
        /// **************experimental****************
        // const pointsArray = this._pointsArray(A, null),
        //       idxSet = A.idxSet[this.ViewBox.zoom],
        //       segsIdx = segMask.imap(),
        //       firstSegIdx = segsIdx.next().value,
        //       pointsGen = idxSet.imap_skip( pointsArray, firstSegIdx );

        // for (const nextSegIdx of segsIdx) {
        //     const p1 = pointsGen.next().value,
        //           p2 = pointsGen.next(nextSegIdx).value;
        //     yield [p1, p2]; 
        // }
        //// **************************************

        let j = 0, 
            first = points.next(),
            second;
        for (const i of segMask.imap()) {
            while (j++ < i)
                first = points.next();
            second = points.next();
            yield [first.value, second.value];
            first = second;
        }
    },

    inMapBounds: function(A) {
        return this.ViewBox.overlaps(A.bounds);
    },

    // A segMask is a BitSet containing the index of the start-point of each
    //  segment that is in view and is not bad.  A segment is considered to be 
    //  in view if one of its points is in the current view.
    // A "bad" segment is one that represents a gap in GPS data.
    //  The indices are relative to the current zoom's idxSet mask,
    //  so that the i-th good segment corresponds to the i-th member of
    //  this idxSet.
    makeSegMask: function(A) {
        const drawBox = this.DrawBox,
              viewBox = this.ViewBox,
              points = this.pointsGen(A, viewBox.zoom),
              inBounds = p => viewBox.contains(p) && drawBox.update(p);

        A.segMask = (A.segMask || new BitSet()).clear();

        let p = points.next().value,
            p_In = inBounds(p),
            s = 0;

        for (const nextp of points) {
            const nextp_In = inBounds(nextp);
            if (p_In || nextp_In)
                A.segMask.add(s);
            p_In = nextp_In;
            s++;
        }

        if (A.badSegs)
            for (s of A.badSegs)
                A.segMask.remove(s);
        return A.segMask
    },

    _drawPath: function(ctx, A, lineWidth, strokeStyle, opacity, isolated=false) {
        if (isolated)
            ctx["beginPath"]();

        for (const [px1, px2] of this.segments(A)) {
            const p1 = this.ViewBox.px2Container(px1),
                  p2 = this.ViewBox.px2Container(px2);

            // draw segment
            ctx["moveTo"](p1[0], p1[1]);
            ctx["lineTo"](p2[0], p2[1]);
        }

        if (isolated) {
            ctx["globalAlpha"] = opacity;
            ctx["lineWidth"] = lineWidth;
            ctx["strokeStyle"] = strokeStyle;
            ctx["stroke"]();
            if (this["options"]["debug"])
                this.DrawBox.clear(this._debugCtx).draw(this._debugCtx);
        }
    },

    _drawPaths: function(itemsToDraw) {
        const ctx = this._lineCtx;

        for (const [color, withThisColor] of Object.entries(this._pathColorFilters)) {
            if (!itemsToDraw.intersects(withThisColor))
                continue;

            const toDraw = itemsToDraw.new_intersection(withThisColor);
            ctx["strokeStyle"] = color;
            ctx["beginPath"]();
            toDraw.forEach( i => this._drawPath(ctx, this._itemsArray[i]));
            ctx["stroke"]();
        } 

    },
    
    // Draw all paths for the current items in such a way 
    // that we group stroke-styles together in batch calls.
    drawPaths: function(toDraw, clear=true) {
        toDraw = toDraw || this.ViewBox.itemIds;

        if (!toDraw || toDraw.isEmpty())
            return

        const ctx = this._lineCtx,
              itemsArray = this._itemsArray;

        this.DrawBox.reset();
        toDraw.forEach(i => {
            if ( this.makeSegMask(itemsArray[i]).isEmpty() )
                this.ViewBox.itemIds.remove(i);
        });

        if (clear) {
            const clear = this.DrawBox.clear,
                  rect = this.DrawBox.defaultRect(); 
            clear(this._lineCtx, rect);
            clear(this._debugCtx, rect);
            clear(this._dotCtx, rect);
        }

        if (this._selectedFilter) {
            const selected = toDraw.new_intersection(this._selectedFilter),
                  options = this["options"];

            for (const emph of ["deselected", "selected"]) {
                ctx["lineWidth"] = options[emph]["pathWidth"];
                ctx["globalAlpha"] = options[emph]["pathOpacity"];
                this._drawPaths(selected);
                // to_draw.negate();
            }
        } else
            this._drawPaths(toDraw);
        
        if (this["options"]["debug"]) {
            this._debugCtxReset();
            this.DrawBox.draw(this._debugCtx);
            this._debugCtx["strokeStyle"] = "rgb(255,0,255,1)";
            this.ViewBox.drawPxBounds(this._debugCtx);
        }        
    },

    // --------------------------------------------------------------------
    _drawDots: function( now, A, drawDot ) {      
        const T = this._period,
              times = this.times(A),
              zf = this.ViewBox._zf,
              pxo = this.ViewBox.pxOffset,
              start = A.ts,
              segments = this.segments(A);

        let obj = times.next();

        const first_time = obj.value[0],
              timeOffset = (this._timeScale * ( now - (start + first_time))) % T;
        
        let count = 0;
        while (!obj.done) {
            let [ta, tb] = obj.value,
                jfirst = Math.ceil((ta - timeOffset) / T),
                jlast = Math.floor((tb - timeOffset) / T),
                seg = segments.next();
                       
            if (jfirst <= jlast) {
                const [pa, pb] = seg.value;
                for (let j = jfirst; j <= jlast; j++) {
                    const t = j * T + timeOffset,
                          dt = t - ta;
                    if (dt > 0) {
                        const tab = tb - ta,
                              vx = (pb[0] - pa[0]) / tab,
                              vy = (pb[1] - pa[1]) / tab,
                              x = (pa[0] + vx * dt) * zf + pxo.x,
                              y = (pa[1] + vy * dt) * zf + pxo.y; 

                        drawDot(x,y);
                        count++;
                    }
                }
            }

            obj = times.next();
        }    
        return count
    },

    makeCircleDrawFunc: function() {
        const two_pi = this.two_pi,
              ctx = this._dotCtx,
              dotSize = this._dotSize;

        return (x,y) => ctx["arc"]( x, y, dotSize, 0, two_pi );
    },

    makeSquareDrawFunc: function() {
        const ctx = this._dotCtx,
              dotSize = this._dotSize,
              dotOffset = dotSize / 2.0;

        return (x,y) =>
            ctx["rect"]( x - dotOffset, y - dotOffset, dotSize, dotSize );
    },

    drawDots: function(now) {
        if ( !this._ready || this.ViewBox.itemIds.isEmpty() )
            return;

        const t0 = performance.now();

        if (!now)
            now = this._timePaused || this.UTCnowSecs();
        
        const ctx = this._dotCtx,
              g = this._gifPatch,
              itemsArray = this._itemsArray,
              mask = this.ViewBox.itemIds,
              zf = this.ViewBox._zf,
              zoom = this.ViewBox.zoom,
              inView = this.ViewBox.itemIds;

        this._timeScale = this.C2 / zf;
        this._period = this.C1 / zf;
        this._dotSize = Math.max(1, ~~(this.dotScale * Math.log( zoom ) + 0.5));

        let count = 0,
            drawDotFunc = this.makeSquareDrawFunc();

        this.DrawBox.clear(ctx);

        if (!this.ViewBox.dotData)
            this.ViewBox.dotData = {};

        for (const [color, withThisColor] of Object.entries(this._dotColorFilters)) {
            
            if (!inView.intersects(withThisColor))
                continue;
            
            // TODO: only compute this once on view change
            const toDraw = inView.new_intersection(withThisColor);
            ctx["fillStyle"] = color || this["options"]["normal"]["dotColor"];
            ctx["beginPath"]();

            for (const A of toDraw.imap(i => itemsArray[i]))
                if (A.idxSet[zoom] && A.segMask && !A.segMask.isEmpty())
                    count += this._drawDots(now, A, drawDotFunc);

            ctx["fill"]();
        }
   
        if (this.fps_display) {
            const elapsed = ( performance.now() - t0 ).toFixed( 1 );
            this.fps_display.update( now, `z=${this.ViewBox.zoom}, dt=${elapsed} ms, n=${count}` );
        }
    },

   
    // --------------------------------------------------------------------
    animate: function() {

        this._paused = false;
        if ( this._timePaused ) {
            this._timeOffset = (this.UTCnowSecs() - this._timePaused);
            this._timePaused = null;
        }
        this.lastCalledTime = 0;
        this.minDelay = ~~( 1000 / this.target_fps + 0.5 );
        this._frame = Leaflet["Util"]["requestAnimFrame"]( this._animate, this );
    },

    // --------------------------------------------------------------------
    pause: function() {
        this._paused = true;
    },


    // --------------------------------------------------------------------
    _animate: function() {
        if (!this._frame || !this._ready)
            return;

        this._frame = null;

        let ts = this.UTCnowSecs(),
            now = ts - this._timeOffset;

        if ( this._paused ) {
            // Ths is so we can start where we left off when we resume
            this._timePaused = ts;
            return;
        }


        if (now - this.lastCalledTime > this.minDelay) {
            this.lastCalledTime = now;
            this.drawDots( now );
        }

        this._frame = Leaflet["Util"]["requestAnimFrame"]( this._animate, this );
    },

    //------------------------------------------------------------------------------
    _animateZoom: function( e ) {
        const m = this.ViewBox.map,
              z = e.zoom,
              scale = m["getZoomScale"]( z );

        // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1
        const offset = Leaflet["Layer"] ? m["_latLngToNewLayerPoint"]( m[".getBounds"]()["getNorthWest"](), z, e.center ) :
                               m["_getCenterOffset"]( e.center )["_multiplyBy"]( -scale )["subtract"]( m["_getMapPanePos"]() );

        const setTransform = Leaflet["DomUtil"]["setTransform"];
        setTransform( this._dotCanvas, offset, scale );
        setTransform( this._lineCanvas, offset, scale );
    },


    periodInSecs: function() {
        return this._period / (this._timeScale * 1000);
    },


// -------------------------------------------------------------------
    setSelectRegion: function(pxBounds, callback) {
        let paused = this._paused;
        this.pause();
        let selectedIds = this.getSelected(pxBounds);
        if (paused){
            this.drawDotLayer();
        } else {
            this.animate();
        }
        callback(selectedIds);
    },

    getSelected: function(selectPxBounds) {
        const z = this.ViewBox.zoom,
              pxOffset = this._pxOffset,
              ox = pxOffset.x,
              oy = pxOffset.y;

        let selectedIds = [];

        for (const A of this._itemsArray) {
            if (!A.inViewBox || !A.projected[z])
                continue;

            const P = A.projected[z].P;

            for (let j=0, len=P.length/3; j<len; j++){
                let i = 3 * j,
                    x = P[i]   + ox,
                    y = P[i+1] + oy;

                if ( this._contains(selectPxBounds, [x, y]) ) {
                    selectedIds.push(A.id);
                }
            }
        }

        return selectedIds
    },  


    // -----------------------------------------------------------------------

    captureCycle: function(selection=null, callback=null) {
        let periodInSecs = this.periodInSecs();
        this._mapMoving = true;
        this._capturing = true;

        // set up display
        const pd = document.createElement( 'div' );
        pd.style.position = 'absolute';
        pd.style.left = pd.style.top = 0
        pd.style.backgroundColor = 'black';
        pd.style.fontFamily = 'monospace'
        pd.style.fontSize = '20px'
        pd.style.padding = '5px'
        pd.style.color = 'white';
        pd.style.zIndex = 100000
        document.body.appendChild( pd );
        this._progressDisplay = pd;

        let msg = "capturing static map frame...";
        // console.log(msg);
        pd.textContent = msg;

        window["leafletImage"](this.ViewBox.map, function(err, canvas) {
            //download(canvas.toDataURL("image/png"), "mapViewBox.png", "image/png");
            console.log("leaflet-image: " + err);
            if (canvas) {
                this.captureGIF(selection, canvas, periodInSecs, callback=callback);
            }
        }.bind(this));
    },

    captureGIF: function(selection=null, baseCanvas=null, durationSecs=2, callback=null) {
        this._mapMoving = true;

        let sx, sy, sw, sh;
        if (selection) {
            sx = selection["topLeft"]["x"];
            sy = selection["topLeft"]["y"];
            sw = selection["width"];
            sh = selection["height"];
        } else {
            sx = sy = 0;
            sw = this.ViewBox.size["x"];
            sh = this.ViewBox.size["y"];
        }


        // set up GIF encoder
        let pd = this._progressDisplay,
            frameTime = Date.now(),
            // we use a frame rate of 25 fps beecause that yields a nice
            //  4 1/100-th second delay between frames
            frameRate = 25,
            numFrames = durationSecs * frameRate,
            delay = 1000 / frameRate,

            encoder = new window["GIF"]({
                workers: window.navigator.hardwareConcurrency,
                quality: 8,
                transparent: 'rgba(0,0,0,0)',
                workerScript: window["GIFJS_WORKER_URL"]
            });


        this._encoder = encoder;

        encoder["on"]( 'progress', function( p ) {
            const msg = `Encoding frames...${~~(p*100)}%`;
            // console.log(msg);
            this._progressDisplay["textContent"] = msg;
        }.bind( this ) );

        encoder["on"]('finished', function( blob ) {
            // window.open(URL.createObjectURL(blob));

            if (blob) {
                window["download"](blob, "output.gif", 'image/gif' );
            }

            document.body.removeChild( this._progressDisplay );
            delete this._progressDisplay

            this._mapMoving = false;
            this._capturing = false;
            if (!this._paused) {
                this.animate();
            }
            if (callback) {
                callback();
            }
        }.bind( this ) );


        function canvasSubtract(newCanvas, oldCanvas){
            if (!oldCanvas) {
                return newCanvas;
            }
            let ctxOld = oldCanvas.getContext('2d'),
                dataOld = ctxOld.getImageData(0,0,sw,sh),
                dO = dataOld.data,
                ctxNew = newCanvas.getContext('2d'),
                dataNew = ctxNew.getImageData(0,0,sw,sh),
                dN = dataNew.data,
                len = dO.length;

            if (dN["length"] != len){
                console.log("canvasDiff: canvases are different size");
                return;
            }
            for (let i=0; i<len; i+=4) {
                if (dO[i] == dN[i] &&
                    dO[i+1] == dN[i+1] &&
                    dO[i+2] == dN[i+2]
                    && dO[i+3] == dN[i+3]
                    ) {

                    dO[i] = 0;
                    dO[i+1] = 0;
                    dO[i+2] = 0;
                    dO[i+3] = 0;
                } else {
                    dO[i] = dN[i];
                    dO[i+1] = dN[i+1];
                    dO[i+2] = dN[i+2];
                    // dO[i+3] = dN[i+3];
                    // console.log(dN[i+3]);
                    dO[i+3] = 255;
                }
            }
            ctxOld.putImageData(dataOld,0,0);
            return oldCanvas;
        }

        function display(canvas, title){
            let w = window["open"](canvas["toDataURL"]("image/png"), '_blank');
            // w.document.write(`<title>${title}</title>`);
        }
        // console.log(`GIF output: ${numFrames.toFixed(4)} frames, delay=${delay.toFixed(4)}`);
        let h1 = this.heatflask_icon.height,
            w1 = this.heatflask_icon.width,
            himg = [50, h1*50/w1],
            hd = [2, sh-himg[0]-2, himg[0], himg[1]],
            h2 = this.strava_icon.height,
            w2 = this.strava_icon.width,
            simg = [50, h2*50/w2],
            sd = [sw-simg[0]-2, sh-simg[1]-2, simg[0], simg[1]];
            
        let framePrev = null;
        // Add frames to the encoder
        for (let i=0, num=~~numFrames; i<num; i++, frameTime+=delay){
            let msg = `Rendering frames...${~~(i/num * 100)}%`;

            // let timeOffset = (this._timeScale * frameTime) % this._period;
            // console.log( `frame${i} @ ${timeOffset}`);

            pd["textContent"] = msg;

            // create a new canvas
            const frame = document.createElement('canvas');
            frame.width = sw;
            frame.height = sh;

            const frameCtx = frame.getContext('2d');

            // clear the frame
            frameCtx.clearRect( 0, 0, sw, sh);

            // lay the baselayer down
            baseCanvas && frameCtx.drawImage( baseCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

            // render this set of dots
            this.drawDotLayer(frameTime);

            // draw dots onto frame
            frameCtx.drawImage(this._dotCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

            // Put Heatflask and Strava attribution images on the frame
            let ga = frameCtx.globalAlpha
            frameCtx.globalAlpha = 0.3
            frameCtx.drawImage(this.heatflask_icon, hd[0], hd[1], hd[2], hd[3]);
            frameCtx.drawImage(this.strava_icon, sd[0], sd[1], sd[2], sd[3]);
            frameCtx.globalAlpha = ga

            let gifFrame = canvasSubtract(frame, framePrev);
            // display(gifFrame, `frame_${i}`);

            let thisDelay = (i == num-1)? ~~(delay/2) : delay
            // console.log("frame "+i+": delay="+thisDelay);

            encoder.addFrame(gifFrame, {
                copy: true,
                // shorter delay after final frame
                delay: thisDelay,
                transparent: (i==0)? null : "#F0F0F0",
                dispose: 1 // leave as is
            });

            framePrev = frame;
        }

        // encode the Frame array
        encoder["render"]();
    },

    abortCapture: function() {
        // console.log("capture aborted");
        this._progressDisplay["textContent"] = "aborting...";
        if (this._encoder) {
            this._encoder["abort"]();
            document.body.removeChild( this._progressDisplay );
            delete this._progressDisplay

            this._mapMoving = false;
            this._capturing = false;
            if (!this._paused) {
                this.animate();
            }
        }
    },

    setDotColors: function() {
        let items = this._itemsArray,
            numItems = items.length,
            i = 0;

        this._colorPalette = this.ColorPalette.palette(numItems, this["options"].dotAlpha);
        for ( const item of items )
            item.dotColor = this._colorPalette[ i++ ];
    },

    ColorPalette: {
        /*
        From "Making annoying rainbows in javascript"
        A tutorial by jim bumgardner
        */
        makeColorGradient: function(frequency1, frequency2, frequency3,
                                     phase1, phase2, phase3,
                                     center, width, len, alpha) {
            let palette = new Array(len);

            if (center == undefined)   center = 128;
            if (width == undefined)    width = 127;
            if (len == undefined)      len = 50;

            for (let i = 0; i < len; ++i) {
                let r = Math.round(Math.sin(frequency1*i + phase1) * width + center),
                    g = Math.round(Math.sin(frequency2*i + phase2) * width + center),
                    b = Math.round(Math.sin(frequency3*i + phase3) * width + center);
                // palette[i] = `rgba(${r}, ${g}, ${b}, ${alpha})`;
                palette[i] = `rgb(${r}, ${g}, ${b})`;
            }
            return palette;
        },

        palette: function (n, alpha) {
            const center = 128,
                  width = 127,
                  steps = 10,
                  frequency = 2*Math.PI/steps;
            return this.makeColorGradient(frequency,frequency,frequency,0,2,4,center,width,n,alpha);
        }
    }
} );  // end of L.DotLayer definition

Leaflet["dotLayer"] = function( items, options ) {
    return new Leaflet["DotLayer"]( items, options );
};


Leaflet["Control"]["fps"] = Leaflet["Control"]["extend"]({
    lastCalledTime: 1,

    options: {
        position: "topright"
    },

    "onAdd": function (map) {
        // Control container
        this._container = Leaflet["DomUtil"]["create"]('div', 'leaflet-control-fps');
        Leaflet["DomEvent"]["disableClickPropagation"](this._container);
        this._container["style"]["backgroundColor"] = 'white';
        this.update(0);
        return this._container;
    },

    update: function(now=Date.now(), msg="") {
        let fps = ~~(1000 / (now - this.lastCalledTime) + 0.5);
        this._container["innerHTML"] = `${fps} f/s, ${msg}`;
        this.lastCalledTime = now;
        return fps;
    }
});

//constructor registration
Leaflet["control"]["fps"] = function(options) {
  return new Leaflet["Control"]["fps"]();
};
