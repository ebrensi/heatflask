/*
 * mapAPI -- Leaflet map background is initialized here
 *
 * Efrem Rensi 2020, 2022
 */
import "../../node_modules/leaflet/dist/leaflet.css"
import "../../node_modules/leaflet-control-window/src/L.Control.Window.css"
import "../../node_modules/leaflet-areaselect/src/leaflet-areaselect.css"
import "../../node_modules/leaflet-easybutton/src/easy-button.css"
import "../css/leaflet-mods.css"

import { MAPBOX_ACCESS_TOKEN, OFFLINE, MAP_INFO } from "./Env"
import Geohash from "latlon-geohash"

import { Map, control, Control, DomUtil, LatLng } from "./myLeaflet"

// For ctrl-select
import "./BoxHook"

import "leaflet-control-window"
import "../../node_modules/leaflet-areaselect/src/leaflet-areaselect"
import { tileLayer } from "./TileLayer/TileLayer.Heatflask"

import { HHMMSS, queueTask } from "./appUtil"
import strava_logo from "url:../images/pbs4.png"
import heatflask_logo from "url:../images/logo.png"

// import { flags, vParams, currentUser } from "./Model"
// import * as ActivityCollection from "./DotLayer/ActivityCollection"
// import type { Activity } from "./DotLayer/Activity"

let center: LatLng, zoom: number

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

// Now vParams.baselayer becomes the actual baselayer, not just the name
const currentBaselayer = baselayers[blName]
vParams.baselayer = currentBaselayer
queueTask(() => currentBaselayer.addTo(map))

map.on("baselayerchange", (e) => {
  vParams.baselayer = e.layer
})

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
