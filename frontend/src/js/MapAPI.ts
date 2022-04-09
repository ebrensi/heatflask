/*
 * mapAPI -- Leaflet map background is initialized here
 *    as well as all of the plugins we're going to need
 *    except for the sidebar overlay.
 */
import strava_logo from "url:../images/pbs4.png"
import heatflask_logo from "url:../images/logo.png"

import Geohash from "latlon-geohash"
import { Map, control, Control, DomUtil, areaSelect } from "leaflet"
import type { Point } from "leaflet"
import "./BoxHook"
import "leaflet-areaselect"
import "leaflet-control-window"
import "leaflet-easybutton"

import CachedTileLayer from "./CachedTileLayer"
import "leaflet-providers"

import { MAPBOX_ACCESS_TOKEN, OFFLINE, MOBILE } from "./Env"
import { State } from "./Model"
import { setURLfromQV } from "./URL"

/*
 * Initialize map Baselayers
 */

export const baselayers: { [b: string]: CachedTileLayer } = {
  None: new CachedTileLayer("", { useCache: false }),
}

const mapBox_layer_names = {
  "Mapbox.dark": "mapbox/dark-v10",
  "Mapbox.streets": "mapbox/streets-v11",
  "Mapbox.outdoors": "mapbox/outdoors-v11",
  "Mapbox.satellite": "mapbox/satellite-streets-v11",
}
const mapbox_layer_spec = (id) => ({
  id: id,
  accessToken: MAPBOX_ACCESS_TOKEN,
  useOnlyCache: OFFLINE,
})

for (const [name, id] of Object.entries(mapBox_layer_names)) {
  baselayers[name] = new CachedTileLayer.Provider(
    "MapBox",
    mapbox_layer_spec(id)
  )
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
  baselayers[name] = new CachedTileLayer.Provider(name, {
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

// Define a watermark control
const ggg = {
  // options: {},
  onAdd: function () {
    const img: HTMLImageElement = DomUtil.create("img")
    img.src = this.options.image
    img.style.width = this.options.width
    img.style.opacity = this.options.opacity
    return img
  },
}
Control.Watermark = Control.extend(ggg)

// Instantiate the map
interface myMap extends Map {
  controlWindow: (options?) => Control.Window
  zoomControl: Control
  showInfoBox: (visible?: boolean) => void
  areaSelect: unknown
  _getMapPanePos: () => Point
}

type latlng = { lat: number; lng: number } | [number, number]

/*
 * Display for debugging
 */
const InfoViewer = Control.extend({
  visible: true,
  onAdd(map: myMap) {
    const infoBox_el = DomUtil.create("div")
    infoBox_el.style.width = "200px"
    infoBox_el.style.padding = "5px"
    infoBox_el.style.background = "rgba(255,255,255,0.6)"
    infoBox_el.style.textAlign = "left"
    this.infoBox_el = infoBox_el

    this.onMove = () => {
      const zoom = map.getZoom()
      const center = map.getCenter()
      const gh = Geohash.encode(center.lat, center.lng, zoom)
      const { x: pox, y: poy } = map.getPixelOrigin()
      const { x: mx, y: my } = map._getMapPanePos()
      const llb = map.getBounds()
      const W = llb.getWest()
      const S = llb.getSouth()
      const N = llb.getNorth()
      const E = llb.getEast()

      infoBox_el.innerHTML =
        `<b>Map</b>: zoom: ${zoom.toFixed(2)}<br>` +
        `GeoHash: ${gh}<br>` +
        `SW: ${W.toFixed(4)}, ${S.toFixed(4)}<br>` +
        `NE: ${E.toFixed(4)}, ${N.toFixed(4)}<br>` +
        `px0: ${pox}, ${poy}<br>` +
        `mpp: ${mx.toFixed(3)}, ${my.toFixed(3)}<br>`
    }
    map.on("zoomstart zoom zoomend move", this.onMove)
    map.fireEvent("move")
    return infoBox_el
  },

  onRemove(map) {
    map.off("zoomstart zoom zoomend move", this.onMove)
    this.infoBox_el.remove()
  },
})

const infoBox = new InfoViewer()
infoBox.visible = false

export function showInfoBox(map, visible = true) {
  if (visible && !infoBox.visible) {
    infoBox.addTo(map)
    infoBox.visible = true
  } else if (!visible && infoBox.visible) {
    infoBox.remove()
    infoBox.visible = false
  }
}

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

  // Add zoom Control
  map.zoomControl.setPosition("bottomright")

  // Add baselayer selection control to map
  control.layers(baselayers, null, { position: "topleft" }).addTo(map)

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
  map.controlWindow = (options?) => new Control.Window(map, options)
  map.showInfoBox = (visible?: boolean) => showInfoBox(map, visible)
  map.areaSelect = areaSelect
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
    visual.baselayer = e.layer.name
    setURLfromQV({ visual, query })
  })
}
