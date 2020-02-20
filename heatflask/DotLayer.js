const Leaflet = window["L"];

Leaflet["DotLayer"] = Leaflet["Layer"]["extend"](DotLayer);

Leaflet["dotLayer"] = function( options ) {
    return new Leaflet["DotLayer"]( options );
};
