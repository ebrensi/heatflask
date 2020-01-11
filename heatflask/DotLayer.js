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
    smoothFactor: 1.0,
    _tThresh: 100000000.0,
    C1: 1000000.0,
    C2: 200.0,
    dotScale: 1,

    options: {
        numWorkers: 1,
        startPaused: false,
        showPaths: true,
        colorAll: true,
        normal: {
            dotColor: "#000000",
            dotOpacity: 0.8,

            pathColor: "#000000",
            pathOpacity: 0.7,
            pathWidth: 1
        },
        selected: {
            dotColor: "#FFFFFF",
            dotOpacity: 0.9,
            dotStrokeColor: "#FFFFFF",
            dotStrokeWidth: 0.5,

            pathColor: "#000000",
            pathOpacity: 0.8,
            pathWidth: 1
        }
    },

    // -- initialized is called on prototype
    initialize: function( items, options ) {
        this._map    = null;
        this._dotCanvas = null;
        this._lineCanvas = null;
        this._capturing = null;
        this._dotCtx = null;
        this._lineCtx = null;
        this._frame  = null;
        this._items = null;
        this._timeOffset = 0;
        this._colorPalette = [];
        L.setOptions( this, options );
        this._paused = this.options.startPaused;
        this._timePaused = Date.now();

        this.heatflask_icon = new Image();
        this.heatflask_icon.src = "static/logo.png";

        this.strava_icon = new Image();
        this.strava_icon.src = "static/pbs4.png";

        this._workers = null;
        this._jobIndex = {};

        if (window.Worker) {
            const n = this.options.numWorkers;
            if (n) {
                this._workers = [];
                for (let i=0; i<n; i++) {
                    const worker = new Worker(DOTLAYER_WORKER_URL);
                    worker.onmessage = this._handleWorkerMessage.bind(this);
                    this._workers.push(worker);
                    worker.postMessage({"hello": `worker_${i}`});
                }

                if (items)
                    this.addItems(items)
            }
        } else {
            console.log("This browser apparently doesn\'t support web workers");
        }
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

        map.on( this.getEvents(), this );

        if ( this._items ) {
            this.reset();
        }
    },

    //-------------------------------------------------------------
    _onLayerDidResize: function( resizeEvent ) {
        let newWidth = resizeEvent.newSize.x,
            newHeight = resizeEvent.newSize.y;

        this._dotCanvas.width = newWidth;
        this._dotCanvas.height = newHeight;

        this._lineCanvas.width = newWidth;
        this._lineCanvas.height = newHeight;

        this._onLayerDidMove();
    },

    //-------------------------------------------------------------
    _onLayerDidMove: function() {
        this._mapMoving = false;

        this._setupWindow();

        if (this._paused) {
            this.drawLayer(this._timePaused);
        } else {
            this.animate();
        }

    },

    //-------------------------------------------------------------
    getEvents: function() {
        var events = {
            move: this._onLayerDidMove,
            moveend: this._onLayerDidMove,
            resize: this._onLayerDidResize
        };

        if ( this._map.options.zoomAnimation && L.Browser.any3d ) {
            events.zoomanim =  this._animateZoom;
        }

        return events;
    },

    //-------------------------------------------------------------
    // Call this function when items are added or reomved
    reset: function() {
        this.setDotColors();
        this._onLayerDidMove();
    },


    //-------------------------------------------------------------
    onRemove: function( map ) {
        this.onLayerWillUnmount && this.onLayerWillUnmount(); // -- callback

        map._panes.shadowPane.removeChild( this._dotCanvas );
        this._dotCanvas = null;

        map._panes.overlayPane.removeChild( this._lineCanvas );
        this._lineCanvas = null;

        map.off( this.getEvents(), this );
    },


    // --------------------------------------------------------------------
    addTo: function( map ) {
        map.addLayer( this );
        return this;
    },

    // -------------------------------------------------------------------
    setSelectRegion: function(pxBounds, callback) {
        let paused = this._paused;
        this.pause();
        let selectedIds = this.getSelected(pxBounds);
        if (paused){
            this.drawLayer();
        } else {
            this.animate();
        }
        callback(selectedIds);
    },

    // -------------------------------------------------------------------

    _overlaps: function(mapBounds, activityBounds) {
        let sw = mapBounds._southWest,
            ne = mapBounds._northEast,
            sw2 = activityBounds._southWest,
            ne2 = activityBounds._northEast,

            latOverlaps = (ne2.lat > sw.lat) && (sw2.lat < ne.lat),
            lngOverlaps = (ne2.lng > sw.lng) && (sw2.lng < ne.lng);

        return latOverlaps && lngOverlaps;
    },

    itemMask: function(bitArray=null) {
        const items = Object.values(this._items),
              mapBounds = this._latLngBounds,
              n = items.length;

        if (bitArray === null || bitArray.count() != n)
            bitArray = new FastBitArray(n);

        let i = 0;
        items.forEach(
            A => bitArray.set(i++, A.inView = this._overlaps(mapBounds, A.bounds))
        );

        return bitArray
    },

    _contains: function (pxBounds, point) {
        let x = point[0],
            y = point[1];

        return (pxBounds.min.x <= x) && (x <= pxBounds.max.x) &&
               (pxBounds.min.y <= y) && (y <= pxBounds.max.y);
    },

    _segMask: function(pxBounds, projected, bitArray=null) {
        const n = projected.length / 3;
        
        if (bitArray === null || bitArray.count() != n)
            bitArray = new FastBitArray(n);

        let pLast = projected.subarray(0,2);

        for (let idx = 1; idx < n; idx++) {
            let i = 3*idx,
                p = projected.subarray(i, i+2);
                segInView = (
                    this._contains(pxBounds, p) ||
                    this._contains(pxBounds, pLast)
                );
            bitArray.set(idx-1, segInView);
            pLast = p;
        }
        return bitArray
    },

    _setupWindow: function() {
        if ( !this._map || !this._items ) {
            return;
        }
        const perf_t0 = performance.now();

        // reset map orientation
        this._drawRect = undefined;
        this.clearCanvas();

        let topLeft = this._map.containerPointToLayerPoint( [ 0, 0 ] );
        L.DomUtil.setPosition( this._dotCanvas, topLeft );
        L.DomUtil.setPosition( this._lineCanvas, topLeft );

        // Get new map orientation
        this._zoom = this._map.getZoom();
        this._center = this._map.getCenter;
        this._size = this._map.getSize();

        const mapPanePos = this._map._getMapPanePos(),
              pxOrigin = this._map.getPixelOrigin();

        this._latLngBounds = this._map.getBounds();
        this._pxOffset = mapPanePos.subtract( pxOrigin );
        this._pxBounds = this._map.getPixelBounds();

        let pxBounds = this._pxBounds,
            z = this._zoom;

        this._dotCtx.strokeStyle = this.options.selected.dotStrokeColor;
        this._dotCtx.lineWidth = this.options.selected.dotStrokeWidth;

        const batchId = performance.now(),
              jobIndex = this._jobIndex,
              items = Object.entries(this._items),
              itemMask = this._itemMask = this.itemMask(this._itemMask),
              count = itemMask.count();

        if (!count)
            return;

        let job = jobIndex[batchId] = {count: count},
            toProjectMask = new FastBitArray(items.length);

        itemMask.forEach(i => {
            let [id, A] = items[i];

            if ( !A.projected )
                A.projected = {};

            // if a projection for this zoom level already exists,
            // we don't need to do anything
            if (A.projected[ z ])
                this._afterProjected(A, z, batchId)
            else
                toProjectMask.set(i, true);
        });

        let to_project = Array.from(toProjectMask.array()).map(i => items[i][0]);

        if (toProjectMask.count())
            this._postToAllWorkers({ 
                project: to_project,
                batch: batchId,
                zoom: z,
                smoothFactor: this.smoothFactor,
            });
    },

    addItem: function(A) {
        if (!this._items)
            this._items = {}

        this._items[A.id] = A;
        msg = {addItems: {}};
        msg.addItems[A.id] = {llt: A.latLngTime, bounds: A.bounds};

        this._postToWorker(msg, [A.latLngTime.buffer]);
    },

    removeItems: function(ids) {
        this._postToAllWorkers({removeItems: ids});
    },

    _postToAllWorkers: function(msg) {
        for (const worker of this._workers)
            worker.postMessage(msg);
    }, 

    _postToWorker: function(msg, transferables) {
        let w = this._currentWorker || 0,
            n = this.options.numWorkers;

        this._currentWorker = (w + 1) % n;
        msg.ts = performance.now();

        this._workers[w].postMessage(msg, transferables);
        // console.log(`${msg.ts} ${msg.id} posted to ${w}`);
    },

    _handleWorkerMessage: function(event) {
        const msg = event.data;
        if ("project" in msg) {

            const batch = msg.batch,
                  workerName = msg.name,
                  zoom = msg.zoom;

            for (let [id, P] of Object.entries(msg.projected)) {
                let A = this._items[id];
                A.projected[zoom] = P;
                this._afterProjected(A, msg.zoom, batch);
            }

        } else if ("pong" in msg) {
            if (msg.pong) {
                msg.ping = msg.pong;
                this._postToWorkers(msg);
            } else {
                let elapsed = performance.now() - msg.ts;
                console.log(`ping-pong took ${elapsed}`);
            }

        }
    },

    _afterProjected: function(A, zoom, batch) {
    
        const jobIndex = this._jobIndex;
        jobIndex[batch].count--;

        if (jobIndex[batch].count || zoom != this._zoom)
            return

        // this batch is done
        delete this._jobIndex[batch];

        elapsed = performance.now() - batch;
        console.log(`batch ${batch} took ${elapsed}`);
        
        if (this.options.showPaths)
            this.drawPaths();

        let d = this.setDrawRect();

        if (d) {
            this._lineCtx.strokeStyle = "rgba(0,255,0,0.5)";
            this._lineCtx.strokeRect(d.x, d.y, d.w, d.h);
        }
    },

    _drawPath: function(ctx, points, segMask, pxOffset, lineWidth, strokeStyle, opacity, isolated=true) {
        const P = points,
              ox = pxOffset.x,
              oy = pxOffset.y;

        if (isolated)
            ctx.beginPath();

        segMask.forEach(idx => {
            const i = 3 * idx,
                  p1x = P[i]   + ox, p1y = P[i+1] + oy,
                  p2x = P[i+3] + ox, p2y = P[i+4] + oy;

                ctx.moveTo(p1x, p1y);
                ctx.lineTo(p2x, p2y);
        });

        if (isolated) {
            ctx.globalAlpha = opacity;
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = strokeStyle;
            ctx.stroke();
        }
    },

    // Draw all paths for the current items
    //  This is more efficient than calling drawPath repeatedly
    //   for each activity, since we group strokes together.
    drawPaths: function() {
        const zoom = this._zoom,
              ctx = this._lineCtx,
              pxOffset = this._pxOffset,
              items = Object.values(this._items),
              numItems = items.length,
              pathColors = new Set(items.map(A => A.pathColor));

        this.clearCanvas();

        for (const status of ["selected", "normal"]) {
            const query = (status=="selected")? A => !!A.highlighted : A => !A.highlighted;
        
            for (const color of pathColors) {
                let bucket = [];
                
                for (const A of items){
                    if (A.inView && (A.pathColor == color) && query(A))
                        bucket.push(A);
                }

                if (!bucket.length) continue;

                ctx.lineWidth = this.options[status].pathWidth;
                ctx.globalAlpha = this.options[status].pathOpacity;
                ctx.strokeStyle = color;

                ctx.beginPath();

                for (const A of bucket){
                    const projectedPoints = A.projected[zoom].P;
                    A.segMask = this._segMask(this._pxBounds, projectedPoints, A.segMask);
                    if (A.segMask.isEmpty()) {
                        A.inView = false;
                        continue;
                    }
                    this._drawPath(
                        this._lineCtx,
                        projectedPoints,
                        A.segMask,
                        this._pxOffset,
                        null,
                        null,
                        null,
                        isolated=false
                    );
                }

                ctx.stroke();
            }
        }
    },

    setDrawRect: function() {
        const canvas = this._lineCanvas,
              zoom = this._zoom;
        let anySegs = false,
            xmin, xmax, ymin, ymax;

        // find the pixel bounds of all relevant segments
        for (const A of Object.values(this._items)) {
            if (!A.inView || A.segMask.isEmpty() || !A.projected[zoom])
                continue;
            anySegs = true;
            let points = A.projected[zoom].P;
            A.segMask.forEach((idx) => {
                const i = 3*idx,
                      px = points[i],
                      py = points[i+1];

                if (!xmin || (px < xmin)) xmin = px;
                if (!xmax || (px > xmax)) xmax = px;
                if (!ymin || (py < ymin)) ymin = py;
                if (!ymax || (py > ymax)) ymax = py;     
            });
        }

        if (!anySegs) {
            // no paths on screen in this view
            this._drawRect = null;
            return null;
        }

        const pxOffset = this._pxOffset,
              pad = (this._dotSize || 25) + 5;

        xmin = ~~Math.max(xmin + pxOffset.x - pad, 0);
        xmax = ~~Math.min(xmax + pxOffset.x + pad, canvas.width);
        ymin = ~~Math.max(ymin + pxOffset.y - pad, 0);
        ymax = ~~Math.min(ymax + pxOffset.y + pad, canvas.height);
        
        this._drawRect = {
            x: xmin,
            y: ymin,
            w: xmax - xmin,
            h: ymax - ymin
        };
        return this._drawRect
    },

    clearCanvas: function(ctx) {
        if (this._drawRect === null)
            return;

        const canvas = this._lineCanvas;
              defaultRect = {x:0, y:0, w: canvas.width, h: canvas.height};
        
        let rect;
        
        if (ctx){
            rect = this._drawRect || defaultRect;
            ctx.clearRect( rect.x, rect.y, rect.w, rect.h );
        }
        else {
            rect = defaultRect;
            this._lineCtx.clearRect( rect.x, rect.y, rect.w, rect.h );
            this._dotCtx.clearRect( rect.x, rect.y, rect.w, rect.h );
        }
    },

    getSelected: function(selectPxBounds) {
        const z = this._zoom,
              pxOffset = this._pxOffset,
              ox = pxOffset.x,
              oy = pxOffset.y;

        let selectedIds = [];

        for (let A of this._items.values()) {
            if (!A.inView)
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

    // --------------------------------------------------------------------
    drawDots: function( now, start, P, dP, segMask, dotColor, highlighted) {
        const idxArray = segMask.array(),
              n = idxArray.length,
              firstT = P[3*idxArray[0]+2],
              lastT = P[3*idxArray[n-1]+2],
              s = this._timeScale * ( now - start + firstT),
              period = this._period,
              ctx = this._dotCtx,
              dotSize = this._dotSize,
              dotOffset = dotSize / 2.0,
              two_pi = this.two_pi,
              xOffset = this._pxOffset.x,
              yOffset = this._pxOffset.y,
              g = this._gifPatch,
              dotType = highlighted? "selected":"normal";

        let timeOffset = s % period,
            count = 0,
            idx = idxArray[0],
            pi = 3 * idx,
            di = 2 * idx,
            dx = dP[di],
            dy = dP[di+1],
            px = P[pi], 
            py = P[pi+1],
            pt = P[pi+2];

        if (this.options.colorAll || highlighted) {
            ctx.fillStyle = dotColor || this.options[dotType].dotColor;
        }


        if ( timeOffset < 0 ) {
            timeOffset += period;
        }
        ctx.beginPath();

        for (let t=timeOffset, i=0, dt, t2, idx; t < lastT; t += period) {
            t2 = P[pi+5];
            if (t >= t2) {
                while ( t >= t2 ) {
                    if ( ++i == n )
                        return count;
                    idx = idxArray[i];
                    pi = 3 * idx;
                    t2 = P[pi+5];
                }
                di = 2 * idx;

                px = P[pi];
                py = P[pi+1];
                pt = P[pi+2];
                dx = dP[di];
                dy = dP[di+1];
            }

            dt = t - pt;

            if ( dt > 0 ) {
                let lx = px + dx * dt + xOffset,
                    ly = py + dy * dt + yOffset;

                if ( highlighted & !g)
                    ctx.arc( lx, ly, dotSize, 0, two_pi );
                else
                    ctx.rect( lx - dotOffset, ly - dotOffset, dotSize, dotSize );
                count++;
            }
        }
        ctx.fill();

        if ( highlighted & !g)
            ctx.stroke();

        return count;
    },

    drawLayer: function(now) {
        if ( !this._map ) {
            return;
        }

        let ctx = this._dotCtx,
            zoom = this._zoom,
            canvas = this._dotCanvas,
            count = 0,
            t0 = performance.now(),
            highlighted_items = [],
            zf = this._zoomFactor = 1 / Math.pow( 2, zoom );

        ctx.fillStyle = this.options.normal.dotColor;

        this._timeScale = this.C2 * zf;
        this._period = this.C1 * zf;
        this._dotSize = Math.max(1, ~~(this.dotScale * Math.log( zoom ) + 0.5));

        this.clearCanvas(ctx);

        for ( const A of Object.values(this._items) ) {
            if (!A.inView || !A.projected[zoom])
                continue; 

            if ( A.highlighted ) {
                highlighted_items.push( A );
            } else {
                const P = A.projected[zoom];
                count += this.drawDots(now, A.startTime, P.P, P.dP, A.segMask, A.dotColor, false);
            }
        }

        // Now plot highlighted paths
        if ( highlighted_items.length ) {
            ctx.globalAlpha = this.options.selected.dotOpacity
            for (const A in highlighted_items) {
                count += this.drawDots(now, A.startTime, P.P, P.dP, A.segMask, A.dotColor, true);
            }
            ctx.globalAlpha = this.options.normal.dotOpacity
        }

        if (fps_display) {
            let periodInSecs = this.periodInSecs(),
                progress = (((now/1000) % periodInSecs) / periodInSecs).toFixed(1),
                elapsed = ( performance.now() - t0 ).toFixed( 1 );

            fps_display.update( now, `z=${this._zoom}, dt=${elapsed} ms/f, n=${count}` );
        }
    },

   
    // --------------------------------------------------------------------
    animate: function() {
        this._paused = false;
        if ( this._timePaused ) {
            this._timeOffset = Date.now() - this._timePaused;
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
        if (!this._frame) {
            return;
        }
        this._frame = null;

        let ts = Date.now(),
            now = ts - this._timeOffset;

        if ( this._paused || this._mapMoving ) {
            // Ths is so we can start where we left off when we resume
            this._timePaused = ts;
            return;
        }


        if (now - this.lastCalledTime > this.minDelay) {
            this.lastCalledTime = now;
            this.drawLayer( now );
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
                workers: 8,
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
            this.drawLayer(frameTime);

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
        let itemsList = Object.values( this._items ),
            numItems = itemsList.length,
            i = 0;

        this._colorPalette = colorPalette(numItems, this.options.dotAlpha);
        for ( item of itemsList )
            item.dotColor = this._colorPalette[ i++ ];
    }

} );  // end of L.DotLayer definition

L.dotLayer = function( items, options ) {
    return new L.DotLayer( items, options );
};



/*
    From "Making annoying rainbows in javascript"
    A tutorial by jim bumgardner
*/
function makeColorGradient(frequency1, frequency2, frequency3,
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
};

function colorPalette(n, alpha) {
    center = 128;
    width = 127;
    steps = 10;
    frequency = 2*Math.PI/steps;
    return makeColorGradient(frequency,frequency,frequency,0,2,4,center,width,n,alpha);
};


