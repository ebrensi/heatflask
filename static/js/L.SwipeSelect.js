L.SwipeSelect = L.Class.extend({
    includes: L.Mixin.Events,

    options: {

    },

    initialize: function(options,doneSelecting=null, whileSelecting=null) {
        L.Util.setOptions(this, options);
        this.onmousemove = whileSelecting;
        this.onmouseup = doneSelecting;
    },

    addTo: function(map) {
        debugger;

        this.map = map;

        this.canvas = L.DomUtil.create( "canvas", "leaflet-layer" );
        let canvas = this.canvas;
        map._panes.markerPane.appendChild( this.canvas );


        this.canvas.onmousedown = function(event){
            debugger;

            let topLeft = this.map.containerPointToLayerPoint( [ 0, 0 ] ),
                mapSize = this.map.getSize(),
                canvas = this.canvas;

            canvas.width = mapSize.x;
            canvas.height = mapSize.y;
            L.DomUtil.setPosition( canvas, topLeft );

            this.ctx.globalAlpha = 0.3;
            this.ctx.fillStyle = "red";

            this.map.dragging.disable();
            this.dragging = true;

            this.rect = {
                corner: corner = (new L.Point(event.pageX, event.pageY))
                                 ._subtract(this.map._getMapPanePos()),
                size: new L.point(0,0)
            };
        }.bind(this);


        this.canvas.onmousemove = function(event){
            if (this.dragging) {
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                let r = this.rect,
                    p = (new L.Point(event.pageX, event.pageY))
                        ._subtract(this.map._getMapPanePos()),
                    corner = r.corner;

                r.size = p._subtract(corner);

                this.ctx.fillRect(corner.x, corner.y, r.size.x, r.size.y);
                this.onmousemove && this.onmousemove(this.getBounds());
            }
        }.bind(this);


        this.canvas.onmouseup = function(event){
            this.dragging = false;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            self.map.dragging.enable();

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

    remove: function() {
        this.map._panes.markerPane.removeChild( this.canvas );
        this.canvas = null;
    },


    getBounds: function() {
        let r = this.rect,
            corner1 = r.corner,
            corner2 = corner1.add(r.size),
            pxBounds = new L.Bounds(corner1, corner2),

            ll1 = this.map.containerPointToLatLng(corner1),
            ll2 = this.map.containerPointToLatLng(corner2),
            llBounds = new L.LatLngBounds(ll1, ll2);

        return {pxBounds: pxBounds, latLngBounds: llBounds};
    }

});

L.swipeselect = function(options, doneSelecting=null, whileSelecting=null) {
    return new L.SwipeSelect(options, doneSelecting=null, whileSelecting=null);
}
