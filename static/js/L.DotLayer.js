/*
  DotLayer Efrem Rensi, 2017,
  based on L.CanvasLayer by Stanislav Sumbera,  2016 , sumbera.com
  license MIT
*/

// -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
//------------------------------------------------------------------------------
L.DomUtil.setTransform = L.DomUtil.setTransform || function (el, offset, scale) {
    var pos = offset || new L.Point(0, 0);

    el.style[L.DomUtil.TRANSFORM] =
        (L.Browser.ie3d ?
            'translate(' + pos.x + 'px,' + pos.y + 'px)' :
            'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +
        (scale ? ' scale(' + scale + ')' : '');
};

// -- support for both  0.0.7 and 1.0.0 rc2 leaflet
L.DotLayer = (L.Layer ? L.Layer : L.Class).extend({
    SCONSTS: {
        1: 1,
        2: 1,
        3: 1,
        4: 1,
        5: 1,
        6: 1,
        7: 2,
        8: 2,
        9: 2,
        10: 3,
        11: 4,
        12: 5,
        13: 5,
        14: 5,
        15: 6,
        16: 6,
        17: 6,
        18: 7,
        19: 7,
        20: 7
    },

    _pane: "shadowPane",
    DCONST: 0.000001,
    two_pi: 2 * Math.PI,
    target_fps: 16,

    options: {
        startPaused: false,
        smoothFactor: 1.0
    },


    // -- initialized is called on prototype
    initialize: function (items, options) {
        this._map    = null;
        this._canvas = null;
        this._ctx = null;
        this._frame  = null;
        this._items = items || null;
        L.setOptions(this, options);
        this._paused = this.options.startPaused;
    },


    //-------------------------------------------------------------
    _onLayerDidResize: function (resizeEvent) {
        this._canvas.width = resizeEvent.newSize.x;
        this._canvas.height = resizeEvent.newSize.y;
        this._setupWindow();
    },

    //-------------------------------------------------------------
    _onLayerDidMove: function () {
        this._mapMoving = false;

        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        let topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);
        if (!this._paused) {
            this.animate();
        } else {
            this._setupWindow();
            this._frame = L.Util.requestAnimFrame(this.drawLayer, this);
        }

    },

    //-------------------------------------------------------------
    getEvents: function () {
        var events = {
            movestart: function() {
              this._mapMoving = true;
            },
            moveend: this._onLayerDidMove,
            resize: this._onLayerDidResize,
        };

        if (this._map.options.zoomAnimation && L.Browser.any3d) {
            events.zoomanim =  this._animateZoom;
        }

        return events;
    },


    //-------------------------------------------------------------
    onAdd: function (map) {
        this._map = map;
        this._canvas = L.DomUtil.create('canvas', 'leaflet-layer');
        this.tiles = {};

        let size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        this._ctx = this._canvas.getContext('2d');

        let zoomAnimated = this._map.options.zoomAnimation && L.Browser.any3d;
        L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (zoomAnimated ? 'animated' : 'hide'));


        // map._panes.overlayPane.appendChild(this._canvas);
        map._panes.shadowPane.style.pointerEvents = "none";
        map._panes.shadowPane.appendChild(this._canvas);

        map.on(this.getEvents(),this);

        if (this._items) {
            this._onLayerDidMove();
        }
    },

    //-------------------------------------------------------------
    onRemove: function (map) {
        this.onLayerWillUnmount && this.onLayerWillUnmount(); // -- callback


        // map.getPanes().overlayPane.removeChild(this._canvas);
        map.getPanes().shadowPane.removeChild(this._canvas);

        map.off(this.getEvents(),this);

        this._canvas = null;
    },


    // --------------------------------------------------------------------
    addTo: function (map) {
        map.addLayer(this);
        return this;
    },

    // --------------------------------------------------------------------
    LatLonToMercator: function (latlon) {
        return {
            x: latlon.lng * 6378137 * Math.PI / 180,
            y: Math.log(Math.tan((90 + latlon.lat) * Math.PI / 360)) * 6378137
        };
    },


    // -------------------------------------------------------------------
    _setupWindow: function () {
        if (!this._map || !this._items) {
            return;
        }

        this._ctx = this._canvas.getContext('2d');
        this._ctx.fillStyle = "#000000";

        this._size = this._map.getSize();
        this._bounds = this._map.getBounds();
        this._zoom = this._map.getZoom();

        this._center = this.LatLonToMercator(this._map.getCenter());
        this._corner = this.LatLonToMercator(this._map.containerPointToLatLng(this._map.getSize()));

        const xmax = this._size.x,
              ymax = this._size.y;

        // compute relevant container points and slopes
        this._processedItems = {};
        for (let id in this._items) {
            let A = this._items[id];
            if (("latlng" in A) && this._bounds.intersects(A.bounds) && ("time" in A)) {
                let cp_all = A.latlng.map(
                        (latLng, i) =>
                        Object.assign(this._map.latLngToContainerPoint(latLng), {t: A.time[i]})
                        );

                cp_all = L.LineUtil.simplify(cp_all, this.options.smoothFactor);

                let cp = [];
                for (let i=1, len=cp_all.length; i<len; i++) {
                    let p1 = cp_all[i-1],
                        p1_in = ((p1.x >= 0 && p1.x <= xmax) && (p1.y >= 0 && p1.y <= ymax)),
                        p2 = cp_all[i],
                        p2_in = ((p2.x >= 0 && p2.x <= xmax) && (p2.y >= 0 && p2.y <= ymax));

                    if (p1_in || p2_in) {
                        dt = p2.t - p1.t;
                        Object.assign(p1, { dx: (p2.x-p1.x)/dt, dy: (p2.y-p1.y)/dt });
                        cp.push(p1);
                    }
                }
                if (cp.length) {
                    this._processedItems[id] = cp;
                }
            }
        }
    },

    // --------------------------------------------------------------------
    drawDots: function(id, time, drawDotFunc) {
        const A = this._items[id],
              P = this._processedItems[id],
              last_P_idx = P.length - 1,
              max_time = A.time.slice(-1),
              zoom = this._zoom,
              n1 = this.DCONST * A.total_distance * zoom * zoom * zoom,
              // n1 = (A.total_distance << (this._zoom-1)) >> 20,
              delay = ~~(max_time / n1),
              num_pts = ~~(max_time / delay),
              xmax = this._size.x,
              ymax = this._size.y;

        let s = time % max_time,
            key_time = s - delay * (~~(s/delay)),
            count = 0,
            i = 0,
            t, dt,
            p = P[0];


        for (let j = 0; j < num_pts; j++) {
            t = (key_time + j*delay);
            if (i < last_P_idx && t >= P[i+1].t) {
              while (i < last_P_idx && t >= P[i+1].t) {
                i++;
              }
              p = P[i];
            }

            dt = t - p.t;
            dot = {
              x: ~~(p.x + p.dx*dt + 0.5),
              y: ~~(p.y + p.dy*dt + 0.5)
            };

            if ((dot.x >= 0 && dot.x <= xmax) && (dot.y >= 0 && dot.y <= ymax)) {
                drawDotFunc(this, dot);
                count++;
            }
        }
        return count;
    },

    drawSquare: function(obj, dot) {
        obj._ctx.fillRect(dot.x-2, dot.y-2, 4, 4);
    },

    drawDot: function (obj, dot) {
        let ctx = obj._ctx;
        ctx.beginPath();
        ctx.arc(dot.x, dot.y, 3, 0, obj.two_pi);
        ctx.fill();
        ctx.closePath();
    },

    drawLayer: function(now) {
        if (!this._map){
            return;
        }

        let ctx = this._ctx,
            zoom = this._zoom,
            time = (now - this.start_time) >>> this.SCONSTS[zoom],
            count = 0;

        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);

        highlighted_items = [];
        for (let id in this._processedItems) {
            if (this._items[id].highlighted) {
                highlighted_items.push(id);
            } else {
                count += this.drawDots(id, time, this.drawSquare);
            }
        }

        // now plot highlighted paths
        let hlen = highlighted_items.length;
        if (hlen) {
            this._ctx.save();
            this._ctx.fillStyle = "#FFFFFF";
            for (let i=0; i < hlen; i++) {
                count += this.drawDots(highlighted_items[i], time, this.drawDot);
            }
            this._ctx.restore();
        }

        fps_display && fps_display.update(now, " n=" + count + " z="+ this._zoom);

        this._frame = null;
    },

    // --------------------------------------------------------------------
    animate: function() {
        this._paused = false;
        this.start_time = Date.now();
        this.lastCalledTime = Date.now();
        this.minDelay = ~~(1000/this.target_fps + 0.5);
        this._setupWindow();
        this._frame = L.Util.requestAnimFrame(this._animate, this);
    },

    // --------------------------------------------------------------------
    pause: function() {
        this._paused = true;
    },


    // --------------------------------------------------------------------
    _animate: function() {
        if (this._paused || this._mapMoving) {
            return;
        }

        let now = Date.now();
        if (now - this.lastCalledTime > this.minDelay) {
            this.lastCalledTime = now;
            this.drawLayer(now);
        } else {
            this._frame = null;
        }

        this._frame = this._frame || L.Util.requestAnimFrame(this._animate, this);
    },


    // -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
    //------------------------------------------------------------------------------
    _setTransform: function (el, offset, scale) {
        var pos = offset || new L.Point(0, 0);

        el.style[L.DomUtil.TRANSFORM] =
            (L.Browser.ie3d ?
              'translate(' + pos.x + 'px,' + pos.y + 'px)' :
              'translate3d(' + pos.x + 'px,' + pos.y + 'px,0)') +
            (scale ? ' scale(' + scale + ')' : '');
    },

    //------------------------------------------------------------------------------
    _animateZoom: function (e) {
        var scale = this._map.getZoomScale(e.zoom);

        // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1
        var offset = L.Layer ? this._map._latLngToNewLayerPoint(this._map.getBounds().getNorthWest(), e.zoom, e.center) :
                               this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());

        L.DomUtil.setTransform(this._canvas, offset, scale);
    }
});

L.dotLayer = function (items, options) {
    return new L.DotLayer(items, options);
};
