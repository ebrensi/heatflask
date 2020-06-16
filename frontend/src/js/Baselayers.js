/*
 *  Here we define the map baselayers
 */

import { tileLayer } from "./TileLayer/TileLayer.Heatflask.js";
import { MAPBOX_ACCESS_TOKEN } from "./appUtil.js";

export const baseLayers = {
    "None": tileLayer("", { useCache: false })
};

const mapBox_layer_names = {
    "Mapbox.dark": 'mapbox/dark-v10',
    "Mapbox.streets": 'mapbox/streets-v11',
    "Mapbox.outdoors": 'mapbox/outdoors-v11',
    "Mapbox.satellite": 'mapbox/satellite-streets-v11'
};

for (const [name, id] of Object.entries(mapBox_layer_names))
    baseLayers[name] = tileLayer.provider('MapBox', {
        id: id,
        accessToken: MAPBOX_ACCESS_TOKEN
    })

const providers_names = [
    "Esri.WorldImagery",
    "Esri.NatGeoWorldMap",
    "Stamen.Terrain",
    "Stamen.TonerLite",
    "CartoDB.Positron",
    "CartoDB.DarkMatter",
    "OpenStreetMap.Mapnik",
    "Stadia.AlidadeSmoothDark"
]

for (const name of providers_names)
    baseLayers[name] = tileLayer.provider(name)

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



export const default_baseLayer = baseLayers["CartoDB.DarkMatter"];
