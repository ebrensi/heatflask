/*
 * mapAPI -- Leaflet map background is initialized here
 *
 * Efrem Rensi 2020
 */

import { MAPBOX_ACCESS_TOKEN, OFFLINE, MAP_INFO } from "./Env"
import Geohash from "latlon-geohash"

import { Map, control, Control, DomUtil, LatLng } from "./myLeaflet"

// For ctrl-select
import "./BoxHook"

import "leaflet-control-window"
import "../../node_modules/leaflet-areaselect/src/leaflet-areaselect"
import "../../node_modules/sidebar-v2/js/leaflet-sidebar"
import { tileLayer } from "./TileLayer/TileLayer.Heatflask"
import { flags, vParams, currentUser } from "./Model"
import * as ActivityCollection from "./DotLayer/ActivityCollection"
import { HHMMSS, queueTask } from "./appUtil"
import strava_logo from "url:../images/pbs4.png"
import heatflask_logo from "url:../images/logo.png"

import type { Activity } from "./DotLayer/Activity"

let center: LatLng, zoom: number

export const AreaSelect = window.L.AreaSelect

// Geohash uses "lon" for longitude and leaflet uses "lng"
function ghDecode(s: string): LatLng {
  const obj = Geohash.decode(s)
  return new LatLng(obj.lat, obj.lon)
}

if (vParams.geohash) {
  center = ghDecode(vParams.geohash)
  zoom = vParams.geohash.length
  vParams.autozoom = false
} else {
  center = vParams.center
  zoom = vParams.zoom
  vParams.geohash = Geohash.encode(center.lat, center.lng)
}

/*
 * Initialize the Leaflet map object
 */
export const map = new Map("map", {
  center: center,
  zoom: zoom,
  zoomAnimation: false,
  zoomSnap: 0.1,
  zoomDelta: 1,
  zoomAnimationThreshold: 6,
  wheelPxPerZoomLevel: 60,
  updateWhenZooming: true,
  worldCopyJump: true,
})

/*
 * Create one-way binding from map location to vParams object.
 * This can't be a two way binding because I don't have a way
 * to prevent infinite recursion.
 */
map.on("moveend", () => {
  const center = map.getCenter()
  const zoom = map.getZoom()

  vParams.zoom = zoom
  vParams.center = center

  const gh = Geohash.encode(center.lat, center.lng, zoom)
  vParams.geohash = gh
  // console.log(`(${center.lat}, ${center.lng}, ${zoom}) -> ${gh}`);
})

/*
 *  Make control window accessible as an export
 */
export function controlWindow(options) {
  return control.window(map, options)
}

/*
 * Initialize map Baselayers
 *   with custom TileLayer
 */
