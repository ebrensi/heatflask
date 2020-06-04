
import * as L from "leaflet";

// these imports all modify the L object
import './L.Control.fps.js';

import 'leaflet-control-window';
import '../../node_modules/leaflet-control-window/src/L.Control.Window.css';

// The main sidebar UI
// Leaflet sidebar v2
import "../../node_modules/leaflet-sidebar-v2/css/leaflet-sidebar.css";
import "leaflet-sidebar-v2";
export const sidebarControl = L.control.sidebar('sidebar');


// Brand Logo Watermarks
import '../ext/js/L.Control.Watermark.js';
import strava_logo from "../images/pbs4.png";
export const stravaLogo = L.control.watermark({
	image: strava_logo,
	width: '20%',
	opacity:'0.5',
	position: 'bottomleft'
})

import heatflask_logo from "../images/logo.png";
export const heatflaskLogo = L.control.watermark({
	image: heatflask_logo,
	opacity: '0.5',
	width: '20%',
	position: 'bottomleft'
})


// Baselayer selection control
import { baseLayers } from "./Baselayers.js";
export const layerControl = L.control.layers(
	baseLayers, null, {position: 'topleft'}
)


/*
// pause-play button
import animationControl from "./Control.play-pause.js";

import captureControl from "./Control.capture.js";

import selectButton from "./Control.pathSelect.js";

export { animationControl, captureControl, selectButton }
*/
