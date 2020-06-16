import appState, * as args from "./appState.js";

import { Map } from "leaflet";

// import { DotLayer } from "./DotLayer/DotLayer.js";



/*
 * Create the leaflet map object
 */
export const map = new Map('map', {
    center: args.ONLOAD_PARAMS.map_center,
    zoom: args.ONLOAD_PARAMS.map_zoom,
    preferCanvas: true,
    zoomAnimation: true,
    zoomAnimationThreshold: 6\]
    updateWhenZooming: true,
});


// instantiate and add map-tile layers to the map
import { default_baseLayer } from "./Baselayers.js";

default_baseLayer.addTo(map);
appState.currentBaseLayer = default_baseLayer;
map.on('baselayerchange', function (e) {
    appState.currentBaseLayer = e.layer;
    appState.update();
});

import * as controls from "./Controls.js";

// zoom buttons
controls.zoomControl = map.zoomControl.setPosition('bottomright');


Object.values(controls).forEach( control =>
    control._noadd? null : control.addTo(map)
);


export { controls };

/*
 * instantiate a DotLayer object and it to the map
 */
// export const dotLayer = new DotLayer({
//     startPaused: appState.paused,
// })
// dotLayer.addTo(map);

