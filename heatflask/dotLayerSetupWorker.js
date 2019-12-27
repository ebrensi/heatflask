
/* Standalone map.project method for use without requiring leaflet.
 *  This will eventually be used in a web worker.
 */ 


// @method project(latlng: LatLng, zoom: Number): Point
    // Projects a geographical coordinate `LatLng` according to the projection
    // of the map's CRS, then scales it according to `zoom` and the CRS's
    // `Transformation`. The result is pixel coordinate relative to
    // the CRS origin.
const project = function (latlng, zoom) {
    if (!zoom)
        zoom = this._zoom;
    return crs.latLngToPoint(toLatLng(latlng), zoom);
}

crs = {
    code: 'EPSG:3857',

    // Projects geographical coordinates into pixel coordinates for a given zoom.
    latLngToPoint: function (latlng, zoom) {
        var projectedPoint = this.projection.project(latlng),
            scale = this.scale(zoom);

        return this.transformation._transform(projectedPoint, scale);
    },

    // Returns the scale used when transforming projected coordinates into
    // pixel coordinates for a particular zoom.
    // For example, it returns `256 * 2^zoom` for Mercator-based CRS.
    scale: function (zoom) {
        return 256 * Math.pow(2, zoom);
    },

    projection: {
        // SphericalMercator Projection

        earthRadius: 6378137,
        R: earthRadius,
        MAX_LATITUDE: 85.0511287798,

        project: function (latlng) {
            var d = Math.PI / 180,
                max = this.MAX_LATITUDE,
                lat = Math.max(Math.min(max, latlng.lat), -max),
                sin = Math.sin(lat * d);

            return new Point(
                this.R * latlng.lng * d,
                this.R * Math.log((1 + sin) / (1 - sin)) / 2);
        }
    },

    transformation: function () {
        var scale = 0.5 / (Math.PI * SphericalMercator.R);
        [a, b, c, d] = [scale, 0.5, -scale, 0.5]
        this._a = a;
        this._b = b;
        this._c = c;
        this._d = d;

        _transform = function (point, scale) {
            scale = scale || 1;
            point.x = scale * (this._a * point.x + this._b);
            point.y = scale * (this._c * point.y + this._d);
            return point;
        }
    },

     // distance between two geographical points using spherical law of cosines approximation
    distance: function (latlng1, latlng2) {
        var rad = Math.PI / 180,
            lat1 = latlng1.lat * rad,
            lat2 = latlng2.lat * rad,
            sinDLat = Math.sin((latlng2.lat - latlng1.lat) * rad / 2),
            sinDLon = Math.sin((latlng2.lng - latlng1.lng) * rad / 2),
            a = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon,
            c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return this.R * c;
    }
}
