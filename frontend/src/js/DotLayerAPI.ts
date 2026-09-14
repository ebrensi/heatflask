/*
 * DotLayerAPI -- creates the one DotLayer instance and exposes it.
 *
 * UI.ts imported `{ dotLayer }` from this module, but the module did not
 * exist: that import sat commented out, and nothing else imported DotLayer
 * either. That is why the animation layer was never bundled, never
 * typechecked, and never ran.
 */

import { DotLayer } from "./DotLayer/DotLayer"

import type { Map as LMap } from "leaflet"
import type { State } from "./Model"

/* Layer.extend() types its result as a constructor taking no arguments, but
 * Leaflet forwards whatever you pass to initialize(). This describes the
 * surface we actually use. */
type DotLayerInstance = {
  addTo(map: LMap): DotLayerInstance
  reset(): Promise<void>
  redraw(forceFullRedraw?: boolean): Promise<void>
  animate(): void
  pause(): void
  paused(): boolean
  updateDotSettings(shadowSettings?: { enabled?: boolean }): unknown
  options: { showPaths: boolean; dotShadows: { enabled: boolean } }

  /* Frame stepping, for Capture.ts: the length of one animation loop in real
   * seconds, a draw at an arbitrary time rather than "now", and the canvases
   * a capture composites (bottom to top), with the CSS filter the dot canvas
   * is displayed through. */
  periodInSecs(): number
  drawDotsAt(tsecs: number): Promise<number>
  canvases(): {
    path: HTMLCanvasElement
    dot: HTMLCanvasElement
    dotFilter: string
  }
}
type DotLayerCtor = new (options: Record<string, unknown>) => DotLayerInstance

// Assigned by createDotLayer(). Importers get the live binding.
export let dotLayer: DotLayerInstance = null

export function createDotLayer(map: LMap, appState: State) {
  const { visual } = appState
  const Ctor = <DotLayerCtor>(<unknown>DotLayer)

  dotLayer = new Ctor({
    // The animation settings (tau, T, sz, alpha, paused) are read from here
    visual: visual,
    showPaths: visual.paths,
    startPaused: visual.paused,
  })

  dotLayer.addTo(map)
  return dotLayer
}
