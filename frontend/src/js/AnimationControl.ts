/*
 * A play/pause control for the dot animation.
 */

import { icon } from "./Icons"
import { t } from "./i18n"
import { dotLayer } from "./DotLayerAPI"
import { ButtonControl } from "./MapControls"

import type { Map as MLMap } from "maplibre-gl"
import type { State } from "./Model"

const PLAY_ICON = icon("play3")
const PAUSE_ICON = icon("pause2")

export function addAnimationControl(map: MLMap, appState: State): void {
  const { visual } = appState

  const control = new ButtonControl("animation-control", () => {
    visual.paused = !visual.paused
  })

  /* The model drives the layer, so anything else that flips visual.paused
   * gets the same behaviour and the button stays in sync. onChange fires
   * immediately, which also seeds the icon. */
  visual.onChange("paused", (paused: boolean) => {
    if (paused) dotLayer.pause()
    else dotLayer.animate()
    control.set(
      paused ? PLAY_ICON : PAUSE_ICON,
      t(paused ? "map.resumeAnimation" : "map.pauseAnimation")
    )
  })

  map.addControl(control, "top-left")
}
