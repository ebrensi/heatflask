L.DotLayer = L.CanvasLayer.extend({
    DOT_CONSTS: {
      1: [10000, 1],
      2: [5000, 1],
      3: [3000, 1],
      4: [2000, 1],
      5: [1000, 1],
      6: [900, 1],
      7: [800, 2],
      8: [700, 2],
      9: [600, 2],
      10: [500, 3],
      11: [400, 4],
      12: [300, 5],
      13: [200, 5],
      14: [100, 5],
      15: [50, 6],
      16: [50, 6],
      17: [30, 6],
      18: [15, 7],
      19: [15, 7],
      20: [10, 7]
    },

    paused: false,
    _pane: "shadow-pane",
    DCONST: 0.000001,

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

        var del = this._delegate || this;
        del.onLayerDidMount && del.onLayerDidMount(); // -- callback
        if (appState.items) {
            this._onLayerDidMove();
        }
        else {
            this.needRedraw();
        }
    },

    //-------------------------------------------------------------
    onRemove: function (map) {
        var del = this._delegate || this;
        del.onLayerWillUnmount && del.onLayerWillUnmount(); // -- callback


        // map.getPanes().overlayPane.removeChild(this._canvas);
        map.getPanes().shadowPane.removeChild(this._canvas);

        map.off(this.getEvents(),this);

        this._canvas = null;
    },

    drawDots: function(info, A, time) {
        const times = A.time,
              latlngs = A.latlng,
              max_time = times[times.length-1],
              dist = A.total_distance,
              zoom = info.zoom,
              n1 = this.DCONST * A.total_distance * info.zoom * info.zoom * info.zoom,
              delay = Math.floor(max_time / n1),
              num_pts = Math.floor(max_time / delay),
              ctx = info.canvas.getContext('2d');

        let s = time % max_time,
            key_time = s - delay * Math.floor(s/delay),
            count = 0,
            i = 0,
            t, d, dt, p1, p2, p, size, interval_good;

        if (A.highlighted) {
            size = 4;
            ctx.globalAlpha = 1;
            ctx.fillStyle = "#FFFFFF";
        } else {
            size = 2;
            ctx.globalAlpha = 0.7;
            ctx.fillStyle = "#000000";
        }

        for (let j = 0; j < num_pts; j++) {
            t = (key_time + j*delay);
            if (t >= times[i]) {
              while (t >= times[i]) {
                i++;
              }

              p1 = latlngs[i-1];
              p2 = latlngs[i];
              interval_good = info.bounds.contains(p1) || info.bounds.contains(p2);

              if (interval_good) {
                  dt = times[i] - times[i-1];
                  M = [(p2[0]-p1[0])/dt,  (p2[1]-p1[1])/dt];
              }
            }

            if (interval_good) {

                dt = t - times[i-1];
                p = [p1[0] + M[0]*dt, p1[1] + M[1]*dt];

                if (info.bounds.contains(p)) {
                    dot = info.layer._map.latLngToContainerPoint(p);
                    // ctx.fillRect(dot.x-1, dot.y-1, size, size);
                    ctx.beginPath();
                    ctx.arc(dot.x, dot.y, size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.closePath();
                    count++;
                }
            }

        }
        return count;
    },

    /* for dot paths */
    onDrawLayer: function(info) {
        let now = Date.now();

        let ctx = info.canvas.getContext('2d'),
            zoom = info.zoom,
            time = (now - this.start_time) >>> this.DOT_CONSTS[zoom][1],
            count = 0,
            items = appState.items;

        ctx.clearRect(0, 0, info.canvas.width, info.canvas.height);
        for (let id in items) {
            let A = items[id];
            if (("latlng" in A) && info.bounds.intersects(A.bounds) && ("time" in A)) {
                count += this.drawDots(info, A, time);
            }
        }

        fps_display.update(now, " n=" + count + " z="+info.zoom);

    },

    animate: function() {
      this.paused = false;
      this.start_time = Date.now();
      L.Util.requestAnimFrame(this._animate, this);
    },

    pause: function() {
      this.paused = true;
    },

    _animate: function() {
        if (!this.paused) {
          this.drawLayer();
          L.Util.requestAnimFrame(this._animate, this);
        }
    },

    getEvents: function () {
        var events = {
            movestart: this.onMap_pan_zoom_start,
            moveend: this._onLayerDidMove,
            resize: this._onLayerDidResize,
        };

        if (this._map.options.zoomAnimation && L.Browser.any3d) {
            events.zoomanim =  this._animateZoom;
        }

        return events;
    },


    _onLayerDidMove: function () {
        let topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);
        this.drawLayer();
        this.onMap_pan_zoom_stop();
    },

    onMap_pan_zoom_start: function() {
        this.pause();
    },

    onMap_pan_zoom_stop: function() {
        if (!appState.paused) {
            this.animate();
        }
    }

});

// L.DotLayer.prototype = new L.CanvasLayer(); // -- setup prototype

L.dotLayer = function () {
    return new L.DotLayer();
};

