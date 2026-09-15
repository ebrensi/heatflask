/*
 * MapAPI -- the MapLibre GL map, its basemaps, and 3D terrain.
 *
 * Basemap names are kept from the Leaflet version wherever the same map still
 * exists, so a baselayer saved in someone's link still resolves. Several of
 * them are vector styles now where they were raster tiles: CARTO's and
 * Stadia's styles are published both ways, and the vector versions stay sharp
 * at fractional zoom and when the map is pitched or rotated.
 */

import Geohash from "latlon-geohash"
import { Map as MLMap, NavigationControl } from "maplibre-gl"

import strava_logo from "url:../images/pbs4.png"
import heatflask_logo from "url:../images/logo.png"

import { MAPBOX_ACCESS_TOKEN } from "./Env"
import { State, DefaultVisual } from "./Model"
import { setURLfromQV } from "./URL"
import { Dialog } from "./Dialog"
import { escapeHTML } from "./appUtil"

import type {
  StyleSpecification,
  RasterSourceSpecification,
  IControl,
} from "maplibre-gl"

export type { MLMap }

/* ------------------------------------------------------------------ *
 * Basemaps
 * ------------------------------------------------------------------ */

type RasterOptions = Partial<RasterSourceSpecification>

function rasterStyle(
  tiles: string,
  attribution: string,
  opts: RasterOptions = {}
): StyleSpecification {
  return {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: [tiles],
        tileSize: 256,
        attribution,
        ...opts,
      },
    },
    layers: [{ id: "basemap", type: "raster", source: "basemap" }],
  }
}

const OSM =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
const ESRI = "Tiles &copy; Esri"

/* GSI, the Geospatial Information Authority of Japan (国土地理院): very
 * detailed Japanese-labelled maps covering Japan only. Their terms ask only
 * for attribution naming 地理院タイル with a link to this page. */
const GSI =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html">地理院タイル</a>'

const mapboxRaster = (id: string) =>
  rasterStyle(
    `https://api.mapbox.com/styles/v1/mapbox/${id}/tiles/512/{z}/{x}/{y}?access_token=${MAPBOX_ACCESS_TOKEN}`,
    '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> ' + OSM,
    { tileSize: 512 }
  )

export const baselayers: Record<string, string | StyleSpecification> = {
  None: {
    version: 8,
    sources: {},
    layers: [
      {
        id: "background",
        type: "background",
        paint: { "background-color": "#000" },
      },
    ],
  },

  /* OpenFreeMap: free vector tiles with no key and no usage limits */
  "OpenFreeMap.Liberty": "https://tiles.openfreemap.org/styles/liberty",
  "OpenFreeMap.Bright": "https://tiles.openfreemap.org/styles/bright",
  "OpenFreeMap.Positron": "https://tiles.openfreemap.org/styles/positron",
  "OpenFreeMap.Dark": "https://tiles.openfreemap.org/styles/dark",
  "OpenFreeMap.Fiord": "https://tiles.openfreemap.org/styles/fiord",

  "CartoDB.Positron":
    "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  "CartoDB.DarkMatter":
    "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  "CartoDB.Voyager":
    "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",

  /* Stadia authorizes by the requesting page's domain rather than a key:
   * heatflask.com is registered on the account and localhost is allowed. */
  "Stadia.AlidadeSmoothDark":
    "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json",
  "Stadia.Outdoors": "https://tiles.stadiamaps.com/styles/outdoors.json",
  "Stamen.Terrain": "https://tiles.stadiamaps.com/styles/stamen_terrain.json",
  "Stamen.TonerLite":
    "https://tiles.stadiamaps.com/styles/stamen_toner_lite.json",

  "OpenStreetMap.Mapnik": rasterStyle(
    "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    OSM,
    { maxzoom: 19 }
  ),
  "Esri.WorldImagery": rasterStyle(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    ESRI,
    { maxzoom: 19 }
  ),
  "Esri.NatGeoWorldMap": rasterStyle(
    "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    ESRI,
    { maxzoom: 16 }
  ),

  "Mapbox.dark": mapboxRaster("dark-v10"),
  "Mapbox.streets": mapboxRaster("streets-v11"),
  "Mapbox.outdoors": mapboxRaster("outdoors-v11"),
  "Mapbox.satellite": mapboxRaster("satellite-streets-v11"),

  "GSI.Standard 地理院 標準地図": rasterStyle(
    "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
    GSI,
    { minzoom: 2, maxzoom: 18 }
  ),
  "GSI.Pale 地理院 淡色地図": rasterStyle(
    "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
    GSI,
    { minzoom: 2, maxzoom: 18 }
  ),
}

