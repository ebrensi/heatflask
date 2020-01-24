/*
  DotLayer Efrem Rensi, 2020,
  inspired by L.CanvasLayer by Stanislav Sumbera,  2016 , sumbera.com
  license MIT
*/
'use strict';

L.DotLayer = L.Layer.extend( {

    _pane: "shadowPane",
    two_pi: 2 * Math.PI,
    target_fps: 25,
    _tThresh: 100000000.0,
    C1: 1000000.0,
    C2: 200.0,
    dotScale: 1.0,

    options: {
        debug: true,
        numWorkers: 0,
        startPaused: false,
        showPaths: true,
        colorAll: true,
        segment_ttol: 30,
        normal: {
            dotColor: "#000000",
            dotOpacity: 0.8,

            pathColor: "#000000",
            pathOpacity: 0.7,
            pathWidth: 1,
        },

        selected: {
            dotColor: "#FFFFFF",
            dotOpacity: 0.9,
            dotStrokeColor: "#FFFFFF",
            dotStrokeWidth: 0.5,

            pathColor: "#000000",
            pathOpacity: 0.8,
            pathWidth: 1,
        },

        dotShadows: {
            enabled: true,
            x: 0, y: 2,
            blur: 5,
            color: "#000000"
        }
    },

    crs: {

        initialize: function(map) {
            this.map = map;
            this.latLng2px = CRS.makePT(0);
            this.update();
        },

        // called on zoom change
        update: function() {
            const m = this.map;
            
            this.zoom = m.getZoom();
            this._zf = 2 ** this.zoom;
            this.tol = 1 / (2 ** this.zoom);
            this.pxBounds = this.latLng2pxBounds(m.getBounds());

            // these are zoom-adjusted already
            const pxOrigin = m.getPixelOrigin(),
                  mapPanePos = m._getMapPanePos();

            this.pxOffset = mapPanePos.subtract(pxOrigin);
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

            const sw = llBounds._southWest,
                  ne = llBounds._northEast,
                  project = this.latLng2px;
            
            pxObj[0] = sw.lat;  // xmin
            pxObj[1] = sw.lng;  // ymax
            pxObj[2] = ne.lat;  // xmax
            pxObj[3] = ne.lng;  // ymin
            project(pxObj.subarray(0,2));
            project(pxObj.subarray(2,4));
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
                  ymin = b[3], ymax = b[1];

                  ul = this.px2Container([xmin, ymin]),
                  lr = this.px2Container([xmax, ymax]),
                  x = ul[0] + 5
                  y = ul[1] + 5,
                  w = lr[0] - ul[0] - 10,
                  h = lr[1] - ul[1] - 10;

            ctx.strokeRect(x, y, w, h);
            return {x: x, y:y, w:w, h:h}
        },
    },

    /* DrawBox represents the rectangular region that bounds
     *   all of our drawing on the canvas. We use it primarily
     *   to minimize how much we need to clear between frames
     *   of the animation. 
     */  
    DrawBox: {
        _dim: undefined,
        _map: null,
        _pad: 25,

        initialize: function(crs) {
            this.crs = crs;
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
            const mapSize = this.crs.map.getSize();
            return {x:0, y:0, w: mapSize.x, h: mapSize.y}
        },

        rect: function(pad) {
            pad = pad || this._pad;
            const d = this._dim;
            if (!d) return this.defaultRect();
            const c = this.crs,
                  mapSize = c.map.getSize(),
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
    initialize: function( items, options ) {
        this._timeOffset = 0;
        L.setOptions( this, options );
        this._paused = this.options.startPaused;
        this._timePaused = this.UTCnowSecs();

        this.heatflask_icon = new Image();
        this.heatflask_icon.src = "static/logo.png";

        this.strava_icon = new Image();
        this.strava_icon.src = "static/pbs4.png";

        if (this.options.numWorkers == 0)
            return

        let default_n = window.navigator.hardwareConcurrency;
        if (window.Worker) {
            const n = this.options.numWorkers || default_n;
            if (n) {
                this._workers = [];
                for (let i=0; i<n; i++) {
                    const worker = new Worker(DOTLAYER_WORKER_URL);
                    worker.onmessage = this._handleWorkerMessage.bind(this);
                    this._workers.push(worker);
                    worker.postMessage({
                        hello: `worker_${i}`,
                        ts: performance.now()}
                     );
                }
            }
        } else {
            console.log("This browser apparently doesn\'t support web workers");
        }
    },

    UTCnowSecs: function() {
        return performance.timing.navigationStart + performance.now();
    },

    //-------------------------------------------------------------
    onAdd: function( map ) {
        this._map = map;

        let size = this._map.getSize(),
            zoomAnimated = this._map.options.zoomAnimation && L.Browser.any3d;

        // dotlayer canvas
        this._dotCanvas = L.DomUtil.create( "canvas", "leaflet-layer" );
        this._dotCanvas.width = size.x;
        this._dotCanvas.height = size.y;
        this._dotCtx = this._dotCanvas.getContext( "2d" );
        L.DomUtil.addClass( this._dotCanvas, "leaflet-zoom-" + ( zoomAnimated ? "animated" : "hide" ) );
        map._panes.shadowPane.style.pointerEvents = "none";
        map._panes.shadowPane.appendChild( this._dotCanvas );

        // create Canvas for polyline-ish things
        this._lineCanvas = L.DomUtil.create( "canvas", "leaflet-layer" );
        this._lineCanvas.width = size.x;
        this._lineCanvas.height = size.y;
        this._lineCtx = this._lineCanvas.getContext( "2d" );
        this._lineCtx.lineCap = "round";
        this._lineCtx.lineJoin = "round";
        L.DomUtil.addClass( this._lineCanvas, "leaflet-zoom-" + ( zoomAnimated ? "animated" : "hide" ) );
        map._panes.overlayPane.appendChild( this._lineCanvas );

        if (this.options.debug) {
            // create Canvas for debugging canvas stuff
            this._debugCanvas = L.DomUtil.create( "canvas", "leaflet-layer" );
            this._debugCanvas.width = size.x;
            this._debugCanvas.height = size.y;
            this._debugCtx = this._debugCanvas.getContext( "2d" );
            L.DomUtil.addClass( this._debugCanvas, "leaflet-zoom-" + ( zoomAnimated ? "animated" : "hide" ) );
            map._panes.overlayPane.appendChild( this._debugCanvas );
        }

        this.crs.initialize(this._map);
        this.DrawBox.initialize(this.crs);

        map.on( this.getEvents(), this );
        this._calibrate();
    },

    getEvents: function() {
        const loggit = (e) => console.log(e);

        const events = {
            // movestart: loggit,
            // move: e => this._redraw(false, e),
            moveend: e => this._redraw(true, e),
            // zoomstart: loggit,
            // zoom: loggit,
            // zoomend: this._calibrate,
            // viewreset: this._calibrate,
            resize: this._onLayerResize
        };

        if ( this._map.options.zoomAnimation && L.Browser.any3d ) {
            events.zoomanim =  this._animateZoom;
        }

        return events;
    },

    addTo: function( map ) {
        map.addLayer( this );
        return this;
    },

    //-------------------------------------------------------------
    onRemove: function( map ) {
        this.onLayerWillUnmount && this.onLayerWillUnmount(); // -- callback

        map._panes.shadowPane.removeChild( this._dotCanvas );
        this._dotCanvas = null;

        map._panes.overlayPane.removeChild( this._lineCanvas );
        this._lineCanvas = null;

        if (this.options.debug) {
            map._panes.overlayPane.removeChild( this._debugCanvas );
            this._debugCanvas = null;
        }

        map.off( this.getEvents(), this );
    },

    // --------------------------------------------------------------------

    // Call this function after items are added or reomved
    reset: function() {
        if (!this._map || !this._items)
            return

        this._ready = false;

        t0 = performance.now();

        this._itemsArray = Object.values(this._items);
        const n = this._itemsArray.length;

        if (n) {

            this.setDotColors();

            const pathColors = new Set(this._itemsArray.map(A => A.pathColor));
            this._colorFilters = {};

            for (color of pathColors) {
                this._colorFilters[color] = BitSet.new_filter(
                    this._itemsArray,
                    A => A.pathColor == color
                );
            }
            this._calibrate();
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
        let newWidth = resizeEvent.newSize.x,
            newHeight = resizeEvent.newSize.y;


        console.log("resizing canvas to",newHeight,newWidth );

        this._dotCanvas.width = newWidth;
        this._dotCanvas.height = newHeight;

        this._lineCanvas.width = newWidth;
        this._lineCanvas.height = newHeight;

        if (this.options.debug) {
            this._debugCanvas.width = newWidth;
            this._debugCanvas.height = newHeight;
            this._debugCtx.strokeStyle = "rgb(0,255,0,0.5)";
            this._debugCtx.lineWidth = 5;
            this._debugCtx.setLineDash([4, 10]);
        }

        if (this.options.dotShadows.enabled) {
            const sx = this._dotCtx.shadowOffsetX = this.options.dotShadows.x,
                  sy = this._dotCtx.shadowOffsetY = this.options.dotShadows.y
            this._dotCtx.shadowBlur = this.options.dotShadows.blur
            this._dotCtx.shadowColor = this.options.dotShadows.color
        } else {
            this._dotCtx.shadowOffsetX = 0;
            this._dotCtx.shadowOffsetY = 0;
            this._dotCtx.shadowBlur = 0;
        }
    },

    _calibrate: function() {
        // This is necessary on zoom, resize, or viewreset events
        const topLeft = this._map.containerPointToLayerPoint( [ 0, 0 ] );
        L.DomUtil.setPosition( this._dotCanvas, topLeft );
        L.DomUtil.setPosition( this._lineCanvas, topLeft );

        if (this.options.debug) {
            L.DomUtil.setPosition( this._debugCanvas, topLeft );
            this._debugCtx.strokeStyle = "rgb(0,255,0,0.5)";
            this._debugCtx.lineWidth = 5;
            this._debugCtx.setLineDash([4, 10]);
        }

        this.DrawBox.reset();
    },
    //-------------------------------------------------------------

    // -------------------------------------------------------------------

    drawSeg: function(P1, P2) {
        const o = this._state.pxOffset,
              p1 = [P1[0]+o.x, P1[1]+o.y],
              p2 = [P2[0]+o.x, P2[1]+o.y];

        this._debugCtx.beginPath();
        this._debugCtx.moveTo(p1[0], p1[1]);
        this._debugCtx.lineTo(p2[0], p2[1]);
        this._debugCtx.stroke();
        return {p1: p1, p2: p2}
    },

    _redraw: function(force, event) {
        if ( !this._ready )
            return;

        

        // prevent redrawing more often than necessary
        const ts = performance.now(),
              lr = this._lastRedraw;
        if (!force && ts - lr < 200)
            return;

        this._lastRedraw = ts;

        const S = this.crs,
              zoom = this._map.getZoom();

        if (zoom != S.zoom) {
            this._calibrate();
        }     
        this._calibrate();   
        S.update();
        S.drawPxBounds(this._debugCtx);
        
        const itemsArray = this._itemsArray,
              n = itemsArray.length,
              inMapBounds = A => S.overlaps(A.bounds);

        const toProject = this._toProject = (this._toProject || new BitSet()).clear(),
              itemsInView = this._itemMask = (this._itemMask || new BitSet()).clear();

        for (let i=0; i<n; i++){
            const A = itemsArray[i];
            
            debugger;

            if (!inMapBounds(A))
                continue;

            if (A.zoomed[zoom]) {
                let mask = A.segMask = this.makeSegMask(A.px, null, A.segMask);
                if (!mask.isEmpty())
                    itemsInView.add(i);
            
            } else {
                // prevent another instance of this function from
                // doing this
                A.zoomed[zoom] = {};
                toProject.add(i);
            }
        }

        if (this.options.showPaths) {
            this.drawPaths();
            if (this._paused)
                this.drawDotLayer();
        }

        if (!toProject.isEmpty()) {
            // ids = Array.from(toProject.imap(i => itemsArray[i].id));
            // this._postToAllWorkers({ 
            //     project: ids,
            //     zoom: zoom,
            //     smoothFactor: this.smoothFactor,
            //     ttol: this.options.segment_ttol
            // });

            const points = A => i => {let j; return A.px.subarray(j=2*i, j+2)};

            toProject.forEach(i => {
                const A = this._itemsArray[i];

                const idx = A.zoomed[zoom] = Simplifier.simplify(points(A), A.n, S.tol);
                A.segMask = this.makeSegMask(A);
                
                if (!A.segMask.isEmpty())
                    itemsInView.add(i);
            });

            if (this.options.drawPaths) {
                this.drawPaths(toProject);
                if (this._paused)
                    this.drawDotLayer();
            }
        }        
    },

    addItem: function(id, polyline, time, llBounds, n) {
        const A = {
                id: parseInt(id),
                bounds: null,
                px: Polyline.decode2Buf(polyline, n),
                time: StreamRLE.transcode2CompressedBuf(time),
                zoomed: {},
                n: n
            };
        
        // convert latlng bounds to pixel bounds
        A.bounds = this.crs.latLng2pxBounds(llBounds);

        this._items = this._items || {};
        this._items[ id ] = A;

        // make baseline projection (convert latLngs to pixel points)
        // in-place
        const px = A.px,
              project = this.crs.latLng2px;

        for (let i=0, len=px.length; i<len; i+=2)
            project(px.subarray(i, i+2));


        // let iterTime = function*(bitset, RLEstream) {
        //     const stream = StreamRLE.decodeCompressedBuf(RLEstream);
        //     bitset.forEach(idx => {
        //         let s = stream.next();
        //         while (i++ < idx)
        //             s = stream.next();
        //         yield s.value;
        //     });
        // }

        // msg = {addItems: {}};
        // msg.addItems[A.id] = A.data;
        // this._postToWorker(msg, [A.data.latLng.buffer, A.data.time]);
        
    },

    removeItems: function(ids) {
        this._postToAllWorkers({removeItems: ids});
    },

    _postToAllWorkers: function(msg) {
        msg.ts = performance.now();
        for (const worker of this._workers)
            worker.postMessage(msg);
    }, 

    _postToWorker: function(msg, transferables) {
        let w = this._currentWorker || 0,
            n = this._workers.length;

        this._currentWorker = (w + 1) % n;

        this._workers[w].postMessage(msg, transferables);
        // console.log(`${msg.ts} ${msg.id} posted to ${w}`);
    },

    _handleWorkerMessage: function(event) {
        const msg = event.data;
        if ("project" in msg) {
            const zoom = msg.zoom,
                  relevant = zoom == this._zoom;
                        
            for (let id in msg.projected) {
                const A = this._items[id],
                      P = A.projected[zoom] = msg.projected[id];

                // if (relevant)
                //     A.segMask = this.makeSegMask(P.P, P.bad, A.segMask);
            }

            if (relevant) {
                this.drawPaths();
                if (this._paused)
                    this.drawDotLayer();
            }
        }
    },

    makeSegMask: function(A) {
        const pbuf = A.px,
              idxSet = A.zoomed[this.crs.zoom],
              contains = this.crs.contains,
              drawBox = this.DrawBox,
              point = i => {let j; return pbuf.subarray(j=2*i, j+2)},
              inBounds = i => {let p; return contains(p=point(i)) && drawBox.update(p)};

        const mask = (A.segmask || new BitSet()).clear(),
            inclusion = idxSet.imap(i => inBounds(i));        
        
        let pIn = inclusion.next().value,
            s = 0;

        for (const pnextIn of inclusion) {
            if (pIn || pnextIn)
                mask.add(s);
            pIn = pnextIn;
            s++;
        }

        if (A.badSegs)
            for (s of A.badSegs)
                mask.remove(s)
        return mask
    },

    _drawPath: function(ctx, pointsBuf, segMask, pxOffset, lineWidth, strokeStyle, opacity, isolated=false) {
        const ox = pxOffset.x,
              oy = pxOffset.y,
              seg = i => pointsBuf.subarray(j=3*i, j+6);

        if (isolated)
            ctx.beginPath();
 
        segMask.forEach( i => {
            const s = seg(i),
                  p1x = s[0] + ox, p1y = s[1] + oy,
                  p2x = s[3] + ox, p2y = s[4] + oy;

            // draw segment
            ctx.moveTo(p1x, p1y);
            ctx.lineTo(p2x, p2y);

        });

        if (isolated) {
            ctx.globalAlpha = opacity;
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = strokeStyle;
            ctx.stroke();
            if (this.options.debug)
                drawBox.clear(this._debugCtx).draw(this._debugCtx); 
        }
    },

    
    // Draw all paths for the current items
    //  This is more efficient than calling drawPath repeatedly
    //   for each activity, since we group strokes together.
    drawPaths: function(itemsToDraw) {
        if (!(itemsToDraw || this._itemMask) || !this._map)
            return
        // console.time("drawPaths")

        const canvas = this._lineCanvas,
              ctx = this._lineCtx,
              zoom = this._zoom,
              drawBox = this.DrawBox,
              itemsArray = this._itemsArray,
              pxOffset = this._pxOffset;
       
        if (!itemsToDraw) {
            itemsToDraw = this._itemMask.clone();
            drawBox.reset().clear(ctx).clear(this._debugCtx).clear(this._dotCtx);
        }
    
        // const query = (status=="selected")? A => !!A.highlighted : A => !A.highlighted;

        // for (let [status, sfilter] of Object.entries(this._emphFilters)) {
        //     ctx.lineWidth = this.options[status].pathWidth;
        //     ctx.globalAlpha = this.options[status].pathOpacity;


        for (const [color, cfilter] of Object.entries(this._colorFilters)) {
             // this._filter.intersect(sfilter);
            
            if (cfilter.isEmpty() || !itemsToDraw.intersection_size(cfilter))
                continue;

            itemsToDraw.intersection(cfilter);

            ctx.strokeStyle = color;
            ctx.beginPath();
            
            itemsToDraw.forEach( i => {
                const A = itemsArray[i];
                if ( (A.projected[zoom] || {}).P ) {
                    const P = A.projected[zoom];
                    A.segMask = this.makeSegMask(P.P, P.bad, A.segMask);

                    this._drawPath(ctx, P.P, A.segMask, pxOffset);
                }
            });

            ctx.stroke();
        } 

        // console.timeEnd("drawPaths");
        if (this.options.debug)
            drawBox.draw(this._debugCtx);        
    },

    // --------------------------------------------------------------------
    drawActivityDots: function( now, start, projected, segMask, drawDot ) {
        const P = projected.P,
              dP = projected.dP,
              xOffset = this._pxOffset.x,
              yOffset = this._pxOffset.y,
              segment = i => P.subarray(j=3*i, j+6),   // two points (x,y,t)
              velocity = i => dP.subarray(j=2*i, j+2), // one velocity (vx,vy)             
              segmentIndex = segMask.imap();
              
        let obj = segmentIndex.next(),
            count = 0;

        const T = this._period,
              first_t = segment(obj.value)[2],
              timeOffset = (this._timeScale * ( now - (start + first_t))) % T;

        // loop over segments
        while (!obj.done) {
            let i = obj.value,
                s = segment(i),
                ta = s[2], tb = s[5],
                jfirst = Math.ceil((ta - timeOffset) / T),
                jlast = Math.floor((tb - timeOffset) / T);
                       
            if (jfirst <= jlast) {
                // loop within segment i   
                for (let j = jfirst; j <= jlast; j++) {
                    const t = j * T + timeOffset,
                          dt = t - ta;
                    if (dt > 0) {
                        const v = velocity(i);
                              x = s[0] + v[0] * dt + xOffset,
                              y = s[1] + v[1] * dt + yOffset;

                        drawDot(x,y);
                        count++;
                    }
                }
            }

            obj = segmentIndex.next();
        }    
        return count
    },

    makeCircleDrawFunc: function() {
        const two_pi = this.two_pi,
              ctx = this._dotCtx,
              dotSize = this._dotSize;

        return (x,y) => ctx.arc( x, y, dotSize, 0, two_pi );
    },

    makeSquareDrawFunc: function() {
        const ctx = this._dotCtx,
              dotSize = this._dotSize
              dotOffset = dotSize / 2.0;

        return (x,y) =>
            ctx.rect( x - dotOffset, y - dotOffset, dotSize, dotSize );
    },

    drawDotLayer: function(now) {
        return;

        if ( !this._ready || this._itemMask.isEmpty() ) {
            return;
        }

        const t0 = performance.now();

        if (!now)
            now = this._timePaused || this.UTCnowSecs();
        
        const ctx = this._dotCtx,
              zoom = this._zoom,
              canvas = this._dotCanvas,
              zf = this._zoomFactor = 1 / (2**zoom),
              g = this._gifPatch,
              itemsArray = this._itemsArray,
              mask = this._itemMask;

        this._timeScale = this.C2 * zf;
        this._period = this.C1 * zf;
        this._dotSize = Math.max(1, ~~(this.dotScale * Math.log( zoom ) + 0.5));

        let count = 0,
            drawDotFunc = this.makeSquareDrawFunc();

        this.DrawBox.clear(ctx);

        for (A of this._itemMask.imap(i => itemsArray[i])) {
            const P = A.projected[zoom] || {};
            if (P.P && A.segMask && !A.segMask.isEmpty()) {
                ctx.fillStyle = A.dotColor || this.normal.dotColor;
                
                const start = A.UTCtimestamp;
                ctx.beginPath();
                count += this.drawActivityDots(now, start, P, A.segMask, drawDotFunc);
                ctx.fill();
            }
        };

        // drawDotFunc = makeCircleDrawFunc();
        // if ( A.highlighted & !g)
        //     ctx.stroke();

        // for ( const A of Object.values(this._items) ) {
        //     if (!A.inView || !A.projected[zoom] || !A.segMask)
        //         continue; 

        //     if ( A.highlighted ) {
        //         highlighted_items.push( A );
        //     } else {
        //         const P = A.projected[zoom];
        //         count += this.drawActivityDots(now, A.startTime, P.P, P.dP, A.segMask, A.dotColor, false);
        //     }
        // }

        // // Now plot highlighted paths
        // if ( highlighted_items.length ) {
        //     ctx.globalAlpha = this.options.selected.dotOpacity
        //     for (const A in highlighted_items) {
        //         count += this.drawActivityDots(now, A.startTime, P.P, P.dP, A.segMask, A.dotColor, true);
        //     }
        //     ctx.globalAlpha = this.options.normal.dotOpacity
        // }

        if (fps_display) {
            const elapsed = ( performance.now() - t0 ).toFixed( 1 );
            fps_display.update( now, `z=${this._zoom}, dt=${elapsed} ms, n=${count}` );
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
        this._frame = L.Util.requestAnimFrame( this._animate, this );
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

        // debugger;
        let ts = this.UTCnowSecs();
            now = ts - this._timeOffset;

        if ( this._paused ) {
            // Ths is so we can start where we left off when we resume
            this._timePaused = ts;
            return;
        }


        if (now - this.lastCalledTime > this.minDelay) {
            this.lastCalledTime = now;
            this.drawDotLayer( now );
        }

        this._frame = L.Util.requestAnimFrame( this._animate, this );
    },

    //------------------------------------------------------------------------------
    _animateZoom: function( e ) {
        var scale = this._map.getZoomScale( e.zoom );

        // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1
        var offset = L.Layer ? this._map._latLngToNewLayerPoint( this._map.getBounds().getNorthWest(), e.zoom, e.center ) :
                               this._map._getCenterOffset( e.center )._multiplyBy( -scale ).subtract( this._map._getMapPanePos() );

        L.DomUtil.setTransform( this._dotCanvas, offset, scale );
        L.DomUtil.setTransform( this._lineCanvas, offset, scale );
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
        const z = this._zoom,
              pxOffset = this._pxOffset,
              ox = pxOffset.x,
              oy = pxOffset.y;

        let selectedIds = [];

        for (let A of this._items.values()) {
            if (!A.inView || !A.projected[z])
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
        pd = document.createElement( 'div' );
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

        leafletImage(this._map, function(err, canvas) {
            //download(canvas.toDataURL("image/png"), "mapView.png", "image/png");
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
            sx = selection.topLeft.x;
            sy = selection.topLeft.y;
            sw = selection.width;
            sh = selection.height;
        } else {
            sx = sy = 0;
            sw = this._size.x;
            sh = this._size.y;
        }


        // set up GIF encoder
        let pd = this._progressDisplay,
            frameTime = Date.now(),
            // we use a frame rate of 25 fps beecause that yields a nice
            //  4 1/100-th second delay between frames
            frameRate = 25,
            numFrames = durationSecs * frameRate,
            delay = 1000 / frameRate,

            encoder = new GIF({
                workers: window.navigator.hardwareConcurrency,
                quality: 8,
                transparent: 'rgba(0,0,0,0)',
                workerScript: GIFJS_WORKER_URL
            });


        this._encoder = encoder;

        encoder.on( 'progress', function( p ) {
            msg = `Encoding frames...${~~(p*100)}%`;
            // console.log(msg);
            this._progressDisplay.textContent = msg;
        }.bind( this ) );

        encoder.on('finished', function( blob ) {
            // window.open(URL.createObjectURL(blob));

            if (blob) {
                download(blob, "output.gif", 'image/gif' );
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

            if (dN.length != len){
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
            let w = window.open(canvas.toDataURL("image/png"), target='_blank');
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
            
        framePrev = null;
        // Add frames to the encoder
        for (let i=0, num=~~numFrames; i<num; i++, frameTime+=delay){
            let msg = `Rendering frames...${~~(i/num * 100)}%`;

            // let timeOffset = (this._timeScale * frameTime) % this._period;
            // console.log( `frame${i} @ ${timeOffset}`);

            pd.textContent = msg;

            // create a new canvas
            let frame = document.createElement('canvas');
            frame.width = sw;
            frame.height = sh;
            frameCtx = frame.getContext('2d');

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
        encoder.render();
    },

    abortCapture: function() {
        // console.log("capture aborted");
        this._progressDisplay.textContent = "aborting...";
        if (this._encoder) {
            this._encoder.abort();
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

        this._colorPalette = this.ColorPalette.palette(numItems, this.options.dotAlpha);
        for ( item of items )
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
            center = 128;
            width = 127;
            steps = 10;
            frequency = 2*Math.PI/steps;
            return this.makeColorGradient(frequency,frequency,frequency,0,2,4,center,width,n,alpha);
        }
    }
} );  // end of L.DotLayer definition

L.dotLayer = function( items, options ) {
    return new L.DotLayer( items, options );
};


L.Control.fps = L.Control.extend({
    lastCalledTime: 1,

    options: {
        position: "topright"
    },

    onAdd: function (map) {
        // Control container
        this._container = L.DomUtil.create('div', 'leaflet-control-fps');
        L.DomEvent.disableClickPropagation(this._container);
        this._container.style.backgroundColor = 'white';
        this.update(0);
        return this._container;
    },

    update: function(now=Date.now(), msg="") {
        let fps = ~~(1000 / (now - this.lastCalledTime) + 0.5);
        this._container.innerHTML = `${fps} f/s, ${msg}`;
        this.lastCalledTime = now;
        return fps;
    }
});

//constructor registration
L.control.fps = function(options) {
  return new L.Control.fps();
};


// {
// // @method latLngToLayerPoint(latlng: LatLng): Point
//     // Given a geographical coordinate, returns the corresponding pixel coordinate
//     // relative to the [origin pixel](#map-getpixelorigin).
//     latLngToLayerPoint = latlng => {
//         var projectedPoint = this.project(toLatLng(latlng))._round();
//         return projectedPoint._subtract(this.getPixelOrigin());
//     }

//     // @method layerPointToContainerPoint(point: Point): Point
//     // Given a pixel coordinate relative to the [origin pixel](#map-getpixelorigin),
//     // returns the corresponding pixel coordinate relative to the map container.
//     layerPointToContainerPoint = point => { // (Point)
//         return toPoint(point).add(this._getMapPanePos());
//     }
// }

