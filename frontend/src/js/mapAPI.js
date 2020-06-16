/*
 * Leaflet and plugins are initialized here
 */

import "../../node_modules/leaflet/dist/leaflet.css";
import { Map } from "leaflet";
import { ONLOAD_PARAMS } from "./appUtil.js";

export const map = new Map('map', {
    center: ONLOAD_PARAMS.map_center,
    zoom: ONLOAD_PARAMS.map_zoom,
    preferCanvas: true,
    zoomAnimation: true,
    zoomAnimationThreshold: 6,
    updateWhenZooming: true,
});