/* ------------------------------------------------------------------ *
 * Terrain
 * ------------------------------------------------------------------ */

const DEM_SOURCE = "heatflask-dem"

/* Mapterhorn: open global terrain in Terrarium encoding, served with CORS.
 * (The AWS Terrain Tiles bucket has the data too, but sends no CORS header,
 * so WebGL cannot read it.) */
const DEM_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json"

const TERRAIN_EXAGGERATION = 1.5
/** The pitch terrain is shown at when it is switched on over a flat view */
const TERRAIN_PITCH = 60

function addTerrainSource(map: MLMap): void {
  if (map.getSource(DEM_SOURCE)) return
  map.addSource(DEM_SOURCE, {
    type: "raster-dem",
    url: DEM_TILEJSON,
    encoding: "terrarium",
    tileSize: 512,
  })
}

/* Whether the current style has finished loading, so sources can be added.
 * Not map.isStyleLoaded(): that is also false while any tile is loading, which
 * during "style.load" is always -- so waiting on it waited for a "style.load"
 * that had already happened. */
let styleReady = false

export function setTerrain(map: MLMap, on: boolean, tilt = true): void {
  if (!styleReady) return // BindMap's style.load handler applies visual.terrain
  if (on) {
    addTerrainSource(map)
    map.setTerrain({ source: DEM_SOURCE, exaggeration: TERRAIN_EXAGGERATION })
    map.setSky({
      "sky-color": "#1d3a66",
      "horizon-color": "#8fb4d9",
      "fog-color": "#cfd9e3",
      "sky-horizon-blend": 0.6,
      "horizon-fog-blend": 0.5,
      "fog-ground-blend": 0.8,
    })
    if (tilt && map.getPitch() < 10) map.easeTo({ pitch: TERRAIN_PITCH })
  } else {
    map.setTerrain(null)
  }
}

/* ------------------------------------------------------------------ *
 * The map
 * ------------------------------------------------------------------ */

type latlng = { lat: number; lng: number }

/* Leaflet counted zoom on 256px tiles and MapLibre counts it on 512px ones,
 * so the same scale is one level lower here. Links, geohashes and the dot
 * scaling all speak Leaflet's zoom, so it is converted at the map's edge. */
export const toMapZoom = (leafletZoom: number) => leafletZoom - 1
export const fromMapZoom = (mapZoom: number) => mapZoom + 1

export function CreateMap(
  container: HTMLElement | string = "map",
  center: latlng = { lat: 0, lng: 0 },
  zoom = 3
): MLMap {
  const map = new MLMap({
    container,
    style: <StyleSpecification>baselayers.None,
    center: [center.lng, center.lat],
    zoom: toMapZoom(zoom),
    maxPitch: 85,
    attributionControl: { compact: true },
  })

  map.addControl(
    new NavigationControl({ visualizePitch: true }),
    "bottom-right"
  )
  map.addControl(new Watermarks(), "bottom-left")
  return map
}

class Watermarks implements IControl {
  private el: HTMLDivElement

