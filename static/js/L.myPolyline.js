var myPolyline = L.Polyline.extend({

    _projected: {},

    _project: function () {
        var zoom = this._map.getZoom();
            projected = this._projected[zoom];

        if (projected) {
            this._pxBounds = projected.bounds;
            this._rings = projected.rings;
            console.log("recycled projected");
        } else {
            var pxBounds = new L.Bounds();
            this._rings = [];
            this._projectLatlngs(this._latlngs, this._rings, pxBounds);

            var w = this._clickTolerance(),
            p = new L.Point(w, w);

            if (this._bounds.isValid() && pxBounds.isValid()) {
                pxBounds.min._subtract(p);
                pxBounds.max._add(p);
                this._pxBounds = pxBounds;
            }

            this._projected[zoom] = {
                bounds: this._pxBounds,
                rings: this._rings
            };
            console.log(`projecting at zoom=${zoom}`);
            // console.log(this._projected[zoom]);

        }
    }
});
