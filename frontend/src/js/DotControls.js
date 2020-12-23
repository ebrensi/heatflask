/*
 * Dot Animation Controls
 */
import "leaflet-easybutton"
import { map } from "./MapAPI.js"
import { dotLayer } from "./DotLayerAPI.js"
import { vParams } from "./Model.js"

const ds = dotLayer.dotSettings
const update = dotLayer.updateDotSettings
const options = dotLayer.options

const easyButton = window.L.easyButton

// leaflet-easybutton is used for play/pause button and capture
// animation play-pause button
const button_states = [
  {
    stateName: "animation-running",
    icon: "fa-pause",
    title: "Pause Animation",
    onClick: function (btn) {
      dotLayer.pause()
      vParams.paused = true
      btn.state("animation-paused")
    },
  },

  {
    stateName: "animation-paused",
    icon: "fa-play",
    title: "Resume Animation",
    onClick: function (btn) {
      vParams.paused = false
      dotLayer.animate()
      btn.state("animation-running")
    },
  },
]

// add play/pause button to the map
easyButton({
  states: vParams.paused ? button_states.reverse() : button_states,
}).addTo(map)

/*
 * Sliders and checkboxes on dot controls tab
 */

if (vParams.shadows) {
  options.dotShadows.enabled = vParams.shadows
} else {
  vParams.shadows = options.dotShadows.enabled
}

vParams.onChange("shadows", (shadows) => {
  update({ enabled: shadows })
})

if (vParams.paths) {
  options.showPaths = vParams.paths
} else {
  vParams.paths = options.showPaths
}

vParams.onChange("paths", (paths) => {
  options.showPaths = paths
})

vParams.onChange("tau", update)
vParams.onChange("T", update)
vParams.onChange("sz", update)