  onAdd(): HTMLElement {
    this.el = document.createElement("div")
    this.el.className = "maplibregl-ctrl heatflask-watermarks"
    for (const src of [strava_logo, heatflask_logo]) {
      const img = document.createElement("img")
      img.src = src
      this.el.appendChild(img)
    }
    return this.el
  }

  onRemove(): void {
    this.el.remove()
  }
}

/** Every "style.load" -- the first, and each basemap change -- runs these,
 * since a new style arrives without anything the old one had added. */
const styleLoadHooks: ((map: MLMap) => void)[] = []

export function onStyleLoad(map: MLMap, hook: (map: MLMap) => void): void {
  styleLoadHooks.push(hook)
  if (styleReady) hook(map)
}

let currentBaselayer: string

export function setBaselayer(map: MLMap, name: string): void {
  const style = baselayers[name]
  if (!style || name === currentBaselayer) return
  currentBaselayer = name
  styleReady = false
  map.setStyle(style, { diff: false })
}

export function BindMap(map: MLMap, appState: State): void {
  const { query, visual } = appState

  map.on("style.load", () => {
    styleReady = true
    for (const hook of styleLoadHooks) hook(map)
    if (visual.terrain) setTerrain(map, true, false)
  })

  /* A link or saved setting can name a layer that no longer exists */
  if (!(visual.baselayer in baselayers)) {
    console.warn(`unknown baselayer "${visual.baselayer}"; using the default`)
    visual.baselayer = DefaultVisual.baselayer
  }

  map.jumpTo({
    center: [visual.center.lng, visual.center.lat],
    zoom: toMapZoom(visual.zoom),
    pitch: visual.pitch || 0,
    bearing: visual.bearing || 0,
  })
  setBaselayer(map, visual.baselayer)

  visual.onChange(
    "baselayer",
    (name: string) => {
      setBaselayer(map, name)
      setURLfromQV({ visual, query })
    },
    false
  )

  visual.onChange(
    "terrain",
    (on: boolean) => {
      setTerrain(map, !!on)
      setURLfromQV({ visual, query })
    },
    false
  )

  warnWhenBlocked(map)

  map.on("move", () => {
    const c = map.getCenter()
    const zoom = fromMapZoom(map.getZoom())
    visual.center = { lat: c.lat, lng: c.lng }
    visual.zoom = zoom
    visual.pitch = Math.round(map.getPitch())
    visual.bearing = Math.round(map.getBearing())
    visual.geohash = Geohash.encode(c.lat, c.lng, Math.round(zoom))
    setURLfromQV({ visual, query })
  })
}

/**
 * Say so when the map cannot reach one of the sites its data comes from.
 *
 * Basemaps, fonts and terrain all load from other sites, and a script or
 * content blocker -- NoScript, uBlock and the like -- can refuse any of them.
 * What the viewer sees then is a blank basemap, or terrain that silently stays
 * flat, with nothing to say why.
 *
 * A request that never got an HTTP response has status 0: blocked, offline,
 * or refused by CORS. Each such site is named once, in one notice.
 */
function warnWhenBlocked(map: MLMap): void {
  const hosts = new Set<string>()
  let notice: Dialog

  map.on("error", (e) => {
    const err = <{ status?: number; url?: string }>e.error
    if (!err || err.status !== 0 || !err.url) return

    let host: string
    try {
      host = new URL(err.url, location.href).host
    } catch {
      return
    }
    if (host === location.host || hosts.has(host)) return
    hosts.add(host)

    const list = [...hosts].map((h) => `<code>${escapeHTML(h)}</code>`)
    notice = notice || new Dialog(map.getContainer(), { position: "top" })
    notice
      .title("Some map data could not be loaded")
      .content(
        `<p>The map could not reach ${list.join(", ")}.</p>` +
          "<p>If you use NoScript, uBlock or another blocker, allow " +
          `${hosts.size > 1 ? "these sites" : "this site"} to see the ` +
          "basemap and 3D terrain.</p>"
      )
      .show()
  })
}
