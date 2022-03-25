/*
 * mapAPI -- Leaflet map background is initialized here
 *    as well as all of the plugins we're going to need
 *    except for the sidebar overlay.
 */
import Geohash from "latlon-geohash"

import { MAPBOX_ACCESS_TOKEN, OFFLINE, ADMIN, MOBILE } from "./Env"
import { Map, control, Control, DomUtil } from "./myLeaflet"

// For ctrl-select
import "./BoxHook"
import "leaflet-control-window"
import "npm:leaflet-areaselect/src/leaflet-areaselect"
import { tileLayer } from "./TileLayer/TileLayer.Heatflask"

import strava_logo from "url:../images/pbs4.png"
import heatflask_logo from "url:../images/logo.png"

/*
 * Initialize the Leaflet map object
 */

export const map = new Map("map", {
  center: [0, 0],
  zoom: 4,
  zoomAnimation: MOBILE,
  zoomSnap: 1,
  zoomDelta: 1,
  zoomAnimationThreshold: 8,
  wheelPxPerZoomLevel: 60,
  updateWhenZooming: true,
  worldCopyJump: true,
  preferCanvas: true,
})

// Add zoom Control
map.zoomControl.setPosition("bottomright")

// Make control window accessible as an export
export function controlWindow(options) {
  return control.window(map, options)
}

export const AreaSelect = window.L.AreaSelect

/*
 * Initialize map Baselayers
 */
export const baselayers = {
  None: tileLayer("", { useCache: false }),
}

const mapBox_layer_names = {
  "Mapbox.dark": "mapbox/dark-v10",
  "Mapbox.streets": "mapbox/streets-v11",
  "Mapbox.outdoors": "mapbox/outdoors-v11",
  "Mapbox.satellite": "mapbox/satellite-streets-v11",
}

for (const [name, id] of Object.entries(mapBox_layer_names)) {
  baselayers[name] = tileLayer.provider("MapBox", {
    id: id,
    accessToken: MAPBOX_ACCESS_TOKEN,
    useOnlyCache: OFFLINE,
  })
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
]
export const defaultBaselayerName = "Mapbox.dark"

for (const name of providers_names) {
  baselayers[name] = tileLayer.provider(name, { useOnlyCache: OFFLINE })
}

//  * Set the zoom range the same for all basemaps because this TileLayer
//  * will fill in missing zoom levels with tiles from the nearest zoom level.

for (const name in baselayers) {
  const layer = baselayers[name],
    maxZoom = layer.options.maxZoom
  layer.name = name

  if (maxZoom) {
    layer.options.maxNativeZoom = maxZoom
    layer.options.maxZoom = 22
    layer.options.minZoom = 3
  }
}

// Add baselayer selection control to map
control.layers(baselayers, null, { position: "topleft" }).addTo(map)

// Add default baselayer to map
// baselayers[defaultBaselayerName].addTo(map)

// Define a watermark control
const Watermark = Control.extend({
  onAdd: function () {
    const img: HTMLImageElement = DomUtil.create("img")
    img.src = this.options.image
    img.style.width = this.options.width
    img.style.opacity = this.options.opacity
    return img
  },
})

// Add Watermarks to map
new Watermark({
  image: strava_logo,
  width: "20%",
  opacity: "0.5",
  position: "bottomleft",
}).addTo(map)

new Watermark({
  image: heatflask_logo,
  opacity: "0.5",
  width: "20%",
  position: "bottomleft",
}).addTo(map)

/*
 * Display for debugging
 */
const InfoViewer = Control.extend({
  onAdd() {
    const infoBox_el = DomUtil.create("div")
    infoBox_el.style.width = "200px"
    infoBox_el.style.padding = "5px"
    infoBox_el.style.background = "rgba(255,255,255,0.6)"
    infoBox_el.style.textAlign = "left"
    this.infoBox_el = infoBox_el

    this.onMove = () => {
      const zoom = map.getZoom().toFixed(2)
      const center = map.getCenter()
      const gh = Geohash.encode(center.lat, center.lng, zoom)
      const { x: pox, y: poy } = map.getPixelOrigin()
      const { x: mx, y: my } = map._getMapPanePos()
      const { _southWest: SW, _northEast: NE } = map.getBounds()
      const { lat: swLat, lng: swLng } = SW
      const { lat: neLat, lng: neLng } = NE

      infoBox_el.innerHTML =
        `<b>Map</b>: zoom: ${zoom}<br>` +
        `GeoHash: ${gh}<br>` +
        `SW: ${swLat.toFixed(4)}, ${swLng.toFixed(4)}<br>` +
        `NE: ${neLat.toFixed(4)}, ${neLng.toFixed(4)}<br>` +
        `px0: ${pox}, ${poy}<br>` +
        `mpp: ${mx.toFixed(3)}, ${my.toFixed(3)}<br>`
    }
    map.on("zoomstart zoom zoomend move", this.onMove)
    map.fireEvent("move")
    return infoBox_el
  },

  onRemove() {
    map.off("zoomstart zoom zoomend move", this.onMove)
    this.infoBox_el.remove()
  },
})

const infoBox = new InfoViewer()
infoBox.on = false

export function showInfoBox(on = true) {
  if (on && !infoBox.on) {
    infoBox.addTo(map)
    infoBox.on = true
  } else if (!on && infoBox.on) {
    infoBox.remove()
    infoBox.on = false
  }
}

if (ADMIN) {
  showInfoBox()
}
