/*
 * DotLayerAPI -- creates the one HeatflaskLayer and exposes it.
 */

import { HeatflaskLayer } from "./GL/HeatflaskLayer"
import { onStyleLoad } from "./MapAPI"
import { initClusters, updateClusters } from "./Clusters"

import type { Map as MLMap } from "maplibre-gl"
import type { State } from "./Model"

// Assigned by createDotLayer(). Importers get the live binding.
export let dotLayer: HeatflaskLayer = null

export function createDotLayer(map: MLMap, appState: State): HeatflaskLayer {
  const { visual } = appState

  dotLayer = new HeatflaskLayer({
    // The animation settings (tau, T, sz, paused) are read from here
    visual,
    showPaths: +visual.pw > 0,
    startPaused: visual.paused,
  })

  /* Markers for the activities too small to see at this zoom */
  initClusters(map)
  dotLayer.onUpdate = updateClusters

  /* On top of everything, labels included, as the canvases sat over Leaflet's
   * panes. Re-added after every basemap change, which replaces the style. */
  onStyleLoad(map, () => {
    if (!map.getLayer(dotLayer.id)) map.addLayer(dotLayer)
  })

  return dotLayer
}
