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

    "options": {
        "debug": false,
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

    /*
     *  ViewBox represents the the rectangle in which everything 
     *  we are doing happens
     *
     */
    ViewBox: {

        initialize: function(map, canvases, fps_display) {
            this.map = map;
            this.canvases = canvases;
            this.fps_display = fps_display;
            this.latLng2px = CRS.makePT(0); // operates in-place!
            this.items = new BitSet();
            this._selections = {selected: null, unselected: null};
            this.pxOffset = new Float32Array(2);
            // this.update();
            return this
        },

        getMapSize: function() {
            return this.map["getSize"]();
        },

        tol: function(zoom) {
            return zoom? 1/(2**zoom) : 1 / this._zf 
        },

        update: function() {
            const m = this.map,
                  zoom = m["getZoom"](),
                  latLngMapBounds = m["getBounds"]();

            const zoomChange = zoom != this.zoom;
            // some stuff that needs to be done on zoom change
            if (zoomChange)
                this.reset(zoom);

            const topLeft = m["containerPointToLayerPoint"]( [ 0, 0 ] ),
                   setPosition = Leaflet["DomUtil"]["setPosition"];

            for (let i=0, len=this.canvases.length; i<len; i++)
                setPosition( this.canvases[i], topLeft );

            const pxOrigin = m["getPixelOrigin"](),
                  mapPanePos = m["_getMapPanePos"]();

            this.pxOffset = mapPanePos["subtract"](pxOrigin);
            this.pxBounds = this.latLng2pxBounds(latLngMapBounds);

            return zoomChange
        },

        reset: function(zoom) {

            this.size = this.getMapSize();
            this.zoom = zoom;
            this._zf = 2 ** zoom;
        },

        // this function operates in-place!
        px2Container: function(p) {
            const offset = this.pxOffset,
                  zf = this._zf;

            p[0] = zf*p[0] + offset.x;
            p[1] = zf*p[1] + offset.y;

            return p; 
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
                  x = ul[0] + 5,
                  y = ul[1] + 5,

                  lr = this.px2Container([xmax, ymax]),
                  w = (lr[0] - x) - 10,
                  h = (lr[1] - y) - 10,
                  rect = {x: x, y:y, w:w, h:h};

            ctx.strokeRect(x, y, w, h);
            return rect
        },

        updateSelections: function(selectedItems) {
            let selected = selectedItems && this.items.intersects(selectedItems),
                unselected;

            if (selected) {
                this._selections.selected = this.items.new_intersection(selectedItems);
                unselected = this.items.new_difference(selectedItems);
            } else {
                this._selections.selected = null;
                unselected = this.items;
            }

            this._selections.unselected = unselected.isEmpty()? null : unselected;

            return this._selections;
        },

        getItems: function() {
            return this._selections;
        }
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
            this._defaultRect = new Float32Array([0,0,0,0]);
            this._rect = new Float32Array(4); // [x, y, w, h]
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
            this._defaultRect[2] = mapSize.x;
            this._defaultRect[3] = mapSize.y;
            return this._defaultRect
        },

        rect: function(pad) {
            pad = pad || this._pad;
            const d = this._dim;
            if (!d) return this.defaultRect();
            const c = this.ViewBox,
                  mapSize = c.size,
                  r = this._rect;
            r[0] = d.xmin;
            r[1] = d.ymin;
            c.px2Container(r);
            r[0] = ~~Math.max(r[0] - pad, 0);
            r[1] = ~~Math.max(r[1] - pad, 0);

            r[2] = d.xmax; 
            r[3] = d.ymax;
            c.px2Container(r.subarray(2,4));
            r[2] = ~~Math.min(r[2] + pad, mapSize.x);
            r[3] = ~~Math.min(r[3] + pad, mapSize.y);

            return r
        },

        draw: function(ctx, rect) {
            const r = rect || this.rect();
            if (!r) return;
            ctx.strokeRect( r[0], r[1], r[2], r[3] );
            return this
        },

        clear: function(ctx, rect) {
            const r = rect || this.rect();
            if (!r) return
            ctx.clearRect( r[0], r[1], r[2], r[3] );
            return this
        }
    },

    WorkerPool: {
        initialize: function(numWorkers, url) {
            if (numWorkers == 0)
                return

            if (!window.Worker) {
                console.log("This browser apparently doesn\'t support web workers");
                return;
            }

            if (!numWorkers)
                 numWorkers = window.navigator.hardwareConcurrency;

            this._workers = [];
            this.currentWorker = 0;

            for (let i=0; i<numWorkers; i++) {
                const worker = new this.DotLayerWorker(url);
                this._workers.push(worker);
                worker.post({hello: `worker_${i}`}).then(msg => console.log(msg));
            }
        },
        // DotLayerWorker object def
        DotLayerWorker: function(url) {
            this.worker = new Worker(url);

            this.post = function(msg, transferables) {
                return new Promise(resolve => {
                    this.worker.onmessage = event => resolve(event.data);
                    this.worker.postMessage(msg, transferables);
                });         
            }
        },

        nextWorker: function() {
            return this.currentWorker %= this._workers.length;
        },

        post: function(msg, transferables) {
            const worker = this._workers[this.nextWorker()];
            return worker.post(msg, transferables);
        },

        postAll: function(msg) {
            const promises = this._workers.map(worker => worker.postMessage(msg));
            return Promise.all(promises);
        }
    },


    // -- initialized is called on prototype
    "initialize": function( fps_display, options ) {
        this._timeOffset = 0;
        this.fps_display = fps_display;
        Leaflet["setOptions"]( this, options );
        this._paused = this["options"]["startPaused"];
        this._timePaused = this.UTCnowSecs();

        this.heatflask_icon = new Image();
        this.heatflask_icon.src = "static/logo.png";

        this.strava_icon = new Image();
        this.strava_icon.src = "static/pbs4.png";

        this._toSimplify = new BitSet();
        this._items = new Map();
        this._lru = new Map();  // turn this into a real LRU-cache

        // this.WorkerPool.initialize(this["options"]["numWorkers"], options["workerUrl"]);
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
        this._itemIds = Array.from(this._items.keys());
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
            this.drawDots();
        else
            this.animate();
    },


    //-------------------------------------------------------------
    _onLayerResize: function( resizeEvent ) {
        const newWidth = resizeEvent["newSize"]["x"],
              newHeight = resizeEvent["newSize"]["y"],
              options = this["options"];

        for (const canvas of [this._dotCanvas, this._lineCanvas]){
            canvas["width"] = newWidth;
            canvas["height"] = newHeight;
        }

        this.ViewBox.update(true);
    },
    //-------------------------------------------------------------

    // -------------------------------------------------------------------
    _debugCtxReset: function() {
        if (!this["options"]["debug"]) return;
        this._debugCtx["strokeStyle"] = "rgb(0,255,0,1)";
        this._debugCtx["lineWidth"] = 10;
        this._debugCtx["setLineDash"]([10, 5]);
    },

    _dotCtxReset: function() {
        const ctx = this._dotCtx;
        if (this["options"]["dotShadows"]["enabled"]) {
            const shadowOpts = this["options"]["dotShadows"],
                  sx = ctx["shadowOffsetX"] = shadowOpts["x"],
                  sy = ctx["shadowOffsetY"] = shadowOpts["y"];
            ctx["shadowBlur"] = shadowOpts["blur"];
            ctx["shadowColor"] = shadowOpts["color"];

        } else {
            ctx["shadowOffsetX"] = 0;
            ctx["shadowOffsetY"] = 0;
            ctx["shadowBlur"] = 0;
        }
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
        
        const vb = this.ViewBox;

        if (vb.update())
            this.updateDotSettings();

        this.DrawBox.reset();
        this._dotCtxReset();

        let ns= 0,
            ns2 = 0;

        const itemsArray = this._itemsArray,
              n = itemsArray.length,
              inView = vb.items.clear(),
              toSimplify = this._toSimplify.clear(),
              zoom = vb.zoom;
        
        for (let i=0; i<n; i++){
            const A = itemsArray[i];
            
            if (!this.inMapBounds(A))
                continue;

            inView.add(i);

            if (!(zoom in A.idxSet)) {    
                // prevent another instance of this function from
                // doing this
                A.idxSet[zoom] = null;
                toSimplify.add(i);
                ns += A.n;
            }
        }
        
        // nothing to show? let's get out of here.
        if (inView.isEmpty())
            return;

        let t0 = performance.now();
        if (ns){
            toSimplify.forEach(i => ns2 =+ this.simplify(itemsArray[i], zoom))
            // const tbls = [],
            //       pxs = new Map(),
            //       items = this._items;

            // toSimplify.forEach(i => {
            //     const A = itemsArray[i];
            //     tbls.push(A.px.buffer);
            //     pxs.set(A.id, A.px);
            // });

            // const promise = this.WorkerPool.post({"simplify": {
            //     "tol": this.ViewBox.tol(zoom),
            //     "px": pxs
            // }}, tbls);

            // promise.then(result => {
            //     let i = 0,
            //         args = result["simplify"];
            //                         debugger;

            //     args["px"].forEach((px, id) => {
            //         const A = items[id];
            //         A.px = px;
            //         A.idxSet[zoom] = BitSet.fromWords(result["simplify"]["idx"][i++]);
            //     });
            // });
        }

        let t1 = performance.now();

        this.drawPaths();

        if (this._paused)
            this.drawDots();
        
        let t2 = performance.now();

        // if (ns)
        //     console.log(`simplify: ${ns} -> ${ns2} in ${~~(t1-t0)}:  ${(ns-ns2)/(t1-t0)}`)

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
        for (const id of ids)
            this._items.delete(id)
        
        this.reset()
    },

    // this returns a reference to the same buffer every time
    _rawPoint: function _rawPoint(A) {
        // px is a Float32Array but JavaScript internally
        // does computation using 64 bit floats,
        // so we use a regular Array.
        if (!_rawPoint.buf)
            _rawPoint.buf = [NaN, NaN]
        
        const buf = _rawPoint.buf,  
              px = A.px;

        return j => {
            buf[0] = px[ j ];
            buf[1] = px[j+1];
            return buf;
        };
    },

    // _pointsArray returns an "array" function from which we directly
    // access the i-th data point for any given idxSet.
    // this is an O(1) lookup via index array. it creates an array of length of the point
    // simplification at this level of zoom.
    pointsArray: function(A, zoom) {
        let point = this._rawPoint(A),
            arrayFunc;

        if (!zoom) {
            arrayFunc = i => point(2*i); 
        }  
        else {
            const key = `I${A.id}:${zoom}`;
            let  idx = this._lru.get(key);
            
            if (!idx) {
                idx = A.idxSet[zoom].array();
                this._lru.set(key, idx);
            }

            arrayFunc = i => point(2*idx[i]);
        }
        return arrayFunc;
    },

    _iterAllPoints: function*(A) {
        const pointAt = this._rawPoint(A);

        for ( let j=0, n = A.px.length; j < n; j +=2 )
            yield pointAt(j);
    },

    _iterPoints: function(A, idxSet) {
        if (idxSet)
            return idxSet.imap( this.pointsArray(A, null) );
        else
            return this._iterAllPoints(A);
    },

    iterPoints: function(A, zoom) {
        if (zoom === 0) return this._iterAllPoints(A);

        if (!zoom)
            zoom = this.ViewBox.zoom;

        return this._iterPoints(A, A.idxSet[zoom]);
    },

    TimeInterval: function interval() {
        if (!interval._interval)
            interval._interval = [NaN, NaN];
        return interval._interval
    },

    iterTimeIntervals: function(A) {
        const zoom = this.ViewBox.zoom,
              stream = StreamRLE.decodeCompressedBuf2(A.time, A.idxSet[zoom]),
              timeInterval = this.TimeInterval();
        let j = 0,
            second = stream.next();
        return A.segMask.imap(idx => {
            let first = second;
            while (j++ < idx)
                first = stream.next();
            second = stream.next();
            timeInterval[0] = first.value;
            timeInterval[1] = second.value;
            return timeInterval;
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
        return subSet.size()
    },

    simplify: function(A, zoom) {
        if (zoom === undefined)
            zoom = this.ViewBox.zoom;

        // simplify from the first available zoom level 
        //  higher than this one if one exists
        // const nextZoomLevel = 20;
        return this._simplify(A, zoom);
    },

    Segment: function segment() {
        if (!segment._segment)
            segment._segment = {
                a: [NaN, NaN],
                b: [NaN, NaN],
                temp: [NaN, NaN]
            };

        return segment._segment;
    },

    // this returns an iterator of segment objects
    iterSegments: function(A, zoom, segMask) {
        const seg = this.Segment(),
              a = seg.a, 
              b = seg.b,
              temp = seg.temp,
              set = (s, p) => {
                s[0] = p[0];
                s[1] = p[1];
              };

        zoom = zoom || this.ViewBox.zoom;
        segMask = segMask || A.segMask;

        /*
         * Method 1: this is more efficient if most segments are
         *  included, but not so much if we need to skip a lot.
         */

        // note: this.iterPoints() returns the a reference to the same
        // object every time so if we need to deal with more than
        // one at a time we will need to make a copy. 
        
        // const points = this.iterPoints(A, zoom);
        // let j = 0, 
        //     obj = points.next();

        // return segMask.imap( i => {
        //     while (j++ < i)
        //         obj = points.next();
        //     set(a, obj.value);

        //     obj = points.next();
        //     set(b, obj.value);
         
        //     return seg;
        // });

        /*
         * Method 2: this is more efficient if
         *  we need to skip a lot of segments.
         */              
        const pointsArray = this.pointsArray(A, null),
              idxSet = A.idxSet[zoom],
              segsIdx = segMask.imap(),
              firstIdx = segsIdx.next().value,
              points = idxSet.imap_find( pointsArray, firstIdx );

        function* iterSegs() {
            set(a, points.next().value); // point at firstIdx
            set(temp, points.next().value);
            set(b, temp); // point at firstIdx + 1
            
            yield seg
            
            let last_i = firstIdx;
            for (const i of segsIdx) {
                if (i === ++last_i)
                    set(a, temp);
                else
                    set(a, points.next(i).value);

                // there is a weird bug here
                set(temp, points.next().value);
                set(b, temp);
                last_i = i;
                yield seg    
            }
        }
        return iterSegs();
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
              points = this.iterPoints(A, viewBox.zoom),
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

    _drawPathFromSegIter: function(ctx, A) {
        const segs = this.iterSegments(A),
              seg = segs.next().value,
              a = seg.a,
              b = seg.b;

        let i = 0;
        do {
            this.ViewBox.px2Container(a);
            ctx["moveTo"](a[0], a[1]);

            this.ViewBox.px2Container(b);
            ctx["lineTo"](b[0], b[1]);

        } while (!segs.next().done)
    },

    _drawPathFromPointArray: function(ctx, A) {
        const zoom = this.ViewBox.zoom,
              segMask = A.segMask,
              points = this.pointsArray(A, zoom),
              point = i => this.ViewBox.px2Container(points(i));

        segMask.forEach(i => {
            let p = point(i);
            ctx["moveTo"](p[0], p[1]);

            p = point(i+1);
            ctx["lineTo"](p[0], p[1]);
        });
    },

    // this function modifies itemsToDraw so make a copy 
    // if you want to use it agin.
    _drawPaths: function(itemsToDraw, defaultColor) {
        const ctx = this._lineCtx;

        for (const [color, withThisColor] of Object.entries(this._pathColorFilters)) {
            
            if (!itemsToDraw.intersects(withThisColor))
                continue;

            const toDraw = itemsToDraw.new_intersection(withThisColor);

            ctx["strokeStyle"] = color || defaultColor;
            ctx["beginPath"]();
            toDraw.forEach( i => this._drawPathFromSegIter(ctx, this._itemsArray[i]));
            ctx["stroke"]();
        } 
    },
    
    // Draw all paths for the current items in such a way 
    // that we group stroke-styles together in batch calls.
    drawPaths: function(clear=true) {
        const ctx = this._lineCtx,
              itemsArray = this._itemsArray,
              options = this["options"],
              vb = this.ViewBox;

        this.DrawBox.reset();

        vb.items.forEach(i => {
            if ( this.makeSegMask(itemsArray[i]).isEmpty() )
                vb.items.remove(i);
        });

        vb.updateSelections(this._selectedItems);
        toDraw = vb.getItems();

        if (clear) {
            const clear = this.DrawBox.clear,
                  rect = this.DrawBox.defaultRect(); 
            clear(this._lineCtx, rect);
            clear(this._dotCtx, rect);
            if (options["debug"])
                clear(this._debugCtx, rect);
        }

        if (!options["showPaths"])
            return

        if (toDraw.unselected){
            // draw unselected paths
            ctx["lineWidth"] = options["normal"]["pathWidth"];
            ctx["globalAlpha"] = options["normal"]["pathOpacity"];
            this._drawPaths(toDraw.unselected, options["normal"]["pathColor"]);
        }

        if (toDraw.selected) {
            // draw selected paths
            ctx["lineWidth"] = options["selected"]["pathWidth"];
            ctx["globalAlpha"] = options["selected"]["pathOpacity"];
            this._drawPaths(toDraw.selected, options["selected"]["pathColor"]);
        }
            
        if (options["debug"]) {
            this._debugCtxReset();
            this.DrawBox.draw(this._debugCtx);
            this._debugCtx["strokeStyle"] = "rgb(255,0,255,1)";
            this.ViewBox.drawPxBounds(this._debugCtx);
        }        
    },

    // --------------------------------------------------------------------
    _drawDots: function( now, A, drawDot ) {      
        const ds = this.dotSettings,
              T = ds._period,
              start = A.ts,
              p = [NaN, NaN];

        // segments yields the same object seg every time with
        // the same views a and b to the same memory buffer.
        //  So we only need to define the references once.
        const segments = this.iterSegments(A),
              seg = segments.next().value,
              p_a = seg.a,
              p_b = seg.b;

        const times = this.iterTimeIntervals(A),
              timeInterval = times.next().value;

        const timeOffset = (ds._timeScale * ( now - (start + timeInterval[0]))) % T;

        let count = 0;
        let obj;

        do {
            const t_a = timeInterval[0],
                  t_b = timeInterval[1],
                  lowest = Math.ceil((t_a - timeOffset) / T),
                  highest = Math.floor((t_b - timeOffset) / T);
                       
            if (lowest <= highest) {
                const t_ab = t_b - t_a,
                      vx = (p_b[0] - p_a[0]) / t_ab,
                      vy = (p_b[1] - p_a[1]) / t_ab;

                for (let j = lowest; j <= highest; j++) {
                    const t = j * T + timeOffset,
                          dt = t - t_a;
                    if (dt > 0) {
                        p[0] = p_a[0] + vx * dt;
                        p[1] = p_a[1] + vy * dt;
                        drawDot(p);
                        count++;
                    }
                }
            }
            
        } while( !segments.next().done && !times.next().done ) 

        return count
    },

    makeCircleDrawFunc: function() {
        const two_pi = this.two_pi,
              ctx = this._dotCtx,
              dotSize = this.dotSettings._dotSize;

        return p => {
            ctx["arc"]( p[0], p[1], dotSize, 0, two_pi );
            ctx["closePath"]();
        };
    },

    makeSquareDrawFunc: function() {
        const ctx = this._dotCtx,
              dotSize = this.dotSettings._dotSize,
              dotOffset = dotSize / 2.0;

        return p =>
            ctx["rect"]( p[0] - dotOffset, p[1] - dotOffset, dotSize, dotSize );
    },

    __drawDots: function(now, toDraw, drawDot) {
        const ctx = this._dotCtx,
              itemsArray = this._itemsArray,
              zoom = this.ViewBox.zoom;

        let count = 0;

        for (const [color, withThisColor] of Object.entries(this._dotColorFilters)) {
            
            if (!toDraw.intersects(withThisColor))
                continue;

            // TODO: only compute this once on view change
            const items = toDraw.new_intersection(withThisColor);
            ctx["fillStyle"] = color || this["options"]["normal"]["dotColor"];
            ctx["beginPath"]();

            items.forEach(i => {
                const A = itemsArray[i];
                
                if (A.idxSet[zoom] && A.segMask && !A.segMask.isEmpty())
                    count += this._drawDots(now, A, drawDot);
            });

            ctx["fill"]();
        }
        return count
    },

    drawDots: function(now) {
        if ( !this._ready )
            return;

        if (!now)
            now = this._timePaused || this.UTCnowSecs();
        
        const ctx = this._dotCtx,
              g = this._gifPatch,
              itemsArray = this._itemsArray,
              toDraw = this.ViewBox.getItems(),
              vb = this.ViewBox,
              transform = vb.px2Container.bind(this.ViewBox);

        this.DrawBox.clear(ctx);

        let count = 0;
        const options = this["options"];

        let unselected = toDraw.unselected,
              selected = toDraw.selected;

        if (this._gifPatch) {
            unselected = vb.items;
            selected = null;
        }

        if (unselected) {
            // draw normal activity dots
            ctx["globalAlpha"] = options["normal"]["dotOpacity"];
            let drawDotFunc = this.makeSquareDrawFunc(),
                drawDot = p => drawDotFunc(transform(p));
            count += this.__drawDots(now, unselected, drawDot, options["normal"]["dotColor"]);
        }

        if (selected) {
            // draw selected activity dots
            drawDotFunc = this.makeCircleDrawFunc();
            drawDot = p => drawDotFunc(transform(p));
            ctx["globalAlpha"] = options["selected"]["dotOpacity"];
            ctx["strokeStyle"] = options["selected"]["dotStrokeColor"];
            ctx["strokeWidth"] = options["selected"]["dotStrokeColor"];
            count += this.__drawDots(now, selected, drawDot, options["selected"]["dotStrokeWidth"]);
        } 
        
        if (options["debug"]) {
            this._debugCtxReset();
            this.DrawBox.draw(this._debugCtx);
            this._debugCtx["strokeStyle"] = "rgb(255,0,255,1)";
            vb.drawPxBounds(this._debugCtx);
        }        

        return count
   
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

            const t0 = performance.now();

            count = this.drawDots( now );

            if (this.fps_display) {
                const elapsed = ( performance.now() - t0 ).toFixed( 0 );
                this.fps_display.update( now, `z=${this.ViewBox.zoom}, dt=${elapsed} ms, n=${count}` );
            }

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
        const ds = this.dotSettings;
        return ds._period / (ds._timeScale * 1000);
    },


// -------------------------------------------------------------------
    setItemSelect: function(selections, redraw=true) {
        let idx = 0;
        const itemIds = this._itemIds,
              selectedItems = this._selectedItems || new BitSet();

        for (const [id, selected] of Object.entries(selections)) {
            idx = itemIds.indexOf(+id);
            if (selected)
                selectedItems.add(idx);
            else
                selectedItems.remove(idx);
        }
        this._selectedItems = selectedItems.isEmpty()? null : selectedItems;
        
        if (redraw)
            this._redraw;
    },

    setSelectRegion: function(pxBounds, callback) {
        let selectedIds = this.itemsInRegion(pxBounds);
        callback(selectedIds);
    },

    itemsInRegion: function(selectPxBounds) {
        const pxOffset = this.ViewBox.pxOffset,
              zf = this.ViewBox._zf;
        
        // un-transform screen coordinates given by the selection
        // plugin to absolute values that we can compare ours to.
        selectPxBounds.min._subtract(pxOffset)._divideBy(zf);
        selectPxBounds.max._subtract(pxOffset)._divideBy(zf);

        const itemsArray = this._itemsArray;
        
        let selected = new BitSet();
        

        this.ViewBox.items.forEach(i => {
            const A = itemsArray[i];
            for (const seg of this.iterSegments(A)) {
                if ( selectPxBounds.contains(seg.a) )
                    selected.add(i);
            }
        });

        if (!selected.isEmpty())
            return selected.imap(i => itemsArray[i].id);
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

            // let timeOffset = (this.dotSettings._timeScale * frameTime) % this._period;
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
    
    dotSettings: {
        C1: 1000000.0,
        C2: 200.0,
        dotScale: 1.0,
    },

    getDotSettings: function() {
        return this.dotSettings;
    },

    updateDotSettings: function(settings, shadowSettings) {

        const ds = this.dotSettings;
        if (settings)
            Object.assign(ds, settings);

        const vb = this.ViewBox,
              zf = vb._zf,
              zoom = vb.zoom;
        ds._timeScale = ds.C2 / zf;
        ds._period = ds.C1 / zf;
        ds._dotSize = Math.max(1, ~~(ds.dotScale * Math.log( zoom ) + 0.5));

        if (shadowSettings) {
            Object.assign(this["options"]["dotShadows"], shadowSettings);
            this._dotCtxReset();
        }

        if (this._paused)
            this.drawDots();
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
    },

    /*
    badSegTimes: function(llt, ttol) {
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
    },

    binarySearch: function(map, x, start, end) {        
        if (start > end) return false; 
       
        let mid = Math.floor((start + end) / 2); 

        if (map(mid) === x) return mid; 
              
        if(map(mid) > x)  
            return binarySearch(map, x, start, mid-1); 
        else
            return binarySearch(map, x, mid+1, end); 
    } 
    */

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
  return new Leaflet["Control"]["fps"](options);
};