const baselayers = {
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
export const defaultBaselayerName = "OpenStreetMap.Mapnik"

for (const name of providers_names) {
  baselayers[name] = tileLayer.provider(name, { useOnlyCache: OFFLINE })
}

/*
 * If the user provided a baselayer name that is not one of
 *  our default set, attempt to instantiate it and set it as
 *  the current baselayer.
 */
let blName = vParams.baselayer || defaultBaselayerName

if (!baselayers[blName]) {
  try {
    baselayers[blName] = tileLayer.provider(blName)
  } catch (e) {
    const msg = `${e}: sorry we don't support the baseLayer "${blName}"`
    console.log(msg)
    blName = defaultBaselayerName
  }
}

/*
 * Set the zoom range the same for all basemaps because this TileLayer
 * will fill in missing zoom levels with tiles from the nearest zoom level.
 */
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

// Now vParams.baselayer becomes the actual baselayer, not just the name
const currentBaselayer = baselayers[blName]
vParams.baselayer = currentBaselayer
queueTask(() => currentBaselayer.addTo(map))

map.on("baselayerchange", (e) => {
  vParams.baselayer = e.layer
})

// Add baselayer selection control to map
control.layers(baselayers, null, { position: "topleft" }).addTo(map)

// Add zoom Control
map.zoomControl.setPosition("bottomright")

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

// Add Watermarks
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

// The main sidebar UI
// Leaflet sidebar v2
export const sidebar = control.sidebar("sidebar").addTo(map)
const sidebarTabs = Array.from(document.querySelectorAll("[role=tab]")).map(
  (el) => el.href.split("#")[1]
)

if (!currentUser.id) {
  const idx = sidebarTabs.indexOf("profile")
  sidebarTabs.splice(idx, 1)
}
let currentTab = 0

/* key and mouse bindings to the map to control the sidebar */

sidebar.addEventListener("opening", () => (sidebar.isOpen = true))
sidebar.addEventListener("closing", () => (sidebar.isOpen = false))
sidebar.isOpen = false

document.addEventListener("keydown", (e) => {
  if (sidebar.isOpen) {
    switch (e.keyCode) {
      case 27: // ESC key
      case 32: // Space key
        sidebar.close()
        break
      case 40: // up-arrow
        currentTab = (currentTab + 1) % sidebarTabs.length
        sidebar.open(sidebarTabs[currentTab])
        break
      case 38: // down-arrow
        currentTab--
        if (currentTab < 0) currentTab = sidebarTabs.length - 1
        sidebar.open(sidebarTabs[currentTab])
        break
    }
  } else {
    switch (e.keyCode) {
      case 32: // Space key
        sidebar.open(sidebarTabs[currentTab])
        break
    }
  }
})

map.addEventListener("click", () => sidebar.isOpen && sidebar.close())

/*
 * Functions concerning
 */
export function activityDataPopup(A: Activity, latlng: LatLng): void {
  const d = A.total_distance,
    elapsed = HHMMSS(A.elapsed_time),
    v = A.average_speed,
    dkm = +(d / 1000).toFixed(2),
    dmi = +(d / 1609.34).toFixed(2)

  let vkm, vmi

  if (A.vtype == "pace") {
    vkm = HHMMSS(1000 / v).slice(3) + "/km"
    vmi = HHMMSS(1609.34 / v).slice(3) + "/mi"
  } else {
    vkm = ((v * 3600) / 1000).toFixed(2) + "km/hr"
    vmi = ((v * 3600) / 1609.34).toFixed(2) + "mi/hr"
  }

  const BASE_USER_URL = "hello"

  const popupContent = `
        <b>${A.name}</b><br>
        ${A.type}:&nbsp;${A.tsLocal}<br>
        ${dkm}&nbsp;km&nbsp;(${dmi}&nbsp;mi)&nbsp;in&nbsp;${elapsed}<br>
        ${vkm}&nbsp;(${vmi})<br>
        View&nbsp;in&nbsp;
        <a href='https://www.strava.com/activities/${A.id}'
        target='_blank'>Strava</a>,&nbsp;
        <a href='${BASE_USER_URL}?id=${A.id}'&nbsp;target='_blank'>Heatflask</a>
    `
  map.openPopup(popupContent, latlng, { closeButton: false })
}

export async function zoomToSelectedPaths(): Promise<void> {
  // Pan-Zoom to fit all selected activities
  const bounds = await ActivityCollection.getSelectedLatLngBounds()
  if (bounds) map.fitBounds(bounds)
}

flags.onChange("zoomToSelection", zoomToSelectedPaths)

export let infoBox
if (MAP_INFO) {
  /*
   * Display for debugging
   */
  const InfoViewer = Control.extend({
    onAdd: function () {
      const infoBox = DomUtil.create("div")
      infoBox.style.width = "200px"
      infoBox.style.padding = "5px"
      infoBox.style.background = "rgba(255,255,255,0.6)"
      infoBox.style.textAlign = "left"
      map.on("zoomstart zoom zoomend move", function () {
        const zoom = map.getZoom().toFixed(2)
        const { x: pox, y: poy } = map.getPixelOrigin()
        const { x: mx, y: my } = map._getMapPanePos()
        const { _southWest: SW, _northEast: NE } = map.getBounds()
        const { lat: swLat, lng: swLng } = SW
        const { lat: neLat, lng: neLng } = NE

        infoBox.innerHTML =
          `<b>Map</b>: zoom: ${zoom}<br>` +
          `SW: ${swLat.toFixed(4)}, ${swLng.toFixed(4)}<br>` +
          `NE: ${neLat.toFixed(4)}, ${neLng.toFixed(4)}<br>` +
          `px0: ${pox}, ${poy}<br>` +
          `mpp: ${mx.toFixed(3)}, ${my.toFixed(3)}<br>`
      })
      return infoBox
    },
  })

  new InfoViewer().addTo(map)
}
