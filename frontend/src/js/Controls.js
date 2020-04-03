
import * as L from "leaflet";

// these imports all modify the L object
import './L.Control.fps.js';

import './ext/js/L.Control.Window.js';
import './ext/css/L.Control.Window.css';

// The main sidebar UI
// Leaflet sidebar v2
import "../../node_modules/sidebar-v2/css/leaflet-sidebar.css";
import "../../node_modules/sidebar-v2/js/leaflet-sidebar.js";
export const sidebarControl = L.control.sidebar('sidebar');


// Brand Logo Watermarks
import './ext/js/L.Control.Watermark.js';
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
export const layerControl = L.control.layers(baseLayers, null, {position: 'topleft'})

// zoom buttons
export const zoomControl = map.zoomControl.setPosition('bottomright');

// pause-play button
export animationControl from "./Control.play-pause.js";

export captureControl from "./Control.capture.js";

export selectButton from "./Control.pathSelect.js";
