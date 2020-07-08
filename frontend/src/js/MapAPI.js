/*
 * mapAPI.js -- Leaflet map background is initialized here
 */

import "../../node_modules/leaflet/dist/leaflet.css";

import * as Dom from "./Dom.js";

/*
 * Initialize the Leaflet map object
 */
import * as L from "leaflet";
import { appState } from "./Model.js";

export const map = new L.Map('map', {
    center: appState.query.map_center,
    zoom: appState.query.map_zoom,
    preferCanvas: true,
    zoomAnimation: false,
    zoomAnimationThreshold: 6,
    updateWhenZooming: true,
});


/* Initialize two control windows, which is the modal popup that we
    display messages in.  We create one for general messages and
    one for error messages.
*/
import 'leaflet-control-window';
import '../../node_modules/leaflet-control-window/src/L.Control.Window.css';

// create an empty message box (but don't display anything yet)
const infoMsgBox = L.control.window(map, {
    position: 'top',
    content: "<div class='msgBox info-message'> Hello </div>",
    visible: false
});

const errMsgBox = L.control.window(map, {
    position: 'top',
    title: "!!",
    content: "<div class='msgBox error-message'></div>",
    visible: false
});

function makeMsg(msg, err) {
    const box = err? errMsgBox : msgBox,
          selector = err? ".error-message" : ".info-message";
    Dom.prop(selector, "innerHTML", msg);
    if (!box.visible) {
        box.show();
    }
}

export const showInfoMessage = msg => makeMsg(msg, false),
             showErrMessage  = msg => makeMsg(msg, true);

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
const default_name = "OpenStreetMap.Mapnik";


for (const name of providers_names) {
    baseLayers[name] = tileLayer.provider(name);
}

appState.currentBaseLayer = baseLayers[default_name];

/* If the user provided a baselayer name that is not one of
   those included here, attempt to instantiate it and set it as
   the current baselayer
*/
const qblName = appState.query.baselayer;
if (qblName) {
    // URL constains a baselayer setting
    if (qblName in baseLayers) {
        // it's one that we already have
        appState.currentBaseLayer = baseLayers[qblName];
    } else {
        try {
            baseLayers[qblName] = appState.currentBaseLayer = tileLayer.provider(qblName);
        } catch (e) {
            const msg = `${e}: sorry we don't support the baseLayer "${qblName}"`;
            console.log(msg);
            showErrMessage(msg);
        }
    }
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


// Add baselayer to map
appState.currentBaseLayer.addTo(map);

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


// The main sidebar UI
// Leaflet sidebar v2
import "../../node_modules/sidebar-v2/css/leaflet-sidebar.css";
import "../../node_modules/sidebar-v2/js/leaflet-sidebar.js";
export const sidebar = L.control.sidebar('sidebar').addTo(map);
sidebar.addEventListener("opening", e => sidebar.isOpen = true);
sidebar.addEventListener("closing", e => sidebar.isOpen = false);

/* we define some key and mouse bindings to the map to control the sidebar */
map.addEventListener("click", e => {
    /* if the user clicks anywhere on the map when side bar is open,
        we close the sidebar */
    if (sidebar.isOpen) {
        sidebar.close();
    }
});

// map.addEventListener("keypress", e => {
//     if (e.originalEvent.key === "s") {
//         if (sidebar.isOpen) {
//             sidebar.close();
//         } else {
//             sidebar.open();
//         }
//     }
// });


/*  Initialize areaselect control (for selecting activities via map rectangle) */
/*
 AreaSelect is not importing for some reason
import '../../node_modules/leaflet-areaselect/src/leaflet-areaselect.js';
import '../../node_modules/leaflet-areaselect/src/leaflet-areaselect.css';

export const areaSelect = L.areaSelect({width:200, height:200});
areaSelect.addTo(map);
// */


