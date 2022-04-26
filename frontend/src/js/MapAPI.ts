/*
 * mapAPI -- Leaflet map background is initialized here
 *    as well as all of the plugins we're going to need
 *    except for the sidebar overlay.
 */
import strava_logo from "url:../images/pbs4.png"
import heatflask_logo from "url:../images/logo.png"

import Geohash from "latlon-geohash"
import { Map, Control, AreaSelect, TileLayer } from "leaflet"
import "./LeafletExtensions"
import type { Point } from "leaflet"

import "./BoxHook"
import "leaflet-areaselect"
import "leaflet-control-window"
import "leaflet-easybutton"
import "./CachedTileLayer"
import "leaflet-providers"

import { MAPBOX_ACCESS_TOKEN, OFFLINE, MOBILE } from "./Env"
import { State } from "./Model"
import { setURLfromQV } from "./URL"

/*
 * Initialize map Baselayers
 */

export const baselayers: { [b: string]: TileLayer } = {
  None: new TileLayer("", { useCache: false }),
}

const mapBox_layer_names = {
  "Mapbox.dark": "mapbox/dark-v10",
  "Mapbox.streets": "mapbox/streets-v11",
  "Mapbox.outdoors": "mapbox/outdoors-v11",
  "Mapbox.satellite": "mapbox/satellite-streets-v11",
}
const mapbox_layer_spec = (id: string) => ({
  id: id,
  accessToken: MAPBOX_ACCESS_TOKEN,
  useOnlyCache: OFFLINE,
})

for (const [name, id] of Object.entries(mapBox_layer_names)) {
  baselayers[name] = new TileLayer.Provider("MapBox", mapbox_layer_spec(id))
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

for (const name of providers_names) {
  baselayers[name] = new TileLayer.Provider(name, {
    useOnlyCache: OFFLINE,
  })
}

//  * Set the zoom range the same for all basemaps because this TileLayer
//  * will fill in missing zoom levels with tiles from the nearest zoom level.

for (const name in baselayers) {
  const layer = baselayers[name]
  const maxZoom = layer.options.maxZoom
  layer.name = name

  if (maxZoom) {
    layer.options.maxNativeZoom = maxZoom
    layer.options.maxZoom = 22
    layer.options.minZoom = 3
  }
}

// Instantiate the map
interface myMap extends Map {
  controlWindow: Control.Window
  zoomControl: Control.Zoom
  showInfoBox: (yes?: boolean) => void
  areaSelect: AreaSelect
  _getMapPanePos: () => Point
}

type latlng = { lat: number; lng: number } | [number, number]

export function CreateMap(
  divOrID: HTMLDivElement | string = "map",
  center: latlng = [0, 0],
  zoom = 3
) {
  const map = <myMap>new Map(divOrID, {
    center: center,
    zoom: zoom,
    zoomAnimation: MOBILE,
    fadeAnimation: false,
    zoomSnap: 1,
    zoomDelta: 1,
    zoomAnimationThreshold: 8,
    wheelPxPerZoomLevel: 60,
    worldCopyJump: true,
    preferCanvas: true,
  })

  const infoBox = new Control.InfoViewer()
  map.showInfoBox = (yes: boolean) => {
    if (yes) infoBox.addTo(map)
    else infoBox.remove()
  }
  // Add zoom Control
  map.zoomControl.setPosition("bottomright")

  // Add baselayer selection control to map
  const layers_control = new Control.Layers(baselayers, null, {
    position: "topleft",
  })
  layers_control.addTo(map)

  // Add Watermarks to map
  new Control.Watermark({
    image: strava_logo,
    width: "20%",
    opacity: "0.5",
    position: "bottomleft",
  }).addTo(map)

  new Control.Watermark({
    image: heatflask_logo,
    opacity: "0.5",
    width: "20%",
    position: "bottomleft",
  }).addTo(map)

  // Make control window accessible as a method
  map.controlWindow = new Control.Window(map, {
    visible: false,
    position: "top",
  })
  map.areaSelect = new AreaSelect()
  return map
}

export function BindMap(map: myMap, appState: State) {
  const { query, visual } = appState

  // initialize map with visual params
  baselayers[visual.baselayer].addTo(map)
  map.setView(visual.center, visual.zoom)

  map.on("move", () => {
    const center = map.getCenter()
    const zoom = map.getZoom()
    visual.center = center
    visual.zoom = zoom
    visual.geohash = Geohash.encode(center.lat, center.lng, zoom)
    setURLfromQV({ visual, query })
  })

  map.on("baselayerchange", (e) => {
    visual.baselayer = (<TileLayer>e.propagatedFrom).name
    setURLfromQV({ visual, query })
  })
}
