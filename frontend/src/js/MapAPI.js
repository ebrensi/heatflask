/*
 * mapAPI.js -- Leaflet map background is initialized here
 *
 * Efrem Rensi 2020
 */

import * as L from "leaflet";
import Geohash from "latlon-geohash";

import "leaflet-control-window";
import "../../node_modules/sidebar-v2/js/leaflet-sidebar.js";
import { tileLayer } from "./TileLayer/TileLayer.Heatflask.js";
import app from "./Model.js";

import strava_logo from "url:../images/pbs4.png";
import heatflask_logo from "url:../images/logo.png";

import { MAPBOX_ACCESS_TOKEN } from "./Init.js";

let center, zoom;

// Geohash uses "lon" for longitude and leaflet uses "lng"
function ghDecode(s) {
  const obj = Geohash.decode(s);
  return L.latLng(obj.lat, obj.lon);
}

if (app.vParams.geohash) {
  center = ghDecode(app.vParams.geohash);
  zoom = app.vParams.geohash.length;
  app.vParams.autozoom = false;
} else {
  center = app.vParams.center;
  zoom = app.vParams.zoom;
  app.vParams.geohash = Geohash.encode(center.lat, center.lng);
}

/*
 * Initialize the Leaflet map object
 */
export const map = new L.Map("map", {
  center: center,
  zoom: zoom,
  preferCanvas: true,
  zoomAnimation: true,
  zoomAnimationThreshold: 6,
  updateWhenZooming: true,
  worldCopyJump: true,
});

/*
 * Create one-way binding from map location to vParams object.
 * This can't be a two way binding because I don't have a way
 * to prevent infinite recursion.
 */
map.on("moveend", () => {
  const center = map.getCenter(),
    zoom = map.getZoom();

  app.vParams.zoom = zoom;
  app.vParams.center = center;

  const gh = Geohash.encode(center.lat, center.lng, zoom);
  app.vParams.geohash = gh;
  // console.log(`(${center.lat}, ${center.lng}, ${zoom}) -> ${gh}`);
});

/*
 * Initialize two control windows, which is the modal popup that we
 *   display messages in.  We create one for general messages and
 *   one for error messages.
 */
export const msgBox1 = L.control.window(map, {
  position: "top",
  visible: false,
});

export const msgBox2 = L.control.window(map, {
  position: "top",
  visible: false,
});

/*
 * Initialize map Baselayers
 *   with custom TileLayer
 */
const baselayers = {
  None: tileLayer("", { useCache: false }),
};

const mapBox_layer_names = {
  "Mapbox.dark": "mapbox/dark-v10",
  "Mapbox.streets": "mapbox/streets-v11",
  "Mapbox.outdoors": "mapbox/outdoors-v11",
  "Mapbox.satellite": "mapbox/satellite-streets-v11",
};

for (const [name, id] of Object.entries(mapBox_layer_names)) {
  baselayers[name] = tileLayer.provider("MapBox", {
    id: id,
    accessToken: MAPBOX_ACCESS_TOKEN,
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
  "Stadia.AlidadeSmoothDark",
];
export const defaultBaselayerName = "OpenStreetMap.Mapnik";

for (const name of providers_names) {
  baselayers[name] = tileLayer.provider(name);
}

/*
 * If the user provided a baselayer name that is not one of
 *  our default set, attempt to instantiate it and set it as
 *  the current baselayer.
 */
let blName = app.vParams.baselayer || defaultBaselayerName;

if (!baselayers[blName]) {
  try {
    baselayers[blName] = tileLayer.provider(blName);
  } catch (e) {
    const msg = `${e}: sorry we don't support the baseLayer "${blName}"`;
    console.log(msg);
    msgBox2.content(msg).show();
    blName = defaultBaselayerName;
  }
}

/*
 * Set the zoom range the same for all basemaps because this TileLayer
 * will fill in missing zoom levels with tiles from the nearest zoom level.
 */
for (const name in baselayers) {
  const layer = baselayers[name],
    maxZoom = layer.options.maxZoom;
  layer.name = name;

  if (maxZoom) {
    layer.options.maxNativeZoom = maxZoom;
    layer.options.maxZoom = 22;
    layer.options.minZoom = 3;
  }
}


app.vParams.baselayer = blName;
baselayers[blName].addTo(map);

map.on("baselayerchange", (e) => {
  app.vParams.baselayer = e.layer.name;
});



// Add baselayer selection control to map
L.control.layers(baselayers, null, { position: "topleft" }).addTo(map);

// Add zoom Control
map.zoomControl.setPosition("bottomright");

// Define a watermark control
const Watermark = L.Control.extend({
  onAdd: function () {
    let img = L.DomUtil.create("img");
    img.src = this.options.image;
    img.style.width = this.options.width;
    img.style.opacity = this.options.opacity;
    return img;
  },
});

// Add Watermarks
new Watermark({
  image: strava_logo,
  width: "20%",
  opacity: "0.5",
  position: "bottomleft",
}).addTo(map);

new Watermark({
  image: heatflask_logo,
  opacity: "0.5",
  width: "20%",
  position: "bottomleft",
}).addTo(map);

// The main sidebar UI
// Leaflet sidebar v2
export const sidebar = L.control.sidebar("sidebar").addTo(map);
sidebar.addEventListener("opening", () => (sidebar.isOpen = true));
sidebar.addEventListener("closing", () => (sidebar.isOpen = false));

/* we define some key and mouse bindings to the map to control the sidebar */
map.addEventListener("click", () => {
  /* if the user clicks anywhere on the map when side bar is open,
        we close the sidebar */
  if (sidebar.isOpen) {
    sidebar.close();
  }
});

/* if the sidebar is open then close it if the user hits ESC key */
document.onkeydown = (e) => {
  if (e.keyCode === 27) {
    if (sidebar.isOpen) {
      sidebar.close();
    }
  }
};

/*  Initialize areaselect control (for selecting activities via map rectangle) */
/*
 AreaSelect is not importing for some reason
import '../../node_modules/leaflet-areaselect/src/leaflet-areaselect.js';
import '../../node_modules/leaflet-areaselect/src/leaflet-areaselect.css';

export const areaSelect = L.areaSelect({width:200, height:200});
areaSelect.addTo(map);
// */
