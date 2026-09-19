/*
 * MapAPI -- the MapLibre GL map, its basemaps, and 3D terrain.
 *
 * A basemap is named for the map it is, and answers to every name it has been
 * given here before (see `aka`), so a baselayer saved in someone's link still
 * resolves. Several of them are vector styles now where they were raster
 * tiles: CARTO's and Stadia's styles are published both ways, and the vector
 * versions stay sharp at fractional zoom and when the map is pitched or
 * rotated.
 */

import Geohash from "latlon-geohash"
import {
  Map as MLMap,
  NavigationControl,
  GeolocateControl,
  setWorkerUrl,
} from "maplibre-gl"

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

/* MapLibre 6 looks for its worker next to its own module file, which isn't
 * there once Parcel has bundled it; without the worker, vector tiles and
 * raster-dem terrain silently never load. */
setWorkerUrl(
  new URL("npm:maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href
)

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

export type Basemap = {
  /** What the layer picker shows: the map's own name, as its maker writes it */
  label: string
  style: string | StyleSpecification
  /** Names this map has gone by here, so links carrying one still resolve */
  aka?: string[]
}

export const baselayers: Record<string, Basemap> = {
  None: {
    label: "None",
    style: {
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
  },

  /* OpenFreeMap: free vector tiles with no key and no usage limits */
  "OpenFreeMap.Liberty": {
    label: "OpenFreeMap Liberty",
    style: "https://tiles.openfreemap.org/styles/liberty",
  },
  "OpenFreeMap.Bright": {
    label: "OpenFreeMap Bright",
    style: "https://tiles.openfreemap.org/styles/bright",
  },
  "OpenFreeMap.Positron": {
    label: "OpenFreeMap Positron",
    style: "https://tiles.openfreemap.org/styles/positron",
  },
  "OpenFreeMap.Dark": {
    label: "OpenFreeMap Dark",
    style: "https://tiles.openfreemap.org/styles/dark",
  },
  "OpenFreeMap.Fiord": {
    label: "OpenFreeMap Fiord",
    style: "https://tiles.openfreemap.org/styles/fiord",
  },

  /* CARTO, which was CartoDB when these were first added here */
  "CARTO.Positron": {
    label: "CARTO Positron",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
    aka: ["CartoDB.Positron"],
  },
  "CARTO.DarkMatter": {
    label: "CARTO Dark Matter",
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
    aka: ["CartoDB.DarkMatter"],
  },
  "CARTO.Voyager": {
    label: "CARTO Voyager",
    style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
    aka: ["CartoDB.Voyager"],
  },

  /* Stadia authorizes by the requesting page's domain rather than a key:
   * heatflask.com is registered on the account and localhost is allowed.
   * The Stamen styles are Stamen's designs, hosted by Stadia since 2023 --
   * which is why they are under Stadia here but still called Stamen. */
  "Stadia.AlidadeSmoothDark": {
    label: "Alidade Smooth Dark",
    style: "https://tiles.stadiamaps.com/styles/alidade_smooth_dark.json",
  },
  "Stadia.Outdoors": {
    label: "Stadia Outdoors",
    style: "https://tiles.stadiamaps.com/styles/outdoors.json",
  },
  "Stadia.StamenTerrain": {
    label: "Stamen Terrain",
    style: "https://tiles.stadiamaps.com/styles/stamen_terrain.json",
    aka: ["Stamen.Terrain"],
  },
  "Stadia.StamenTonerLite": {
    label: "Stamen Toner Lite",
    style: "https://tiles.stadiamaps.com/styles/stamen_toner_lite.json",
    aka: ["Stamen.TonerLite"],
  },

  /* "Mapnik" was the renderer; OpenStreetMap calls this map Standard */
  "OpenStreetMap.Standard": {
    label: "OpenStreetMap",
    style: rasterStyle("https://tile.openstreetmap.org/{z}/{x}/{y}.png", OSM, {
      maxzoom: 19,
    }),
    aka: ["OpenStreetMap.Mapnik"],
  },

  "Esri.WorldImagery": {
    label: "Esri World Imagery",
    style: rasterStyle(
      "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ESRI,
      { maxzoom: 19 }
    ),
  },
  "Esri.NatGeoWorldMap": {
    label: "Esri NatGeo World Map",
    style: rasterStyle(
      "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
      ESRI,
      { maxzoom: 16 }
    ),
  },

  "Mapbox.Dark": {
    label: "Mapbox Dark",
    style: mapboxRaster("dark-v10"),
    aka: ["Mapbox.dark"],
  },
  "Mapbox.Streets": {
    label: "Mapbox Streets",
    style: mapboxRaster("streets-v11"),
    aka: ["Mapbox.streets"],
  },
  "Mapbox.Outdoors": {
    label: "Mapbox Outdoors",
    style: mapboxRaster("outdoors-v11"),
    aka: ["Mapbox.outdoors"],
  },
  /* The style is satellite-streets: satellite imagery with roads and labels */
  "Mapbox.SatelliteStreets": {
    label: "Mapbox Satellite Streets",
    style: mapboxRaster("satellite-streets-v11"),
    aka: ["Mapbox.satellite"],
  },

  "GSI.Standard": {
    label: "GSI 標準地図 (Standard)",
    style: rasterStyle(
      "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png",
      GSI,
      { minzoom: 2, maxzoom: 18 }
    ),
    aka: ["GSI.Standard 地理院 標準地図"],
  },
  "GSI.Pale": {
    label: "GSI 淡色地図 (Pale)",
    style: rasterStyle(
      "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png",
      GSI,
      { minzoom: 2, maxzoom: 18 }
    ),
    aka: ["GSI.Pale 地理院 淡色地図"],
  },
}

/** Every name a basemap has ever answered to here, mapped to its name now */
const baselayerAliases: Record<string, string> = {}
for (const [name, basemap] of Object.entries(baselayers)) {
  for (const old of basemap.aka ?? []) baselayerAliases[old] = name
}

/**
 * The current name of a basemap, given any name it has gone by, or undefined
 * if we have no such map. A link someone saved years ago names it the way it
 * was named then, and those links are the reason the old names are kept.
 */
export function resolveBaselayer(name: string): string | undefined {
  if (name in baselayers) return name
  return baselayerAliases[name]
}

/* ------------------------------------------------------------------ *
 * Terrain
 * ------------------------------------------------------------------ */

const DEM_SOURCE = "heatflask-dem"

/* Mapterhorn: open global terrain in Terrarium encoding, served with CORS.
 * (The AWS Terrain Tiles bucket has the data too, but sends no CORS header,
 * so WebGL cannot read it.) Its tilejson gives no maxzoom, so MapLibre assumes
 * 22 and asks for tiles that 404 when zoomed in. Coverage is uneven: z12
 * over all land, z16 over most of North America, Europe and New Zealand, z17
 * only in patches (the Alps, Paris, Madrid). Above 16 the rare extra detail is
 * invisible at our exaggeration, so we stop there and overzoom. Where the data
 * stops at z12, z13-16 still 404, and MapLibre fills them from any coarser
 * tile it has already loaded (TerrainTileManager.getSourceTile). */
const DEM_TILEJSON = "https://tiles.mapterhorn.com/tilejson.json"
const DEM_MAXZOOM = 16

const TERRAIN_EXAGGERATION = 1.5
/** The pitch terrain is shown at when it is switched on over a flat view */
const TERRAIN_PITCH = 60

function addTerrainSource(map: MLMap): void {
  if (map.getSource(DEM_SOURCE)) return
  map.addSource(DEM_SOURCE, {
    type: "raster-dem",
    url: DEM_TILEJSON,
    maxzoom: DEM_MAXZOOM,
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
    style: <StyleSpecification>baselayers.None.style,
    center: [center.lng, center.lat],
    zoom: toMapZoom(zoom),
    maxPitch: 85,
    attributionControl: { compact: true },
  })

  map.addControl(
    new NavigationControl({ visualizePitch: true }),
    "bottom-right"
  )
  map.addControl(
    new GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    }),
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
  const basemap = baselayers[name]
  if (!basemap || name === currentBaselayer) return
  currentBaselayer = name
  /* The old style's terrain outlives it: while a URL style is being fetched
   * the map still draws terrain depth, against a style that has no projection
   * yet, and throws in painter.useProgram. The "style.load" handler puts
   * terrain back. */
  if (styleReady && map.terrain) map.setTerrain(null)
  styleReady = false
  map.setStyle(basemap.style, { diff: false })
}

export function BindMap(map: MLMap, appState: State): void {
  const { query, visual } = appState

  map.on("style.load", () => {
    styleReady = true
    for (const hook of styleLoadHooks) hook(map)
    if (visual.terrain) setTerrain(map, true, false)
  })

  /* A link or saved setting can name a layer by a name it has since outgrown,
   * or one that no longer exists at all. Resolving it here rather than at the
   * point of use also rewrites the URL to the current name. */
  const baselayer = resolveBaselayer(visual.baselayer)
  if (!baselayer) {
    console.warn(`unknown baselayer "${visual.baselayer}"; using the default`)
  }
  visual.baselayer = baselayer ?? DefaultVisual.baselayer

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

  /* The dials and the Shadows box change these, and until now the URL only
   * caught up with them the next time the map moved: a link copied straight
   * after turning a dial did not show what its sender saw. */
  for (const p of ["tau", "T", "sz", "alpha", "pw", "cr", "shadows"] as const)
    visual.onChange(p, () => setURLfromQV({ visual, query }), false)

  warnWhenBlocked(map)

  map.on("move", (e) => {
    const c = map.getCenter()
    const zoom = fromMapZoom(map.getZoom())
    visual.center = { lat: c.lat, lng: c.lng }
    visual.zoom = zoom
    visual.pitch = Math.round(map.getPitch())
    visual.bearing = Math.round(map.getBearing())
    visual.geohash = Geohash.encode(c.lat, c.lng, Math.round(zoom))
    /* e.originalEvent is only set for a real user gesture (drag, scroll,
     * pinch, keyboard) -- not for a programmatic jumpTo/easeTo/fitBounds
     * such as autozoom's fitTo(). Once the user has taken the wheel, stop
     * auto-fitting so their chosen view is what gets saved to the URL. */
    if (e.originalEvent && visual.autozoom) visual.autozoom = false
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
