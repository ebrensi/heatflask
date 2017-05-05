/*
  DotLayer Efrem Rensi, 2017,
  based on L.CanvasLayer by Stanislav Sumbera,  2016 , sumbera.com
  license MIT
*/

// -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
//------------------------------------------------------------------------------
L.DomUtil.setTransform = L.DomUtil.setTransform || function( el, offset, scale ) {
    var pos = offset || new L.Point( 0, 0 );

    el.style[ L.DomUtil.TRANSFORM ] =
        ( L.Browser.ie3d ?
            "translate(" + pos.x + "px," + pos.y + "px)" :
            "translate3d(" + pos.x + "px," + pos.y + "px,0)" ) +
        ( scale ? " scale(" + scale + ")" : "" );
};

// -- support for both  0.0.7 and 1.0.0 rc2 leaflet
L.DotLayer = ( L.Layer ? L.Layer : L.Class ).extend( {

    _pane: "shadowPane",
    two_pi: 2 * Math.PI,
    target_fps: 32,
    smoothFactor: 1.0,
    _tThresh: 100000000.0,
    C1: 1000000.0,
    C2: 200.0,

    options: {
        startPaused: false,
        showPaths: true,
        normal: {
            dotColor: "#000000",
            pathColor: "#000000",
            pathOpacity: 0.5,
            pathWidth: 1
        },
        selected: {
            dotColor: "#FFFFFF",
            dotStrokeColor: "#FFFFFF",
            pathColor: "#000000",
            pathOpacity: 0.7,
            pathWidth: 3
        }
    },

    // -- initialized is called on prototype
    initialize: function( items, options ) {
        this._map    = null;
        this._canvas = null;
        this._canvas2 = null;
        this._capturing = null;
        this._ctx = null;
        this._ctx2 = null;
        this._frame  = null;
        this._items = items || null;
        this._timeOffset = 0;
        this._colorPalette = [];
        L.setOptions( this, options );
        this._paused = this.options.startPaused;
        if (this._paused){
            this._timePaused = Date.now();
        }
    },


    //-------------------------------------------------------------
    _onLayerDidResize: function( resizeEvent ) {
        let newWidth = resizeEvent.newSize.x,
            newHeight = resizeEvent.newSize.y;

        this._canvas.width = newWidth;
        this._canvas.height = newHeight;

        this._canvas2.width = newWidth;
        this._canvas2.height = newHeight;

        this._onLayerDidMove();
    },

    //-------------------------------------------------------------
    _onLayerDidMove: function() {
        this._mapMoving = false;

        let topLeft = this._map.containerPointToLayerPoint( [ 0, 0 ] );

        this._ctx.clearRect( 0, 0, this._canvas.width, this._canvas.height );
        L.DomUtil.setPosition( this._canvas, topLeft );

        this._ctx2.clearRect( 0, 0, this._canvas2.width, this._canvas2.height );
        L.DomUtil.setPosition( this._canvas2, topLeft );

        this._setupWindow();

        if ( !this._paused ) {
            this.animate();
        } else {
            this.drawLayer(this._timePaused);
        }

    },

    //-------------------------------------------------------------
    getEvents: function() {
        var events = {
            movestart: function() {
                this._mapMoving = true;
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
    onAdd: function( map ) {
        this._map = map;

        let size = this._map.getSize(),
            zoomAnimated = this._map.options.zoomAnimation && L.Browser.any3d;

        // dotlayer canvas
        this._canvas = L.DomUtil.create( "canvas", "leaflet-layer" );
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        this._ctx = this._canvas.getContext( "2d" );
        L.DomUtil.addClass( this._canvas, "leaflet-zoom-" + ( zoomAnimated ? "animated" : "hide" ) );
        map._panes.shadowPane.style.pointerEvents = "none";
        map._panes.shadowPane.appendChild( this._canvas );

        // create Canvas for polyline-ish things
        this._canvas2 = L.DomUtil.create( "canvas", "leaflet-layer" );
        this._canvas2.width = size.x;
        this._canvas2.height = size.y;
        this._ctx2 = this._canvas2.getContext( "2d" );
        this._ctx2.lineCap = "round";
        this._ctx2.lineJoin = "round";
        L.DomUtil.addClass( this._canvas2, "leaflet-zoom-" + ( zoomAnimated ? "animated" : "hide" ) );
        map._panes.overlayPane.appendChild( this._canvas2 );

        map.on( this.getEvents(), this );

        if ( this._items ) {

            // Set dotColors for these items
            let itemsList = Object.values( this._items ),
                numItems = itemsList.length;

            this._colorPalette = colorPalette(numItems);
            // this._colorPalette = createPalette( numItems );
            for ( let i = 0; i < numItems; i++ ) {
                itemsList[ i ].dotColor = this._colorPalette[ i ];
            }

            this._onLayerDidMove();
        }
    },

    //-------------------------------------------------------------
    onRemove: function( map ) {
        this.onLayerWillUnmount && this.onLayerWillUnmount(); // -- callback


        // map.getPanes().overlayPane.removeChild(this._canvas);
        map._panes.shadowPane.removeChild( this._canvas );
        this._canvas = null;

        map._panes.overlayPane.removeChild( this._canvas2 );
        this._canvas2 = null;

        map.off( this.getEvents(), this );
    },


    // --------------------------------------------------------------------
    addTo: function( map ) {
        map.addLayer( this );
        return this;
    },

    // --------------------------------------------------------------------
    LatLonToMercator: function( latlon ) {
        return {
            x: latlon.lng * 6378137 * Math.PI / 180,
            y: Math.log( Math.tan( ( 90 + latlon.lat ) * Math.PI / 360 ) ) * 6378137
        };
    },


    // -------------------------------------------------------------------
    _setupWindow: function() {
        if ( !this._map || !this._items ) {
            return;
        }

        const perf_t0 = performance.now();

        // Get new map orientation
        this._zoom = this._map.getZoom();
        this._center = this._map.getCenter;
        this._size = this._map.getSize();


        this._latLngBounds = this._map.getBounds();
        this._mapPanePos = this._map._getMapPanePos();
        this._pxOrigin = this._map.getPixelOrigin();
        this._pxBounds = this._map.getPixelBounds();
        this._pxOffset = this._mapPanePos.subtract( this._pxOrigin )._add( new L.Point( 0.5, 0.5 ) );

        var line_ctx = this._ctx2,
            z = this._zoom,
            ppos = this._mapPanePos,
            pxOrigin = this._pxOrigin,
            pxBounds = this._pxBounds,
            items = this._items;

        this._ctx.strokeStyle = this.options.selected.dotStrokeColor;

        this._dotSize = Math.max(1, ~~(Math.log( z ) + 0.5));
        this._dotOffset = ~~( this._dotSize / 2 + 0.5 );
        this._zoomFactor = 1 / Math.pow( 2, z );

        var tThresh = this._tThresh * DotLayer._zoomFactor;

        // console.log( `zoom=${z}\nmapPanePos=${ppos}\nsize=${this._size}\n` +
        //             `pxOrigin=${pxOrigin}\npxBounds=[${pxBounds.min}, ${pxBounds.max}]`
        //              );


        this._processedItems = {};

        let pxOffx = this._pxOffset.x,
            pxOffy = this._pxOffset.y;

        for ( let id in items ) {
            if (!items.hasOwnProperty(id)) {
                //The current property is not a direct property of p
                continue;
            }

            let A = this._items[ id ];
            drawingLine = false;

            // console.log("processing "+A.id);

            if ( !A.projected ) {
                A.projected = {};
            }

            if ( A.latLngTime && this._latLngBounds.overlaps( A.bounds )) {
                let projected = A.projected[ z ],
                    llt = A.latLngTime;

                // Compute projected points if necessary
                if ( !projected ) {
                    let numPoints = llt.length / 3,
                        projectedObjs = new Array(numPoints);

                    for (let i=0, p, idx; i<numPoints; i++) {
                        idx = 3*i;
                        p = this._map.project( [llt[idx], llt[idx+1]] );
                        p.t = llt[idx+2];
                        projectedObjs[i] = p;
                    }

                    projectedObjs = L.LineUtil.simplify( projectedObjs, this.smoothFactor );

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
                    A.projected[ z ] = projected;
                }


                projected = A.projected[z];
                // determine whether or not each projected point is in the
                // currently visible area
                let numProjected = projected.length / 3,
                    numSegs = numProjected -1,
                    segGood = new Int8Array(numProjected-2),
                    goodSegCount = 0,
                    t0 = projected[2],
                    in0 = this._pxBounds.contains(
                        [ projected[0], projected[1] ]
                    );


                for (let i=1, idx; i<numSegs; i++) {
                    let idx = 3 * i,
                        p = projected.slice(idx, idx+3),
                        in1 = this._pxBounds.contains(
                            [ p[0], p[1] ]
                        ),
                        t1 = p[2],
                        // isGood = (in0 && in1 && (t1-t0 < tThresh) )? 1:0;
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
                                line_ctx.beginPath();
                                drawingLine = true;
                            }
                            // draw polyline segment from p1 to p2
                            let c1x = ~~(p[0] + pxOffx),
                                c1y = ~~(p[1] + pxOffy),
                                c2x = ~~(p[3] + pxOffx),
                                c2y = ~~(p[4] + pxOffy);
                            line_ctx.moveTo(c1x, c1y);
                            line_ctx.lineTo(c2x, c2y);
                        }
                    }
                }

                if (this.options.showPaths) {
                    if (drawingLine) {
                        lineType = A.highlighted? "selected":"normal";
                        line_ctx.globalAlpha = this.options[lineType].pathOpacity;
                        line_ctx.lineWidth = this.options[lineType].pathWidth;
                        line_ctx.strokeStyle = A.path_color || this.options[lineType].pathColor;
                        line_ctx.stroke();
                    } else {
                        line_ctx.stroke();
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
        }

        elapsed = ( performance.now() - perf_t0 ).toFixed( 2 );
        // console.log(`dot context update took ${elapsed} ms`);
        // console.log(this._processedItems);
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
            ctx = this._ctx,
            dotSize = this._dotSize,
            dotOffset = this._dotOffset,
            two_pi = this.two_pi,
            xOffset = this._pxOffset.x,
            yOffset = this._pxOffset.y;

        var timeOffset = s % period,
            count = 0,
            idx = dP[0],
            dx = dP[1],
            dy = dP[2],
            p = P.slice(idx, idx+3 );

        if (highlighted) {
            ctx.fillStyle = obj.dotColor || this.options.selected.dotColor;
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
                let lx = ~~( p[0] + dx * dt + xOffset ),
                    ly = ~~( p[1] + dy * dt + yOffset );

                if ( ( lx >= 0 && lx <= xmax ) && ( ly >= 0 && ly <= ymax ) ) {
                    if ( highlighted ) {
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
        }
        return count;
    },

    drawLayer: function( now ) {
        if ( !this._map ) {
            return;
        }


        let ctx = this._ctx,
            zoom = this._zoom,
            count = 0,
            t0 = performance.now(),
            item,
            items = this._items,
            pItem,
            pItems = this._processedItems,
            highlighted_items = [],
            zf = this._zoomFactor;

        this._ctx.clearRect( 0, 0, this._canvas.width, this._canvas.height );
        this._ctx.fillStyle = this.options.normal.dotColor;

        this._timeScale = this.C2 * zf;
        this._period = this.C1 * zf;



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
        // debugger;

        let ts = Date.now(),
            now = ts - this._timeOffset,
            capturing = this._capturing;

        if ( this._paused || this._mapMoving ) {
            // Ths is so we can start where we left off when we resume
            this._timePaused = ts;
            return;
        }

         if ( this._timePaused ) {
            this._timeOffset = ts - this._timePaused;
            this._timePaused = null;
        }

        if (capturing || (now - this.lastCalledTime > this.minDelay)) {
            this.lastCalledTime = now;
            this.drawLayer( now );

            capturing && this._capturer.capture( this._canvas );
        }

        this._frame = L.Util.requestAnimFrame( this._animate, this );
    },


    // -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
    //------------------------------------------------------------------------------
    _setTransform: function( el, offset, scale ) {
        var pos = offset || new L.Point( 0, 0 );

        el.style[ L.DomUtil.TRANSFORM ] =
            ( L.Browser.ie3d ?
              "translate(" + pos.x + "px," + pos.y + "px)" :
              "translate3d(" + pos.x + "px," + pos.y + "px,0)" ) +
            ( scale ? " scale(" + scale + ")" : "" );
    },

    //------------------------------------------------------------------------------
    _animateZoom: function( e ) {
        var scale = this._map.getZoomScale( e.zoom );

        // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1
        var offset = L.Layer ? this._map._latLngToNewLayerPoint( this._map.getBounds().getNorthWest(), e.zoom, e.center ) :
                               this._map._getCenterOffset( e.center )._multiplyBy( -scale ).subtract( this._map._getMapPanePos() );

        L.DomUtil.setTransform( this._canvas, offset, scale );
    },


    periodInSecs: function() {
        return this._period / (this._timeScale * 1000);
    },



    getMapImage: function() {
        let mapImageCanvas;

        leafletImage(this._map, function(err, canvas) {
            download(canvas.toDataURL("image/png"), "mapView.png", "image/png");
            console.log("leaflet-image: " + err);
            mapImageCanvas = canvas;

        });
        return mapImageCanvas;
    },




    // ------------------------------------------------------
    startCapture: function() {
        let periodInSecs = this.periodInSecs();
        if (periodInSecs > 5) {
            return 0;
        }

        let mapImageCanvas = getMapImage();
        this._capturer = new CCapture( {
                name: "movingPath",
                format: "gif",
                quality: 5,
                workersPath: 'static/js/',
                framerate: 30,
                timeLimit: periodInSecs,
                display: true,
                verbose: false
            });

        this._capturing = true;
        this._capturer.start();
        return periodInSecs;
    },

    stopCapture: function() {
        this._capturer.stop();
        this._capturing = false;

        // default save, will download automatically a file called {name}.extension (webm/gif/tar)
        this._capturer.save();
        // delete currentTime;

        // // custom save, will get a blob in the callback
        // capturer.save( function( blob ) { /* ... */ } );
    }
} );

L.dotLayer = function( items, options ) {
    return new L.DotLayer( items, options );
};


// ---------------------------------------------------------------------------

/*
    From "Making annoying rainbows in javascript"
    A tutorial by jim bumgardner
*/
function makeColorGradient(frequency1, frequency2, frequency3,
                             phase1, phase2, phase3,
                             center, width, len) {
    let palette = new Array(len);

    if (center == undefined)   center = 128;
    if (width == undefined)    width = 127;
    if (len == undefined)      len = 50;

    for (let i = 0; i < len; ++i) {
        let r = Math.round(Math.sin(frequency1*i + phase1) * width + center),
            g = Math.round(Math.sin(frequency2*i + phase2) * width + center),
            b = Math.round(Math.sin(frequency3*i + phase3) * width + center);
        palette[i] = `rgb(${r}, ${g}, ${b})`;
    }
    return palette;
}

function colorPalette(n) {
    center = 128;
    width = 127;
    steps = 10;
    frequency = 2*Math.PI/steps;
    return makeColorGradient(frequency,frequency,frequency,0,2,4,center,width,n);
}
