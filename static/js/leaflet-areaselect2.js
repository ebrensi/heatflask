L.AreaSelect2 = L.Class.extend({
    includes: L.Mixin.Events,

    options: {

    },

    initialize: function(options) {
        L.Util.setOptions(this, options);
        this.callback = options.callback;
    },

    addTo: function(map) {
        this.map = map;

        // if (!this._container)
        //     return;

        let size = this.map.getSize();

        this.rect = {};
        this.drag = false;

        this.canvas = L.DomUtil.create( "canvas", "leaflet-layer" );
        canvas = this.canvas;
        canvas.width = size.x;
        canvas.height = size.y;

        this.ctx = canvas.getContext('2d');
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillStyle = "red";

        map._panes.markerPane.appendChild( canvas );

        this.map.dragging.disable();

        canvas.onmousedown = function(event){
            this.dragging = true;
            this.rect.startX = event.pageX;
            this.rect.startY = event.pageY;
        }.bind(this);


        canvas.onmousemove = function(event){
            if (this.dragging) {
                this.rect.w = event.pageX - this.rect.startX;
                this.rect.h = event.pageY - this.rect.startY;

                let rect = this.rect;
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.fillRect(rect.startX, rect.startY, rect.w, rect.h);
            }
        }.bind(this);


        canvas.onmouseup = function(event){
            this.dragging = false;
            let r = this.rect,
                corner1 = new L.Point(r.startX, r.startY),
                corner2 = new L.Point(r.startX + r.w, r.startY + r.h);
                pxBounds = new L.Bounds(corner1, corner2),

                ll1 = this.map.containerPointToLatLng(corner1),
                ll2 = this.map.containerPointToLatLng(corner2),
                llBounds = new L.LatLngBounds(ll1, ll2);

            // console.log(pxBounds, llBounds);
            this.callback && this.callback(
                pxBounds=pxBounds,
                latLngBounds=llBounds
            );
        }.bind(this);


        if (touchHandler) {
            // make touch events simulate mouse events via touchHandler
            canvas.addEventListener("touchstart", touchHandler, true);
            canvas.addEventListener("touchmove", touchHandler, true);
            canvas.addEventListener("touchend", touchHandler, true);
            canvas.addEventListener("touchcancel", touchHandler, true);
        }

    },

    remove: function() {
        map._panes.markerPane.removeChild( this.canvas );
        this.canvas = null;
        self.map.dragging.enable();
    },

    getBounds: function() {
        var size = this.map.getSize();
        var topRight = new L.Point();
        var bottomLeft = new L.Point();

        bottomLeft.x = Math.round((size.x - this._width) / 2);
        topRight.y = Math.round((size.y - this._height) / 2);
        topRight.x = size.x - bottomLeft.x;
        bottomLeft.y = size.y - topRight.y;

        var sw = this.map.containerPointToLatLng(bottomLeft);
        var ne = this.map.containerPointToLatLng(topRight);

        return new L.LatLngBounds(sw, ne);
    }
});

L.areaSelect2 = function(options) {
    return new L.AreaSelect2(options);
}
