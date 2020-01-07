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
        this._items = items || null;
        this._timeOffset = 0;
        this._colorPalette = [];
        this._overlapsArray = null;
        L.setOptions( this, options );
        this._paused = this.options.startPaused;
        this._timePaused = Date.now();

        this.heatflask_icon = new Image();
        this.heatflask_icon.src = "static/logo.png";

        this.strava_icon = new Image();
        this.strava_icon.src = "static/pbs4.png";
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
            movestart: function() {
                // this._mapMoving = true;
            },
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

    Simplifier: {
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

        // basic distance-based simplification
        simplifyRadialDist: function(points, sqTolerance) {

            let prevPoint = points[0],
                newPoints = [prevPoint],
                point;

            for (let i = 1, len = points.length; i < len; i++) {
                point = points[i];

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

        simplify: function(points, tolerance, highestQuality) {

            if (points.length <= 2) return points;

            const sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1;

            // console.time("RDsimp");
            points = highestQuality ? points : this.simplifyRadialDist(points, sqTolerance);
            // console.timeEnd("RDsimp");
            // console.log(`n = ${points.length}`)
            // console.time("DPsimp")
            points = this.simplifyDouglasPeucker(points, sqTolerance);
            // console.timeEnd("DPsimp");
            return points;
        }
    },

    CRS: {
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
    },

    _overlaps: function(mapBounds, activityBounds) {
        let sw = mapBounds._southWest,
            ne = mapBounds._northEast,
            sw2 = activityBounds._southWest,
            ne2 = activityBounds._northEast,

            latOverlaps = (ne2.lat > sw.lat) && (sw2.lat < ne.lat),
            lngOverlaps = (ne2.lng > sw.lng) && (sw2.lng < ne.lng);

        return latOverlaps && lngOverlaps;
    },

    itemMask: function(mapBounds, bitArray=null) {
        const items = this._items,
              itemKeys = Object.keys(items),
              L = itemKeys.length;

        if (bitarray === null)
            bitarray = new FastBitArray(L);


        for (i = 0; i < L; i++) {
            let itemBounds = items[itemKeys[i]];
            bitarray.set(i, this._overlaps(mapBounds, itemBounds));
        }
        return bitarray
    },

    _contains: function (pxBounds, point) {
        let x = point[0],
            y = point[1];

        return (pxBounds.min.x <= x) && (x <= pxBounds.max.x) &&
               (pxBounds.min.y <= y) && (y <= pxBounds.max.y);
    },

    _segMask: function(pxBounds, projected, bitarray=null) {
        const L = (projected.length / 3) - 1;
        if (bitarray === null)
            bitarray = new FastBitArray(L);

        for (let idx=0; idx<L; idx++) {
            let i = 3*idx,
                p = [projected[i], projected[i+1]];
            bitarray.set(idx, this._contains(pxBounds, p));
        }
        return bitarray
    },

    _project: function(llt, zoom, smoothFactor, hq=false, ttol=60) {
        let numPoints = llt.length / 3,
            points = new Array(numPoints);

        // console.time("project");
        for (let i=0; i<numPoints; i++) {
            let idx = 3*i,
                p = this.CRS.project( [llt[idx], llt[idx+1]], zoom );
            points[i] = [ p[0], p[1], llt[idx+2] ];
        };
        // console.timeEnd("project");
        // console.log(`n = ${points.length}`);

        // console.time("simplify");
        points = this.Simplifier.simplify(points, smoothFactor, hq);
        // console.timeEnd("simplify");
        // console.log(`n = ${points.length}`);

        // now points is an Array of points, so we put it
        // into a Float32Array buffer
        // TODO: modify Simplify to work directly with TypedArray 
        numPoints = points.length;

        let P = new Float32Array(numPoints * 3);
        for (let idx=0; idx<numPoints; idx++) {
            let point = points[idx],
                i = 3 * idx;
            P[i] = point[0];
            P[i+1] = point[1];
            P[i+2] = point[2];
        }

        // Compute speed for each valid segment
        // A segment is valid if it doesn't have too large time gap
        let numSegs = numPoints - 1,
            dP = new Float32Array(numSegs * 2);

        for ( let idx = 0; idx < numSegs; idx++ ) {
            let i = 3 * idx,
                j = 2 * idx,
                dt = P[i+5] - P[i+2];

            dP[j] = (P[i+3] - P[i]) / dt;
            dP[j+1] = (P[i+4] - P[i+1]) / dt;
        }

        return {P: P, dP: dP}
    },

    _setupWindow: function() {
        if ( !this._map || !this._items ) {
            return;
        }
        const perf_t0 = performance.now();

        // reset map orientation
        this._drawRect = null;
        this.clearCanvas();

        let topLeft = this._map.containerPointToLayerPoint( [ 0, 0 ] );
        L.DomUtil.setPosition( this._dotCanvas, topLeft );
        L.DomUtil.setPosition( this._lineCanvas, topLeft );

        // Get new map orientation
        this._zoom = this._map.getZoom();
        this._center = this._map.getCenter;
        this._size = this._map.getSize();

        this._latLngBounds = this._map.getBounds();
        this._mapPanePos = this._map._getMapPanePos();
        this._pxOrigin = this._map.getPixelOrigin();
        this._pxOffset = this._mapPanePos.subtract( this._pxOrigin );
        this._pxBounds = this._map.getPixelBounds();

        let ppos = this._mapPanePos,
            pxOrigin = this._pxOrigin,
            pxBounds = this._pxBounds,
            z = this._zoom;

        this._dotCtx.strokeStyle = this.options.selected.dotStrokeColor;
        this._dotCtx.lineWidth = this.options.selected.dotStrokeWidth;

        // console.log( `zoom=${z}\nmapPanePos=${ppos}\nsize=${this._size}\n` +
        //             `pxOrigin=${pxOrigin}\npxBounds=[${pxBounds.min}, ${pxBounds.max}]\n`+
        //              `pxOffset=${this._pxOffset}`);

        const mapBounds = this._latLngBounds,
              smoothFactor = this.smoothFactor;

        let count = {projected: 0, in:0, out:0};
        console.time("all items")
        for (let [id, A] of Object.entries(this._items)) {
            // console.log("Activity: "+id, A);
            // console.time("activity");
            A.inView = this._overlaps(mapBounds, A.bounds);

            if ( !A.inView ) {
                count.out++
                continue;
            }

            count.in++
            if ( !A.projected )
                A.projected = {};

            // project activity latLngs to pane coords
            if (!A.projected[ z ]){
                // console.time("projectSimplify");
                A.projected[z] = this._project(A.latLngTime, z, this.smoothFactor, hq=false);
                // console.timeEnd("projectSimplify");
                count.projected++;
            }

            let projectedPoints = A.projected[z].P,
                segMask = A.segMask = this._segMask(this._pxBounds, projectedPoints, A.segMask);

            if (this.options.showPaths) {
                // console.time("drawPath");

                const lineType = A.highlighted? "selected":"normal",
                      lineWidth = this.options[lineType].pathWidth,
                      strokeStyle = A.pathColor || this.options[lineType].pathColor,
                      opacity = this.options[lineType].pathOpacity;

                this._drawPath(
                    this._lineCtx,
                    projectedPoints,
                    segMask,
                    this._pxOffset,
                    lineWidth,
                    strokeStyle,
                    opacity
                );
                // console.timeEnd("drawPath");
            }
            
            // console.timeEnd("activity");
            // this._processedItems[ id ] = {
            //     dP: dP,
            //     P: P,
            //     dotColor: A.dotColor,
            //     startTime: A.startTime,
            //     totSec: P.slice( -1 )[ 0 ]
            // };
        };

        // if (this.options.showPaths)
        //     this.drawPaths();

        console.timeEnd("all items");
        console.log(count);

        d = this.setDrawRect();
        this._lineCtx.strokeStyle = "rgba(0,255,0,0.5)";
        this._lineCtx.strokeRect(d.x, d.y, d.w, d.h);
        // console.log("drawRect", this._drawRect);
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
              pxOffset = this._pxOffset;

        // TODO: finish writing this

    },

    setDrawRect: function() {
        let llb = L.latLngBounds();

        for (const A of Object.values(this._items))
            llb.extend(A.bounds);

        const pad = (this._dotSize || 25 ) + 5,
              pxOffset = this._pxOffset,
              canvas = this._lineCanvas,
              z = this._zoom,
              sw = llb._southWest,
              ne = llb._northEast,
              pSW = this.CRS.project( [sw.lat, sw.lng], z ),
              pNE = this.CRS.project( [ne.lat, ne.lng], z ),

              xmin = Math.max(pSW[0] + pxOffset.x - pad, 0),
              xmax = Math.min(pNE[0] + pxOffset.x + pad, canvas.width)
              ymin = Math.max(pNE[1] + pxOffset.y - pad, 0),
              ymax = Math.min(pSW[1] + pxOffset.y + pad, canvas.height);
        
        this._drawRect = {
            x: xmin,
            y: ymin,
            w: xmax - xmin,
            h: ymax - ymin
        };
        return this._drawRect
    },

    clearCanvas: function(ctx) {
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

    // --------------------------------------------------------------------
    drawDots: function( obj, now, highlighted ) {
        let P = obj.P,
            dP = obj.dP,
            len_dP = dP.length,
            totSec = obj.totSec,
            period = this._period,
            s = this._timeScale * ( now - obj.startTime ),
            xmax = this._size.x,
            ymax = this._size.y,
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
            idx = dP[0],
            dx = dP[1],
            dy = dP[2],
            px = P[idx], 
            py = P[idx+1],
            pt = P[idx+2];

        if (this.options.colorAll || highlighted) {
            ctx.fillStyle = obj.dotColor || this.options[dotType].dotColor;
        }


        if ( timeOffset < 0 ) {
            timeOffset += period;
        }

        for (let t=timeOffset, i=0, dt; t < totSec; t += period) {
            if (t >= P[idx+5]) {
                while ( t >= P[idx+5] ) {
                    i += 3;
                    idx = dP[i];
                    if ( i >= len_dP ) {
                        return count;
                    }
                }
                px = P[idx];
                py = P[idx+1];
                pt = P[idx+2];
                dx = dP[i+1];
                dy = dP[i+2];
            }

            dt = t - pt;

            if ( dt > 0 ) {
                let lx = px + dx * dt + xOffset,
                    ly = py + dy * dt + yOffset;

                if ( highlighted & !g) {
                    ctx.beginPath();
                    ctx.arc( lx, ly, dotSize, 0, two_pi );
                    ctx.fill();
                    ctx.closePath();
                    ctx.stroke();
                } else {
                    ctx.fillRect( lx - dotOffset, ly - dotOffset, dotSize, dotSize );
                }
                count++;
            }
        }
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

        for ( let A of this._items.values() ) {
            item = pItems[ id ];
            if ( A.highlighted ) {
                highlighted_items.push( item );
            } else {
                count += this.drawDots( item, now, false );
            }
        }

        // Now plot highlighted paths
        let hlen = highlighted_items.length;
        if ( hlen ) {
            ctx.globalAlpha = this.options.selected.dotOpacity
            for (let i = 0; i < hlen; i++ ) {
                item = highlighted_items[ i ];
                count += this.drawDots( item, now, true );
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

    getSelected: function(selectPxBounds) {
        const z = this._zoom,
              pxOffset = this._pxOffset,
              ox = pxOffset.x,
              oy = pxOffset.y;

        let selectedIds = [];

        for (A of this._items.values()) {
            if (!A.inView)
                continue;

            P = A.projected[z].P;

            for (let j=0, len=P.length; j<len; j++){
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

        // let ts = Date.now(),
        //     now = ts - this._timeOffset;

        // if ( this._paused || this._mapMoving ) {
        //     // Ths is so we can start where we left off when we resume
        //     this._timePaused = ts;
        //     return;
        // }


        // if (now - this.lastCalledTime > this.minDelay) {
        //     this.lastCalledTime = now;
        //     this.drawLayer( now );
        // }

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
            numItems = itemsList.length;

        this._colorPalette = colorPalette(numItems, this.options.dotAlpha);
        for ( item of itemsList ) {
            itemsList[ i ].dotColor = this._colorPalette[ i ];
        }
   
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


