import appState from "./appState.js"

import { Map } from "leaflet";
export const map = new Map('map', {
    center: args.ONLOAD_PARAMS.map_center,
    zoom: args.ONLOAD_PARAMS.map_zoom,
    preferCanvas: true,
    zoomAnimation: true,
    zoomAnimationThreshold: 6,
    updateWhenZooming: true,
});


import { DotLayer } from "./DotLayer/DotLayer.js";

// the DotLayer object
export const dotLayer = new DotLayer({
    startPaused: appState.paused,
})


