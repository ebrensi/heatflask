L.SwipeSelect = L.Class.extend({
    includes: L.Evented.prototype,

    options: {

    },

    initialize: function(options, doneSelecting=null, whileSelecting=null) {
        L.Util.setOptions(this, options);
        this.onmousemove = whileSelecting;
        this.onmouseup = doneSelecting;
    },

    addTo: function(map) {
        this.map = map;

        const size = map.getSize();

        this.drag = false;

        this.canvas = L.DomUtil.create( "canvas", "leaflet-layer" );
        const canvas = this.canvas;
        map._panes.markerPane.appendChild( canvas );

        canvas.width = size.x;
        canvas.height = size.y;

        this.ctx = canvas.getContext('2d');
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillStyle = "red";

        this.map.dragging.disable();

        canvas.onmousedown = function(event){
            this.mapManipulation(false);

            const topLeft = this.map.containerPointToLayerPoint( [ 0, 0 ] );
            L.DomUtil.setPosition( this.canvas, topLeft );

            this.mapPanePos = this.map._getMapPanePos();

            this.rect = {corner: new L.Point(event.pageX, event.pageY)};
            this.dragging = true;
        }.bind(this);


        canvas.onmousemove = function(event){
            if (this.dragging) {
                const r = this.rect,
                    currentPoint = new L.Point(event.pageX, event.pageY);

                r.size = currentPoint.subtract(r.corner);
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.fillRect(r.corner.x, r.corner.y, r.size.x, r.size.y);

                this.onmousemove && this.onmousemove(this.getBounds());
            }
        }.bind(this);


        canvas.onmouseup = function(event){
            this.dragging = false;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.mapManipulation(true);

            this.onmouseup & this.onmouseup(this.getBounds());
        }.bind(this);


        if (touchHandler) {
            // make touch events simulate mouse events via touchHandler
            canvas.addEventListener("touchstart", touchHandler, true);
            canvas.addEventListener("touchmove", touchHandler, true);
            canvas.addEventListener("touchend", touchHandler, true);
            canvas.addEventListener("touchcancel", touchHandler, true);
        }

    },

    getBounds: function() {
        const r = this.rect,
            corner1 = r.corner,
            corner2 = r.corner.add(r.size),
            pxBounds = new L.Bounds(corner1, corner2),

            ll1 = this.map.containerPointToLatLng(corner1),
            ll2 = this.map.containerPointToLatLng(corner2),
            llBounds = new L.LatLngBounds(ll1, ll2);

        return {pxBounds: pxBounds, latLngBounds: llBounds};
    },

    remove: function() {
        if (!this.canvas) {
            return;
        }
        this.map._panes.markerPane.removeChild( this.canvas );
        this.canvas = null;
    },

    // enable or disable pan/zoom
    mapManipulation: function (state=false){
        const map = this.map;
        if (state) {
            map.dragging.enable();
            map.touchZoom.enable();
            map.doubleClickZoom.enable();
            map.scrollWheelZoom.enable();
        } else {
            map.dragging.disable();
            map.touchZoom.disable();
            map.doubleClickZoom.disable();
            map.scrollWheelZoom.disable();
        }
    }
});

L.swipeselect = function(options, doneSelecting=null, whileSelecting=null) {
    return new L.SwipeSelect(options, doneSelecting=null, whileSelecting=null);
};
