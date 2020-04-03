import { tileLayer } from "./TileLayer/TileLayer.Heatflask.js";

export { baseLayers, default_baseLayer }

const baseLayers = {
    "None": tileLayer("", { useCache: false })
};

const mapBox_layer_names = [
    "MapBox.Dark",
    "MapBox.Streets",
    "MapBox.Streets-Basic",
    "MapBox.Satellite"
];

for (const name of mapBox_layer_names)
    baseLayers[name] = tileLayer.provider('MapBox', {
        id: name.toLowerCase(),
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

const default_baseLayer = baseLayers["CartoDB.DarkMatter"];

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

