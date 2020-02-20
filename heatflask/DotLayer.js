// const Leaflet = window["L"];

// Leaflet["DotLayer"] = Leaflet["Layer"]["extend"](DotLayer);

L.DotLayer = L.Layer.extend(DotLayer);

L.dotLayer = function( options ) {
    return new L.DotLayer( options );
};
