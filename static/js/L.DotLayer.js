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
    target_fps: 15,

    options: {
        paused: false
    },


    // -- initialized is called on prototype
    initialize: function (items, options) {
        this._map    = null;
        this._canvas = null;
        this._frame  = null;
        this._items = items;
        L.setOptions(this, options);
        this._paused = this.options.paused;
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

        let topLeft = this._map.containerPointToLayerPoint([0, 0]);
        ctx = this._canvas.getContext('2d');
        ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
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

        var size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;

        var animated = this._map.options.zoomAnimation && L.Browser.any3d;
        L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));


        // map._panes.overlayPane.appendChild(this._canvas);
        map._panes.shadowPane.style.pointerEvents = "none";
        map._panes.shadowPane.appendChild(this._canvas);

        map.on(this.getEvents(),this);

        this.onLayerDidMount && this.onLayerDidMount(); // -- callback
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
                let len = A.latlng.length,
                    cp_all = A.latlng.map(p => this._map.latLngToContainerPoint(p)),
                    t = [],
                    cp = [],
                    M = [];

                for (let i=1; i<len; i++) {
                    let p1 = cp_all[i-1],
                        p1_in = ((p1.x >= 0 && p1.x <= xmax) && (p1.y >= 0 && p1.y <= ymax)),
                        p2 = cp_all[i],
                        p2_in = ((p2.x >= 0 && p2.x <= xmax) && (p2.y >= 0 && p2.y <= ymax));

                    if (p1_in || p2_in) {
                        t.push(A.time[i-1]);
                        cp.push(p1);
                        let dt = A.time[i] - A.time[i-1];

                        M.push({ x: (p2.x-p1.x)/dt, y: (p2.y-p1.y)/dt });
                    }
                }
                if (t.length) {
                    this._processedItems[id] = {t: t, cp: cp, M: M}
                }
            }
        }
        // console.log("setupWindow");
    },

    // --------------------------------------------------------------------
    drawLayer: function () {
        // -- todo make the viewInfo properties  flat objects.
        if (!this._map){
            return;
        }

        this.onDrawLayer && this.onDrawLayer( {
                                                layer : this,
                                                canvas: this._canvas,
                                                bounds: this._bounds,
                                                size: this._size,
                                                zoom: this._zoom,
                                                center: this._center,
                                                corner: this._corner
                                            });
        this._frame = null;
    },


    // --------------------------------------------------------------------
    drawDots: function(id, time, size) {
        const A = this._items[id],
              B = this._processedItems[id],
              max_time = A.time.slice(-1),
              zoom = this._zoom,
              n1 = this.DCONST * A.total_distance * zoom * zoom * zoom,
              // n1 = (A.total_distance << (this._zoom-1)) >> 20,
              delay = ~~(max_time / n1),
              num_pts = ~~(max_time / delay),
              ctx = this._canvas.getContext('2d'),
              xmax = this._size.x,
              ymax = this._size.y;

        let s = time % max_time,
            key_time = s - delay * (~~(s/delay)),
            count = 0,
            i = 0,
            t, dt,
            p1 = B.cp[0],
            t1 = B.t[0],
            M = B.M[0];


        for (let j = 0; j < num_pts; j++) {
            t = (key_time + j*delay);
            if (t >= B.t[i+1]) {
              while (t >= B.t[i+1]) {
                i++;
              }

              p1 = B.cp[i];
              t1 = B.t[i];
              M = B.M[i];
            }

            dt = t - t1;
            dot = {
              x: ~~(p1.x + M.x*dt + 0.5),
              y: ~~(p1.y + M.y*dt + 0.5)
            };

            if ((dot.x >= 0 && dot.x <= xmax) && (dot.y >= 0 && dot.y <= ymax)) {
                // ctx.fillRect(dot.x-1, dot.y-1, size, size);
                ctx.beginPath();
                ctx.arc(dot.x, dot.y, size, 0, this.two_pi);
                ctx.fill();
                ctx.closePath();
                count++;
            }
        }
        return count;
    },

    /* for dot paths */
    onDrawLayer: function(info) {
        let now = Date.now();

        let ctx = info.canvas.getContext('2d'),
            zoom = info.zoom,
            time = (now - this.start_time) >>> this.SCONSTS[zoom],
            count = 0;

        ctx.clearRect(0, 0, info.canvas.width, info.canvas.height);
        ctx.fillStyle = "#000000";

        highlighted_items = [];
        for (let id in this._processedItems) {
            if (this._items[id].highlighted) {
                highlighted_items.push(id);
            } else {
                count += this.drawDots(id, time, 2);
            }
        }

        // now plot highlighted paths
        let hlen = highlighted_items.length;
        if (hlen) {
            ctx.fillStyle = "#FFFFFF";
            for (let i=0; i < hlen; i++) {
                count += this.drawDots(highlighted_items[i], time, 4);
            }
        }

        fps_display && fps_display.update(now, " n=" + count + " z="+info.zoom);

    },

    // --------------------------------------------------------------------
    animate: function() {
        this._paused = false;
        this.start_time = Date.now();
        this.lastCalledTime = Date.now();
        this.minDelay = ~~(1000/this.target_fps);
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
            this.drawLayer();
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
