/*
  DotLayer Efrem Rensi, 2020,
  inspired by L.CanvasLayer by Stanislav Sumbera,  2016 , sumbera.com
  license MIT
*/

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
        dotAlpha: 0.8,
        normal: {
            dotColor: "#000000",
            pathColor: "#000000",
            pathAlpha: 0.7,
            pathWidth: 1
        },
        selected: {
            dotColor: "#FFFFFF",
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
        let selectedIds = this._setupWindow(pxBounds);
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

            var dx = p1.x - p2.x,
                dy = p1.y - p2.y;

            return dx * dx + dy * dy;
        },

        // square distance from a point to a segment
        getSqSegDist: function(p, p1, p2) {

            var x = p1.x,
                y = p1.y,
                dx = p2.x - x,
                dy = p2.y - y;

            if (dx !== 0 || dy !== 0) {

                var t = ((p.x - x) * dx + (p.y - y) * dy) / (dx * dx + dy * dy);

                if (t > 1) {
                    x = p2.x;
                    y = p2.y;

                } else if (t > 0) {
                    x += dx * t;
                    y += dy * t;
                }
            }

            dx = p.x - x;
            dy = p.y - y;

            return dx * dx + dy * dy;
        },
        // rest of the code doesn't care about point format

        // basic distance-based simplification
        simplifyRadialDist: function(points, sqTolerance) {

            var prevPoint = points[0],
                newPoints = [prevPoint],
                point;

            for (var i = 1, len = points.length; i < len; i++) {
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
            var maxSqDist = sqTolerance,
                index;

            for (var i = first + 1; i < last; i++) {
                var sqDist = this.getSqSegDist(points[i], points[first], points[last]);

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
            var last = points.length - 1;

            var simplified = [points[0]];
            this.simplifyDPStep(points, 0, last, sqTolerance, simplified);
            simplified.push(points[last]);

            return simplified;
        },

        simplify: function(points, tolerance, highestQuality) {

            if (points.length <= 2) return points;

            var sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1;

            points = highestQuality ? points : this.simplifyRadialDist(points, sqTolerance);
            points = this.simplifyDouglasPeucker(points, sqTolerance);

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
        },

        // distance between two geographical points using spherical law of cosines approximation
        distance: function(latlngpt1, latlngpt2) {
            const rad = this.RAD,
                lat1 = latlngpt1[0] * rad,
                lat2 = latlngpt2[0] * rad,
                R2 = rad / 2,
                sinDLat = Math.sin((latlngpt2[0] - latlngpt1[0]) * R2),
                sinDLon = Math.sin((latlngpt2[1] - latlngpt1[1]) * R2),
                a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon,
                c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return this.EARTH_RADIUS * c;
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

    _contains: function (pxBounds, point) {
        let x = point[0],
            y = point[1];

        return (pxBounds.min.x <= x) && (x <= pxBounds.max.x) &&
               (pxBounds.min.y <= y) && (y <= pxBounds.max.y);
    },

    _project: function(A) {
        const llt = A.latLngTime,
            numPoints = llt.length / 3;

        let projectedObjs = new Array(numPoints);

        for (let i=0; i<numPoints; i++) {
            let idx = 3*i,
                p = this.CRS.project( [llt[idx], llt[idx+1]], this._zoom );
            p = new L.Point(p[0], p[1]);
            p.t = llt[idx+2];
            projectedObjs[i] = p;
        }

        projectedObjs = this.Simplifier.simplify( projectedObjs, this.smoothFactor, false);

        // now projectedObjs is an Array of objects, so we convert it
        // to a Float32Array
        let numObjs = projectedObjs.length,

        projected = new Float32Array(numObjs * 3);
        for (let i=0, obj, idx; i<numObjs; i++) {
            obj = projectedObjs[i];
            idx = 3 * i;
            projected[idx] = obj.x;
            projected[idx+1] = obj.y;
            projected[idx+2] = obj.t;
        }
        return projected;
    },

    _setupWindow: function(selectPxBounds=null) {
        if ( !this._map || !this._items ) {
            return;
        }
        const perf_t0 = performance.now();

        let topLeft = this._map.containerPointToLayerPoint( [ 0, 0 ] ),
            lineCtx = this._lineCtx,
            dotCtx = this._dotCtx;

        dotCtx.clearRect( 0, 0, this._dotCanvas.width, this._dotCanvas.height );
        L.DomUtil.setPosition( this._dotCanvas, topLeft );

        lineCtx.clearRect( 0, 0, this._lineCanvas.width, this._lineCanvas.height );
        L.DomUtil.setPosition( this._lineCanvas, topLeft );


        // Get new map orientation
        this._zoom = this._map.getZoom();
        this._center = this._map.getCenter;
        this._size = this._map.getSize();


        this._latLngBounds = this._map.getBounds();
        this._mapPanePos = this._map._getMapPanePos();
        this._pxOrigin = this._map.getPixelOrigin();
        this._pxBounds = this._map.getPixelBounds();
        this._pxOffset = this._mapPanePos.subtract( this._pxOrigin );

        let z = this._zoom,
            ppos = this._mapPanePos,
            pxOrigin = this._pxOrigin,
            pxBounds = this._pxBounds,
            items = this._items;

        this._dotCtx.strokeStyle = this.options.selected.dotStrokeColor;
        this._dotCtx.lineWidth = this.options.selected.dotStrokeWidth;
        this._zoomFactor = 1 / Math.pow( 2, z );

        let tThresh = this._tThresh * DotLayer._zoomFactor;

        // console.log( `zoom=${z}\nmapPanePos=${ppos}\nsize=${this._size}\n` +
        //             `pxOrigin=${pxOrigin}\npxBounds=[${pxBounds.min}, ${pxBounds.max}]`
        //              );


        this._processedItems = {};

        let pxOffx = this._pxOffset.x,
            pxOffy = this._pxOffset.y,
            selectedIds = [],
            overlaps = false,
            llb = this._latLngBounds;

        for ( let id in items ) {
            if (!items.hasOwnProperty(id)) {
                //The current property is not a direct property of p
                continue;
            }

            let A = this._items[ id ],
                drawingLine = false;

            try {
                overlaps = this._overlaps(llb, A.bounds)
            } catch(err) {
                console.error(err);
                console.log("there is a problem with ", A);
                delete this._items[ id ];
                continue;
            }
            // -----------------------------------------------

            if (!A.latLngTime || !overlaps)
                continue;

            if ( !A.projected )
                A.projected = {};

            if (!A.projected[ z ])
                A.projected[z] = this._project(A);
                
            let projected = A.projected[z];

            // determine whether or not each projected point is in the
            // currently visible area
            let numProjected = projected.length / 3,
                numSegs = numProjected-1,
                segGood = new Int8Array(numProjected-2),
                goodSegCount = 0,
                t0 = projected[2],
                in0 = this._contains(pxBounds, projected.slice(0, 2));

            for (let i=1, idx; i<numSegs; i++) {
                let idx = 3 * i,
                    p = [projected[idx], projected[idx+1]],
                    in1 = this._contains(pxBounds, p),
                    t1 = projected[idx+2],
                    isGood = ((in0 || in1) && (t1-t0 < tThresh))? 1:0;
                segGood[i-1] = isGood;
                goodSegCount += isGood;
                in0 = in1;
                t0 = t1;
            }

            // console.log(segGood);
            if (goodSegCount == 0) {
                continue;
            }

            let dP = new Float32Array(goodSegCount*3);

            for ( let i=0, j=0; i < numSegs; i++ ) {
                // Is the current segment in the visible area?
                if ( segGood[i] ) {
                    let pidx = 3 * i,
                        didx = 3 * j,
                        p = projected.slice(pidx, pidx+6);
                    j++;

                    // p[0:2] are p1.x, p1.y, and p1.t
                    // p[3:5] are p2.x, p2.y, and p2.t

                    // Compute derivative for this segment
                    dP[didx] = pidx;
                    dt = p[5] - p[2];
                    dP[didx+1] = (p[3] - p[0]) / dt;
                    dP[didx+2] = (p[4] - p[1]) / dt;

                    if (this.options.showPaths) {
                        if (!drawingLine) {
                            lineCtx.beginPath();
                            drawingLine = true;
                        }
                        // draw polyline segment from p1 to p2
                        let c1x = ~~(p[0] + pxOffx),
                            c1y = ~~(p[1] + pxOffy),
                            c2x = ~~(p[3] + pxOffx),
                            c2y = ~~(p[4] + pxOffy);
                        lineCtx.moveTo(c1x, c1y);
                        lineCtx.lineTo(c2x, c2y);
                    }
                }
            }

            if (this.options.showPaths) {
                if (drawingLine) {
                    lineType = A.highlighted? "selected":"normal";
                    lineCtx.globalAlpha = this.options[lineType].pathOpacity;
                    lineCtx.lineWidth = this.options[lineType].pathWidth;
                    lineCtx.strokeStyle = A.pathColor || this.options[lineType].pathColor;
                    lineCtx.stroke();
                } else {
                    lineCtx.stroke();
                }
            }

            if (selectPxBounds){

                for (let i=0, len=projected.length; i<len; i+=3){
                    let x = projected[i] + this._pxOffset.x,
                        y = projected[i+1] + this._pxOffset.y;

                    if ( this._contains(selectPxBounds, [x, y]) ) {
                        selectedIds.push(A.id);
                        break;
                    }
                }

            }

            this._processedItems[ id ] = {
                dP: dP,
                P: projected,
                dotColor: A.dotColor,
                startTime: A.startTime,
                totSec: projected.slice( -1 )[ 0 ]
            };
        }

        elapsed = ( performance.now() - perf_t0 ).toFixed( 2 );
        // console.log(`dot context update took ${elapsed} ms`);
        // console.log(this._processedItems);
        return selectedIds;
    },


    // --------------------------------------------------------------------
    drawDots: function( obj, now, highlighted ) {
        var P = obj.P,
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

        var timeOffset = s % period,
            count = 0,
            idx = dP[0],
            dx = dP[1],
            dy = dP[2],
            p = P.slice(idx, idx+3 );

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
                p = P.slice(idx, idx+3);
                dx = dP[i+1];
                dy = dP[i+2];
            }

            dt = t - p[2];

            if ( dt > 0 ) {
                let lx = p[0] + dx * dt + xOffset,
                    ly = p[1] + dy * dt + yOffset;

                if ( ( lx >= 0 && lx <= xmax ) && ( ly >= 0 && ly <= ymax ) ) {
                    if ( highlighted & !g) {
                        ctx.beginPath();
                        ctx.arc( ~~(lx+0.5), ~~(ly+0.5), dotSize, 0, two_pi );
                        ctx.fill();
                        ctx.closePath();
                        ctx.stroke();
                    } else {
                        ctx.fillRect( ~~(lx - dotOffset + 0.5), ~~(ly - dotOffset + 0.5), dotSize, dotSize );
                    }
                    count++;
                }
            }
        }
        return count;
    },

    drawLayer: function(now ) {
        if ( !this._map ) {
            return;
        }

        let ctx = this._dotCtx,
            zoom = this._zoom,
            count = 0,
            t0 = performance.now(),
            item,
            items = this._items,
            pItem,
            pItems = this._processedItems,
            highlighted_items = [],
            zf = this._zoomFactor;

        ctx.clearRect( 0, 0, this._dotCanvas.width, this._dotCanvas.height );
        ctx.fillStyle = this.options.normal.dotColor;

        this._timeScale = this.C2 * zf;
        this._period = this.C1 * zf;
        this._dotSize = Math.max(1, ~~(this.dotScale * Math.log( this._zoom ) + 0.5));



        for (let id in pItems ) {
            item = pItems[ id ];
            if ( items[ id ].highlighted ) {
                highlighted_items.push( item );
            } else {
                count += this.drawDots( item, now, false );
            }
        }

        // Now plot highlighted paths
        let hlen = highlighted_items.length;
        if ( hlen ) {
            for (let i = 0; i < hlen; i++ ) {
                item = highlighted_items[ i ];
                count += this.drawDots( item, now, true );
            }
        }


        if (fps_display) {
            let periodInSecs = this.periodInSecs(),
                progress = ((now/1000) % periodInSecs).toFixed(1),
                elapsed = ( performance.now() - t0 ).toFixed( 1 );

            fps_display.update( now, `${elapsed} ms/f, n=${count}, z=${this._zoom},\nP=${progress}/${periodInSecs.toFixed(2)}` );
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
            numItems = itemsList.length;

        this._colorPalette = colorPalette(numItems, this.options.dotAlpha);
        for ( let i = 0; i < numItems; i++ ) {
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
        palette[i] = `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return palette;
}

function colorPalette(n, alpha) {
    center = 128;
    width = 127;
    steps = 10;
    frequency = 2*Math.PI/steps;
    return makeColorGradient(frequency,frequency,frequency,0,2,4,center,width,n,alpha);
}


