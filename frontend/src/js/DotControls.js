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
  update(null, { enabled: shadows })
})

if (vParams.paths) {
  options.showPaths = vParams.paths
} else {
  vParams.paths = options.showPaths
}

vParams.onChange("paths", (paths) => {
  options.showPaths = paths
})

const SPEED_SCALE = 5.0,
  SEP_SCALE = { m: 0.15, b: 15.0 }

const settingsLinks = {
  alphaScale: "alpha",
  dotScale: "sz",
  C1: "c1",
  C2: "c2",
}

for (const [dsKey, vpKey] of Object.entries(settingsLinks)) {
  if (vParams[vpKey]) {
    ds[dsKey] = vParams[vpKey]
  } else {
    vParams[vpKey] = ds[dsKey]
  }

  vParams.onChange(vpKey, (newVal) => {
    update({ [dsKey]: newVal })
  })
}

/*
// Dom.set("#sepConst", (Math.log2(C1) - SEP_SCALE.b) / SEP_SCALE.m );
// Dom.set("#speedConst", Math.sqrt(C2) / SPEED_SCALE );
// Dom.set("#dotScale", ds["dotScale"]);
// Dom.set("#dotAlpha", ds["dotAlpha"]);

knobs.speed.setValue(Math.sqrt(C2) / SPEED_SCALE)
knobs.period.setValue((Math.log2(C1) - SEP_SCALE.b) / SEP_SCALE.m)
knobs.dotSize.setValue(SZ)
knobs.dotAlpha.setValue(1)

function knobListener(knob, val) {
  let updatePeriod

  const knobName = knob["_properties"]["label"]

  switch (knobName) {
    case "Speed":
      vparams.c2 = val * val * SPEED_SCALE
      dotLayer.updateDotSettings({ C2: vparams.c2 })
      console.log("C2: " + vparams.c2)
      updatePeriod = true
      break

    case "Sparcity":
      vparams.c1 = Math.pow(2, val * SEP_SCALE.m + SEP_SCALE.b)
      dotLayer.updateDotSettings({ C1: vparams.c1 })
      console.log("C1: " + vparams.c1)
      updatePeriod = true
      break

    case "Alpha":
      vparams.alpha = val / 10
      dotLayer.updateDotSettings({ alphaScale: vparams.alpha })
      dotLayer.drawPaths()
      console.log("alpha: " + vparams.alpha)
      break

    case "Size":
      vparams.sz = val
      dotLayer.updateDotSettings({ dotScale: val })
      console.log("size: " + val)
      break
  }

  if (updatePeriod) {
    const cycleDuration = dotLayer.periodInSecs().toFixed(2)
    Dom.html("#period-value", cycleDuration)
  }

  updateURL()
}

for (const knob of Object.values(knobs)) {
  knob.addListener(knobListener)
}

*/
