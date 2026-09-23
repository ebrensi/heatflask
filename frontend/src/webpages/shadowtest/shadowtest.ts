/*
 * A throwaway harness for looking at the dot layer on its own: synthetic
 * activities, a flat background basemap, and the layer exposed on window so
 * a debugger can pause it, toggle shadows and switch to the globe.
 */
import { Map as MLMap } from "maplibre-gl"
import "maplibre-gl/dist/maplibre-gl.css"

import { HeatflaskLayer } from "../../js/GL/HeatflaskLayer"
import * as ActivityCollection from "../../js/DotLayer/ActivityCollection"
import { DefaultVisual } from "../../js/Model"
import type { ImportedActivity } from "../../js/DataImport"

const CENTER: [number, number] = [-122.2, 37.83] // lng, lat
const N_ACTIVITIES = 24
const N_POINTS = 400

function synth(i: number): ImportedActivity {
  const time = new Uint32Array(N_POINTS)
  const altitude = new Int16Array(N_POINTS)
  const latlng = new Float32Array(2 * N_POINTS)

  // a circle of its own radius and phase, so the dots spread out
  const radius = 0.004 + 0.0015 * (i % 6)
  const phase = (2 * Math.PI * i) / N_ACTIVITIES
  let minLat = 90
  let maxLat = -90
  let minLng = 180
  let maxLng = -180
  for (let k = 0; k < N_POINTS; k++) {
    const t = (2 * Math.PI * k) / N_POINTS + phase
    const lat = CENTER[1] + radius * Math.sin(t)
    const lng = CENTER[0] + radius * Math.cos(t) * 1.3
    time[k] = k * 3
    altitude[k] = 20 + Math.round(30 * Math.sin(t))
    latlng[2 * k] = lat
    latlng[2 * k + 1] = lng
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
  }

  return {
    _id: 1000 + i,
    U: 1,
    "#a": 1,
    "#p": 0,
    "+": 100,
    s: 1700000000 + i * 86400,
    o: -25200,
    D: 5000,
    T: N_POINTS * 3,
    M: N_POINTS * 3,
    B: { SW: [minLat, minLng], NE: [maxLat, maxLng] },
    c: false,
    p: false,
    N: `synthetic ${i}`,
    t: "Run",
    v: "everyone",
    streams: { time, altitude, latlng },
  } as unknown as ImportedActivity
}

const visual = { ...DefaultVisual, sz: 4, T: 60, tau: 30, pw: 1 }

const PLAIN = {
  version: 8 as const,
  sources: {},
  layers: [
    {
      id: "bg",
      type: "background" as const,
      paint: { "background-color": "#b9b9b9" },
    },
  ],
}
const LIBERTY = "https://tiles.openfreemap.org/styles/liberty"

const map = new MLMap({
  container: "map",
  style: new URL(window.location.href).searchParams.get("plain")
    ? PLAIN
    : LIBERTY,
  center: CENTER,
  zoom: 12,
  attributionControl: false,
})

function setTerrain(on: boolean) {
  if (on) {
    if (!map.getSource("dem"))
      map.addSource("dem", {
        type: "raster-dem",
        url: "https://tiles.mapterhorn.com/tilejson.json",
        maxzoom: 16,
        encoding: "terrarium",
      })
    map.setTerrain({ source: "dem", exaggeration: 1 })
  } else map.setTerrain(null)
}

const layer = new HeatflaskLayer({
  visual,
  showPaths: true,
  startPaused: false,
})

map.on("load", async () => {
  ActivityCollection.clear()
  for (let i = 0; i < N_ACTIVITIES; i++) ActivityCollection.add(synth(i))
  map.addLayer(layer)
  await layer.reset()
  ;(<Record<string, unknown>>(<unknown>window)).ready = true
})
;(<Record<string, unknown>>(<unknown>window)).T = {
  map,
  layer,
  visual,
  setTerrain,
}
