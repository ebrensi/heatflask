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
        "fps_display": true,
        
        "normal": {
            "dotColor": "#000000",
            "dotOpacity": 0.7,

            "pathColor": "#000000",
            "pathOpacity": 0.7,
            "pathWidth": 1,
        },

        "selected": {
            "dotColor": "#FFFFFF",
            "dotOpacity": 0.9,

            "pathColor": "#000000",
            "pathOpacity": 0.7,
            "pathWidth": 5,
        },

        "unselected": {
            "dotColor": "#000000",
            "dotOpacity": 0.2,

            "pathColor": "#000000",
            "pathOpacity": 0.2,
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

        initialize: function(map, canvases, itemsArray) {
            this._map = map;
            this._canvases = canvases;
            this.latLng2px = CRS.makePT(0); // operates in-places
            this._sets = {
                items: { current: new BitSet(), last: new BitSet() },
                colorGroups: { path: {}, dot:  {} }
            };
            this._pathColorGroups = { selected: null, unselected: null };
            this._dotColorGroups =  { selected: null, unselected: null };
            this._pxOffset = [NaN, NaN];

            if (itemsArray)
                this.setItemsArray(itemsArray);

            return this
        },

        reset: function(itemsArray) {
            this.initialize(this._map, this._canvases, itemsArray);
        },

        getMapSize: function () {
            return this._map["getSize"]()
        },


        pathColorGroups: function() {
            const pgroups = this._pathColorGroups,
                  cgroups = this._sets.colorGroups.path;
            this._pathColorGroups.selected = cgroups[true];
            this._pathColorGroups.unselected = cgroups[false];
            return this._pathColorGroups
        },

        dotColorGroups: function() {
            const dgroups = this._dotColorGroups,
                  cgroups = this._sets.colorGroups.dot;
            this._dotColorGroups.selected = cgroups[true];
            this._dotColorGroups.unselected = cgroups[false];
            return this._dotColorGroups
        },

        setItemsArray: function(itemsArray) {
            this._itemsArray = itemsArray;
        },

        tol: function(zoom) {
            return zoom? 1/(2**zoom) : 1/this._zf;
        },

        inView: function() {
            return this._sets.items.current;
        },

        updateView: function() {
            const sets = this._sets,
                  allItems = this._itemsArray,
                  inView = sets.items;

            const temp = inView.current;
            inView.current = inView.last.clear();
            inView.last = temp;

            const currentInView = inView.current;
            // update which items are in the current view
            for (let i=0, len=allItems.length; i<len; i++) {
                if ( this.overlaps(allItems[i].bounds) )
                    currentInView.add(i); 
            }
            
            // update items that have changed since last time
            const changed = inView.last.change(inView.current);
            changed.forEach(i => {
                const A = allItems[i],
                      emph = !!A.selected;
                let pgroup = sets.colorGroups.path,
                    dgroup = sets.colorGroups.dot; 
                
                if ( !( emph in pgroup) )
                    pgroup[emph] = {};
                pgroup = pgroup[emph];
                
                if ( !( emph in dgroup) )
                    dgroup[emph] = {};                
                dgroup = dgroup[emph];

                // update pathColorGroup
                if (! (A.pathColor in pgroup) )
                    pgroup[A.pathColor] = new BitSet().add(i);
                else
                    pgroup[A.pathColor].flip(i);

                // update dotColorGroup
                if (! (A.dotColor in dgroup) )
                    dgroup[A.dotColor] = new BitSet().add(i);
                else
                    dgroup[A.dotColor].flip(i);
            });

            const groups = sets.colorGroups;
            for (const type in groups) {         // path or dot
                const typeGroup = groups[type];
                for (const emph in typeGroup) {
                    const colorGroup = typeGroup[emph];
                    let empty = true;
                    for (const color in colorGroup) {
                        if (colorGroup[color].isEmpty())
                            delete colorGroup[color]
                        else if (empty)
                            empty = false;
                    }
                    if (empty)
                        delete typeGroup[emph];
                }
            }

            // return the current state of inclusion
            return currentInView;
        },

        // note this only removes A from colorGroups but it stays in
        // this.itemsViewBox:ViewBox:, so that we won't keep adding it every time
        // this.update() is called.
        remove: function(i) {
            const A = this._itemsArray[i],
                  cg = this._sets.colorGroups,
                  emph = !!A.selected;
            cg.path[emph][A.pathColor].remove(i);
            cg.dot[emph][A.dotColor].remove(i);
            this.inView().remove(i);
        },

        updateSelect: function(i) {
            const A = this._itemsArray[i],
                  cg = this._sets.colorGroups,
                  emph = !!A.selected;

            if ( this.inView().has(i) ) {
                if (!cg.path[emph])
                    cg.path[emph] = {};

                if (!cg.dot[emph])
                    cg.dot[emph] = {};

                if (!cg.path[emph][A.pathColor])
                    cg.path[emph][A.pathColor] = new BitSet;

                if (!cg.dot[emph][A.dotColor])
                    cg.dot[emph][A.dotColor] = new BitSet;

                cg.path[emph][A.pathColor].add(i);
                cg.path[!emph][A.pathColor].remove(i);

                cg.dot[emph][A.dotColor].add(i);
                cg.dot[!emph][A.dotColor].remove(i);
                return true
            }

        },

        update: function(calibrate=true) {
            const m = this._map,
                  zoom = m["getZoom"](),
                  latLngMapBounds = m["getBounds"]();

            const zoomChange = zoom != this.zoom;
            // stuff that (only) needs to be done on zoom change
            if (zoomChange)
                this.onZoomChange(zoom);

            if (calibrate) {
                // calibrate screen coordinates
                const topLeft = m["containerPointToLayerPoint"]( [ 0, 0 ] ),
                       setPosition = Leaflet["DomUtil"]["setPosition"],
                       canvases = this._canvases;
                
                for (let i=0, len=canvases.length; i<len; i++)
                    setPosition( canvases[i], topLeft );
                
                const pxOrigin = m["getPixelOrigin"](),
                      mapPanePos = m["_getMapPanePos"]();
                this.pxOffset = mapPanePos["subtract"](pxOrigin);
            }

            this.pxBounds = this.latLng2pxBounds(latLngMapBounds);

            return this.updateView();
        },

        onZoomChange: function(zoom) {

            this.size = this.getMapSize();
            this.zoom = zoom;
            this._zf = 2 ** zoom;
        },

        // this function operates in-place!
        px2Container: function(p) {
            const offset = this.pxOffset,
                  zf = this._zf;

            return p => {
                p[0] = zf*p[0] + offset.x;
                p[1] = zf*p[1] + offset.y;

                return p;
            }
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
                  transform = this.px2Container(),

                  ul = transform([xmin, ymin]),
                  x = ul[0] + 5,
                  y = ul[1] + 5,

                  lr = transform([xmax, ymax]),
                  w = (lr[0] - x) - 10,
                  h = (lr[1] - y) - 10,
                  rect = {x: x, y:y, w:w, h:h};

            ctx.strokeRect(x, y, w, h);
            return rect
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
                  mapSize = c.getMapSize(),
                  transform = c.px2Container(),
                  r = this._rect;
            r[0] = d.xmin;
            r[1] = d.ymin;
            transform(r);
            r[0] = ~~Math.max(r[0] - pad, 0);
            r[1] = ~~Math.max(r[1] - pad, 0);

            r[2] = d.xmax; 
            r[3] = d.ymax;
            transform(r.subarray(2,4));
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
    "initialize": function( options ) {
        this._timeOffset = 0;
        Leaflet["setOptions"]( this, options );
        this._paused = this["options"]["startPaused"];
        this._timePaused = this.UTCnowSecs();

        this.heatflask_icon = new Image();
        this.heatflask_icon.src = "static/logo.png";

        this.strava_icon = new Image();
        this.strava_icon.src = "static/pbs4.png";
        // debugger;

        // if (this["options"]["fps_display"])
        //     this.fps_display = Leaflet.control.fps().addTo(this._map);

        this._items = new Map();
        this._lru = new Map();  // turn this into a real LRU-cache

        // this.WorkerPool.initialize(this["options"]["numWorkers"], options["dotWorkerUrl"]);
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

        this.ViewBox.initialize(this._map, canvases);
        this.DrawBox.initialize(this.ViewBox);
        map["on"]( this.getEvents(), this );
    },

    getEvents: function() {
        const loggit = handler => e => {console.log(e); handler && handler(e)};

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

        if (!n) return; 

        this.setDotColors();
        this.ViewBox.reset(this._itemsArray);
        this._ready = true;
        this._redraw();

        if (!this._paused)
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

        this._redraw();
    },

    viewReset: function() {
        this._dotCtxReset();
        this._debugCtxReset();
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

        const oldzoom = this.ViewBox.zoom;

        const itemsArray = this._itemsArray,
              vb = this.ViewBox,
              inView = vb.update(),
              zoom = vb.zoom;

        let ns = 0,
            ns2 = 0;

        this.DrawBox.reset();

        inView.forEach(i => {
            const A = itemsArray[i];
            if (!(zoom in A.idxSet)) {    
                // prevent another instance of this function from doing this
                A.idxSet[zoom] = null;
                ns += A.n;

                // TODO: add this to a list of promises instead
                //  and Promise.all() them to allow for 
                // concurrency
                ns2 += this.simplify(A, zoom);
            }
            if ( this.makeSegMask(A).isEmpty() )
                    vb.remove(i);
        });

        let t1 = performance.now();

        const clear = this.DrawBox.clear,
              rect = this.DrawBox.defaultRect(); 
        clear(this._lineCtx, rect);
        
        if (event)
            clear(this._dotCtx, rect);

        if (this["options"]["debug"])
            clear(this._debugCtx, rect);

        if (this["options"]["showPaths"])
            this.drawPaths();

        let t2 = performance.now();

        if (oldzoom != zoom) {
            this.updateDotSettings();
        }
        else if (this._paused)
            this.drawDots();
        
        // if (ns)
        //     console.log(`simplify: ${ns} -> ${ns2} in ${~~(t1-t0)}:  ${(ns-ns2)/(t1-t0)}`)

        
        /*

        const tbls = [],
              pxs = new Map(),
              items = this._items;

        toSimplify.forEach(i => {
            const A = itemsArray[i];
            tbls.push(A.px.buffer);
            pxs.set(A.id, A.px);
        });

        const promise = this.WorkerPool.post({"simplify": {
            "tol": this.ViewBox.tol(zoom),
            "px": pxs
        }}, tbls);

        promise.then(result => {
            let i = 0,
                args = result["simplify"];
                                debugger;

            args["px"].forEach((px, id) => {
                const A = items[id];
                A.px = px;
                A.idxSet[zoom] = BitSet.fromWords(result["simplify"]["idx"][i++]);
            });
        });

       */
        
        
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

    timesArray: function(A, zoom) {
        const key = `T${A.id}:${zoom}`;
        let arr = this._lru.get(key);
        
        if (!arr) {
            arr = Uint16Array.from(
                StreamRLE.decodeCompressedBuf2(A.time, A.idxSet[zoom])
            );
            this._lru.set(key, arr);
        }

        arrayFunc = i => arr[i];
      
        return arrayFunc;
    },

    TimeInterval: function interval() {
        if (!interval._interval)
            interval._interval = {a: NaN, b: NaN};
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
            timeInterval.a = first.value;
            timeInterval.b = second.value;
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
        if (!segment._data)
            segment._data = {
                segment: {
                    a: [NaN, NaN],
                    b: [NaN, NaN]
                },

                temp: [NaN, NaN]
            };

        return segment._data;
    },

    // this returns an iterator of segment objects
    iterSegments: function(A, zoom, segMask) {
        const obj = this.Segment(),
              seg = obj.segment,
              a = seg.a, 
              b = seg.b,
              temp = obj.temp,
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
              transform = this.ViewBox.px2Container(),
              seg = segs.next().value,
              a = seg.a,
              b = seg.b;

        let i = 0;
        do {
            transform(a);
            ctx["moveTo"](a[0], a[1]);

            transform(b);
            ctx["lineTo"](b[0], b[1]);

        } while (!segs.next().done)
    },

    _drawPathFromPointArray: function(ctx, A) {
        const zoom = this.ViewBox.zoom,
              segMask = A.segMask,
              points = this.pointsArray(A, zoom),
              transform = this.ViewBox.px2Container(),
              point = i => transform(points(i));

        segMask.forEach(i => {
            let p = point(i);
            ctx["moveTo"](p[0], p[1]);

            p = point(i+1);
            ctx["lineTo"](p[0], p[1]);
        });
    },

    _drawPathsByColor: function(colorGroups, defaultColor) {
        const ctx = this._lineCtx,
              items = this._itemsArray;

        for (const color in colorGroups) {
            const group = colorGroups[color];
            ctx["strokeStyle"] = color || defaultColor;
            ctx["beginPath"]();
            group.forEach( i => this._drawPathFromPointArray(ctx, items[i]));
            ctx["stroke"]();
        } 
    },
    
    // Draw all paths for the current items in such a way 
    // that we group stroke-styles together in batch calls.
    drawPaths: function() {
        if (!this._ready)
            return

        const ctx = this._lineCtx,
              itemsArray = this._itemsArray,
              options = this["options"],
              vb = this.ViewBox;

        const cg = vb.pathColorGroups(),
              selected = cg.selected,
              unselected = cg.unselected;

        if (selected) {
            ctx["lineWidth"] = options["unselected"]["pathWidth"];
            ctx["globalAlpha"] = options["unselected"]["pathOpacity"];
            this._drawPathsByColor(unselected, options["unselected"]["pathColor"]);

            // draw selected paths
            ctx["lineWidth"] = options["selected"]["pathWidth"];
            ctx["globalAlpha"] = options["selected"]["pathOpacity"];
            this._drawPathsByColor(selected, options["selected"]["pathColor"]);
        
        } else if (unselected) {
            // draw unselected paths
            ctx["lineWidth"] = options["normal"]["pathWidth"];
            ctx["globalAlpha"] = options["normal"]["pathOpacity"];
            this._drawPathsByColor(unselected, options["normal"]["pathColor"]);
        }
            
        if (options["debug"]) {
            this._debugCtxReset();
            this.DrawBox.draw(this._debugCtx);
            this._debugCtx["strokeStyle"] = "rgb(255,0,255,1)";
            this.ViewBox.drawPxBounds(this._debugCtx);
        }        
    },

    test: function(A) {
        const zoom = this.ViewBox.zoom,
              segs = this.iterSegments(A),
              ints = this.iterTimeIntervals(A),
              points = this.pointsArray(A, zoom),
              times = this.timesArray(A, zoom),
              segMask = A.segMask,
              equalSegs = (s1, s2) => 
                   s1.a[0] == s2.a[0] && s1.a[1] == s2.a[1] &&
                   s1.b[0] == s2.b[0] && s1.b[1] == s2.b[1],
              equalInts = (i1, i2) => i1.a == i2.a && i1.b == i2.b;


        segMask.forEach(i => {
            const seg0 = {a: points(i).slice(0), b: points(i+1)},
                  int0 = {a: times(i), b: times(i+1)},

                  seg1 = segs.next().value,
                  int1 = ints.next().value;
            if (!equalInts(int0, int1) || !equalSegs(seg0, seg1)) {
                console.log(`i:`, seg0, seg1, int0, int1)
                debugger;
            }
        });
    },

    // --------------------------------------------------------------------
    dotPointsIterFromSegs: function*(A, now) {      
        const ds = this.getDotSettings(),
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

        // debugger;

        const timeOffset = (ds._timeScale * ( now - (start + timeInterval.a))) % T;

        // let count = 0;

        do {
            const t_a = timeInterval.a,
                  t_b = timeInterval.b,
                  lowest = Math.ceil((t_a - timeOffset) / T),
                  highest = Math.floor((t_b - timeOffset) / T);
                       
            if (lowest <= highest) {
                // console.log(`${t_a}, ${t_b}`);
                const t_ab = t_b - t_a,
                      vx = (p_b[0] - p_a[0]) / t_ab,
                      vy = (p_b[1] - p_a[1]) / t_ab;

                // console.log(`${p_a}, ${p_b}`);
                for (let j = lowest; j <= highest; j++) {
                    const t = j * T + timeOffset,
                          dt = t - t_a;
                    // console.log(t);
                    if (dt > 0) {
                        p[0] = p_a[0] + vx * dt;
                        p[1] = p_a[1] + vy * dt;
                        // drawDot(p);
                        yield p;
                        // count++;
                    }
                }
            }
            
        } while( !segments.next().done && !times.next().done ) 

        // return count
    },

    dotPointsIterFromArray: function*(A, now) {      
        const ds = this.getDotSettings(),
              T = ds._period,
              start = A.ts,
              p = [NaN, NaN],
              zoom = this.ViewBox.zoom,
              points = this.pointsArray(A, zoom),
              times = this.timesArray(A, zoom),
              p_a = [NaN, NaN],
              p_b = [NaN, NaN],
              set = (d, s) => {
                d[0] = s[0];
                d[1] = s[1];
                return d;
              },
              i0 = A.segMask.min();

        // this.test(A);
        // return

        const timeOffset = (ds._timeScale * ( now - (start + times(i0) ))) % T;

        let count = 0;

        // A.segMask.forEach(i => {
        for (const i of A.segMask) {
            const t_a = times(i),
                  t_b = times(i+1),
                  lowest = Math.ceil((t_a - timeOffset) / T),
                  highest = Math.floor((t_b - timeOffset) / T);
            // console.log(`${t_a}, ${t_b}`);

            if (lowest <= highest) {
                set(p_a, points(i));
                set(p_b, points(i+1));
                // const p_a = set(p, points(i)),
                //       p_b = points(i+1);
                // console.log(`${p_a}, ${p_b}`);
                const t_ab = t_b - t_a,
                      vx = (p_b[0] - p_a[0]) / t_ab,
                      vy = (p_b[1] - p_a[1]) / t_ab;

                for (let j = lowest; j <= highest; j++) {
                    const t = j * T + timeOffset,
                          dt = t - t_a;
                    // console.log(t);
                    if (dt > 0) {
                        p[0] = p_a[0] + vx * dt;
                        p[1] = p_a[1] + vy * dt;
                        // drawDot(p_a);
                        yield p;
                        // count++;
                    }
                }
            }
        }
        // });
        // return count
    },

    makeCircleDrawFunc: function() {
        const two_pi = this.two_pi,
              ctx = this._dotCtx,
              dotSize = this.dotSettings._dotSize,
              transform = this.ViewBox.px2Container();

        return p => {
            transform(p);
            ctx["arc"]( p[0], p[1], dotSize, 0, two_pi );
            ctx["closePath"]();
        };
    },

    makeSquareDrawFunc: function() {
        const ctx = this._dotCtx,
              dotSize = this.dotSettings._dotSize,
              dotOffset = dotSize / 2.0,
              transform = this.ViewBox.px2Container();

        return p => {
            transform(p);
            ctx["rect"]( p[0] - dotOffset, p[1] - dotOffset, dotSize, dotSize );
        }
    },

    _drawDots: function(pointsIterator, drawDotFunc) {
        let count = 0;
        for (const p of pointsIterator) {
            drawDotFunc(p);
            count++;
        }
        return count
    },

    _drawDotsByColor: function(now, colorGroups, drawDot) {
        const ctx = this._dotCtx,
              itemsArray = this._itemsArray;

        let count = 0;

        for (const color in colorGroups) {
            const group = colorGroups[color];
            ctx["fillStyle"] = color || this["options"]["normal"]["dotColor"];
            ctx["beginPath"]();

            group.forEach(i => {
                // const dotLocs = this.dotPointsIterFromSegs(itemsArray[i], now);
                const dotLocs = this.dotPointsIterFromArray(itemsArray[i], now);
                count += this._drawDots(dotLocs, drawDot);
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
        
        const options = this["options"],
              ctx = this._dotCtx,
              g = this._gifPatch,
              itemsArray = this._itemsArray,
              vb = this.ViewBox;

        const colorGroups = vb.dotColorGroups();
        
        let unselected = colorGroups.unselected,
              selected = colorGroups.selected;

        this.DrawBox.clear(ctx);

        let count = 0;

        if (this._gifPatch) {
            unselected = {...selected, ...unselected};
            selected = null;
        } else 

        

        if (selected) {
            // draw normal activity dots
            ctx["globalAlpha"] = options["unselected"]["dotOpacity"];
            let drawDotFunc = this.makeSquareDrawFunc();
            count += this._drawDotsByColor(now, unselected, drawDotFunc, options["unselected"]["dotColor"]);

            // draw selected activity dots
            drawDotFunc = this.makeCircleDrawFunc();
            ctx["globalAlpha"] = options["selected"]["dotOpacity"];
            count += this._drawDotsByColor(now, selected, drawDotFunc, options["selected"]["dotColor"]);
        
        } else if (unselected) {
            // draw normal activity dots
            ctx["globalAlpha"] = options["normal"]["dotOpacity"];
            let drawDotFunc = this.makeSquareDrawFunc();
            count += this._drawDotsByColor(now, unselected, drawDotFunc, options["normal"]["dotColor"]);
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

        if ( this._paused || this._capturing ) {
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
        const m = this.ViewBox._map,
              z = e.zoom,
              scale = m["getZoomScale"]( z );

        // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1
        const offset = Leaflet["Layer"] ? m["_latLngToNewLayerPoint"]( m[".getBounds"]()["getNorthWest"](), z, e.center ) :
                               m["_getCenterOffset"]( e.center )["_multiplyBy"]( -scale )["subtract"]( m["_getMapPanePos"]() );

        const setTransform = Leaflet["DomUtil"]["setTransform"];
        setTransform( this._dotCanvas, offset, scale );
        setTransform( this._lineCanvas, offset, scale );
    },


// -------------------------------------------------------------------
    setItemSelect: function(selections) {
        let idx = 0,
            redraw = false;

        const itemIds = this._itemIds,
              arr = this._itemsArray,
              vb = this.ViewBox;

        for (const [id, selected] of Object.entries(selections)) {
            idx = itemIds.indexOf(+id);
            const A = arr[idx];
            A.selected = selected;
            redraw |= vb.updateSelect(idx);
        }

        if (redraw)
            this._redraw();
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

        const itemsArray = this._itemsArray,
              inView = this.ViewBox.inView();
        
        let selected = new BitSet();
        
        inView.forEach(i => {
            const A = itemsArray[i];
            for (const seg of this.iterSegments(A)) {
                if ( selectPxBounds.contains(seg.a) ) {
                    selected.add(i);
                    break;
                }
            }
        });

        if (!selected.isEmpty())
            return selected.imap(i => itemsArray[i].id);
    },  


    // -----------------------------------------------------------------------

    captureCycle: function(selection=null, callback=null) {
        let periodInSecs = this.periodInSecs();
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

        window["leafletImage"](this.ViewBox._map, function(err, canvas) {
            // download(canvas.toDataURL("image/png"), "mapViewBox.png", "image/png");
            console.log("leaflet-image: " + err);
            if (canvas) {
                this.captureGIF(selection, canvas, periodInSecs, callback=callback);
            }
        }.bind(this));
    },

    captureGIF: function(selection=null, baseCanvas=null, durationSecs=2, callback=null) {
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
                workerScript: this["options"]["gifWorkerUrl"]
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
            this.drawDots(frameTime);

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

    periodInSecs: function() {
        const ds = this.getDotSettings();
        return ds._period / (ds._timeScale * 1000);
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
        }

        this._dotCtxReset();

        if (this._paused)
            this.drawDots();

        return ds
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

Leaflet["dotLayer"] = function( options ) {
    return new Leaflet["DotLayer"]( options );
};


Leaflet["Control"].fps = Leaflet["Control"]["extend"]({
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
Leaflet.control.fps = function(options) {
  return new Leaflet["Control"].fps(options);
};
