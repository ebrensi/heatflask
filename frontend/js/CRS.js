const CRS = {
    // This is a streamlined version of Leaflet's EPSG:3857 crs,
    // which can run independently of Leaflet.js (i.e. in a worker thread)
    //  latlngpt is a a 2d-array [lat,lng] rather than a latlng object
    code: 'EPSG:3857',
    MAX_LATITUDE: 85.0511287798,
    EARTH_RADIUS: 6378137,
    RAD: Math.PI / 180,

    // Note: These operations are done in-place!!

    // This projects LatLng coordinate onto a rectangular grid
    Projection: function() {
        const max = this.MAX_LATITUDE,
              R = this.EARTH_RADIUS,
              rad = this.RAD;

        return function(latlngpt){
            const lat = Math.max(Math.min(max, latlngpt[0]), -max),
                  sin = Math.sin(lat * rad),
                  p_out = latlngpt;

            p_out[0] = R * latlngpt[1] * rad;
            p_out[1] = R * Math.log((1 + sin) / (1 - sin)) / 2;
            return p_out
        };
    },

    // This scales distances between points to a given zoom level
    Transformation: function(zoom) {
        const S = 0.5 / (Math.PI * this.EARTH_RADIUS),
              A = S, B = 0.5, C = -S, D = 0.5,
              scale = 2 ** (8 + zoom);

        return function(p_in){
            const p_out = p_in;
            p_out[0] = scale * (A * p_in[0] + B);
            p_out[1] = scale * (C * p_in[1] + D);
            return p_out
        };
    },

    makePT(zoom) {
        const P = this.Projection(),
              T = this.Transformation(zoom);
        return function(llpt){ return T(P(llpt)) };
    }
};
