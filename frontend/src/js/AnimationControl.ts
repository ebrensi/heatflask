/*
 * A play/pause control for the dot animation.
 *
 * Deliberately not built on leaflet-easybutton: that package is a bare IIFE
 * referencing a global `L`, which does not exist under ESM bundling (nothing
 * in this codebase sets window.L). A plain Leaflet Control needs no such
 * global and is barely longer.
 */

import { Control, DomUtil, DomEvent } from "leaflet"
import { icon } from "./Icons"
import { dotLayer } from "./DotLayerAPI"

import type { Map as LMap } from "leaflet"
import type { State } from "./Model"

const PLAY_ICON = icon("play3")
const PAUSE_ICON = icon("pause2")

type ControlCtor = new () => { addTo(map: LMap): unknown }

export function addAnimationControl(map: LMap, appState: State): void {
  const { visual } = appState

  const AnimationControl = Control.extend({
    options: { position: "topleft" },

    onAdd: function () {
      const container = DomUtil.create(
        "div",
        "leaflet-bar leaflet-control animation-control"
      )
      const button = <HTMLAnchorElement>DomUtil.create("a", "", container)
      button.href = "#"
      button.setAttribute("role", "button")

      const render = () => {
        const paused = !!visual.paused
        button.innerHTML = paused ? PLAY_ICON : PAUSE_ICON
        button.title = paused ? "Resume animation" : "Pause animation"
        button.setAttribute("aria-label", button.title)
      }

      DomEvent.on(button, "click", (e: Event) => {
        // don't let the click reach the map underneath
        DomEvent.stop(e)
        visual.paused = !visual.paused
      })

      /* The model drives the layer, so anything else that flips visual.paused
       * gets the same behaviour and the button stays in sync. onChange fires
       * immediately, which also seeds the icon. */
      visual.onChange("paused", (paused: boolean) => {
        if (paused) dotLayer.pause()
        else dotLayer.animate()
        render()
      })

      return container
    },
  })

  new (<ControlCtor>(<unknown>AnimationControl))().addTo(map)
}
