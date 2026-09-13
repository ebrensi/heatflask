/*
 * mapAPI -- Leaflet map background is initialized here
 *    as well as all of the plugins we're going to need
 *    except for the sidebar overlay.
 */

import Geohash from "latlon-geohash"
import { Map, Control, AreaSelect, TileLayer } from "leaflet"
import "leaflet-areaselect"
import "leaflet-control-window"
import "leaflet-easybutton"
import "leaflet-providers"

import strava_logo from "url:../images/pbs4.png"
import heatflask_logo from "url:../images/logo.png"

import "./BoxHook"
import "./CachedTileLayer"
import "./LeafletExtensions"

import { MAPBOX_ACCESS_TOKEN, CARTO_API_KEY, OFFLINE, MOBILE } from "./Env"
import { State } from "./Model"
import { setURLfromQV } from "./URL"

import type { Point } from "leaflet"

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

// leaflet-providers has no key option for CartoDB, so put it in the URL
TileLayer.Provider.providers.CartoDB.url += `?key=${CARTO_API_KEY}`

const providers_names = [
  "Esri.WorldImagery",
  "Esri.NatGeoWorldMap",
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

/* Stamen's styles, now served by Stadia Maps.
 *
 * Stamen shut its own tile servers down in 2023 and Stadia took over hosting
 * the styles. leaflet-providers 1.13 still points Stamen.* at the old
 * stamen-tiles-*.a.ssl.fastly.net, which answers 503, so these two layers had
 * been blank.
 *
 * Stadia authorizes by the requesting page's domain rather than a key in the
 * URL: heatflask.com is registered on the account, localhost is allowed for
 * development, and any other origin gets 401.
 *
 * The names stay "Stamen.*" so a baselayer someone saved, or put in a link,
 * still resolves. */
const STADIA_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> ' +
  '&copy; <a href="https://stamen.com/">Stamen Design</a> ' +
  '&copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> ' +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

const stamen_on_stadia = {
  "Stamen.Terrain": { style: "stamen_terrain", maxZoom: 18 },
  "Stamen.TonerLite": { style: "stamen_toner_lite", maxZoom: 20 },
}

for (const [name, { style, maxZoom }] of Object.entries(stamen_on_stadia)) {
  baselayers[name] = new TileLayer(
    `https://tiles.stadiamaps.com/tiles/${style}/{z}/{x}/{y}{r}.png`,
    { attribution: STADIA_ATTRIBUTION, maxZoom, useOnlyCache: OFFLINE }
  )
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
    /* Leaflet's Control.Layers fires this via map.fire(type, obj) where obj is
     * the layer record {layer, name, overlay}. Nothing propagates, so there is
     * no e.propagatedFrom -- reading .name off it threw
     *   TypeError: Cannot read properties of undefined (reading 'name')
     * synchronously inside addTo() on line 154, which aborted BindMap and with
     * it the rest of app startup, including the DotLayer. */
    const ev = <{ name?: string; layer?: TileLayer }>(<unknown>e)
    const name = ev.name ?? ev.layer?.name
    if (!name) return
    visual.baselayer = name
    setURLfromQV({ visual, query })
  })
}
