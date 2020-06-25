/*
 * mapAPI.js -- Leaflet map and plugins are initialized here
 */

import "../../node_modules/leaflet/dist/leaflet.css";

/*
 * Initialize the Leaflet map object
 */
import * as L from "leaflet";
import { ONLOAD_PARAMS } from "./Constants.js";

export const map = new L.Map('map', {
    center: ONLOAD_PARAMS.map_center,
    zoom: ONLOAD_PARAMS.map_zoom,
    preferCanvas: true,
    zoomAnimation: false,
    zoomAnimationThreshold: 6,
    updateWhenZooming: true,
});


/*
 * Initialize map Baselayers
 *   with custom TileLayer
 */
import { tileLayer } from "./TileLayer/TileLayer.Heatflask.js";
import { MAPBOX_ACCESS_TOKEN } from "./Constants.js";

const baseLayers = {
    "None": tileLayer("", { useCache: false })
};

const mapBox_layer_names = {
    "Mapbox.dark": 'mapbox/dark-v10',
    "Mapbox.streets": 'mapbox/streets-v11',
    "Mapbox.outdoors": 'mapbox/outdoors-v11',
    "Mapbox.satellite": 'mapbox/satellite-streets-v11'
};

for (const [name, id] of Object.entries(mapBox_layer_names)) {
    baseLayers[name] = tileLayer.provider('MapBox', {
        id: id,
        accessToken: MAPBOX_ACCESS_TOKEN
    });
}

const providers_names = [
    "Esri.WorldImagery",
    "Esri.NatGeoWorldMap",
    "Stamen.Terrain",
    "Stamen.TonerLite",
    "CartoDB.Positron",
    "CartoDB.DarkMatter",
    "OpenStreetMap.Mapnik",
    "Stadia.AlidadeSmoothDark"
];

for (const name of providers_names) {
    baseLayers[name] = tileLayer.provider(name);
}

// Set the zoom range the same for all basemaps because this TileLayer
//  will fill in missing zoom levels with tiles from the nearest zoom level.
for (const name in baseLayers) {
    const layer = baseLayers[name],
          maxZoom = layer.options.maxZoom;
    layer.name = name;

    if (maxZoom) {
        layer.options.maxNativeZoom = maxZoom;
        layer.options.maxZoom = 22;
        layer.options.minZoom = 3;
    }
}


// Add default baselayer to map
export const default_baseLayer = baseLayers["CartoDB.DarkMatter"].addTo(map);

// Add baselayer selection control to map
export const layerControl = L.control.layers(
	baseLayers, null, {position: 'topleft'}
).addTo(map);


// Add zoom Control
const zoomControl = map.zoomControl.setPosition('bottomright');


// Define a watermark control
const Watermark = L.Control.extend({

    onAdd: function(map) {
        let img = L.DomUtil.create('img');

        img.src = this.options.image;
        img.style.width = this.options.width;
        img.style.opacity = this.options.opacity;
        return img;
    }
});


// Add Watermarks
import strava_logo from "../images/pbs4.png";

const stravaLogo = new Watermark({
	image: strava_logo,
	width: '20%',
	opacity:'0.5',
	position: 'bottomleft'
}).addTo(map);

import heatflask_logo from "../images/logo.png";
const heatflaskLogo = new Watermark({
	image: heatflask_logo,
	opacity: '0.5',
	width: '20%',
	position: 'bottomleft'
}).addTo(map);


// Initialize control window, which is the modal popup that we
//  display messages in.  We only create one and reuse it for different
//   messages.
import 'leaflet-control-window';
import '../../node_modules/leaflet-control-window/src/L.Control.Window.css';

// create an empty message box (but don't display anything yet)
export const msgBox = L.control.window(map, {
        position: 'top',
        content: "<div class='data_message'> Hello </div>",
        visible: false
});


// The main sidebar UI
// Leaflet sidebar v2

import "../../node_modules/sidebar-v2/css/leaflet-sidebar.css";
import "../../node_modules/sidebar-v2/js/leaflet-sidebar.js";
const sidebarControl = L.control.sidebar('sidebar').addTo(map);




/*  Initialize areaselect control (for selecting activities via map rectangle) */
/*
 AreaSelect is not importing for some reason
import '../../node_modules/leaflet-areaselect/src/leaflet-areaselect.js';
import '../../node_modules/leaflet-areaselect/src/leaflet-areaselect.css';

export const areaSelect = L.areaSelect({width:200, height:200});
areaSelect.addTo(map);
// */


