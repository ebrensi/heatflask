/*
 * UI components for DotLayer control
 */

import pureknob from "pure-knob"
import "leaflet-easybutton"

import * as Dom from "../Dom.js"
import { map } from "../mapAPI.js"
import { dotLayer } from "../DotLayerAPI.js"
import { updateURL } from "./URL.js"
import { vparams } from "../Model.js"

// Initialize knob controls for dotlayer
const rad = (deg) => (deg * Math.PI) / 180,
  initial_knob_settings = {
    angleStart: rad(0),
    angleEnd: rad(360),
    angleOffset: rad(-90),
    colorFG: "rgba(0,255,255,0.4)",
    colorBG: "rgba(255,255,255,0.2)",
    trackWidth: 0.5,
    valMin: 0,
    valMax: 100,
    needle: true,
  }

function makeKnob(selector, options) {
  const knob = pureknob.createKnob(options.width, options.height),
    mySettings = Object.assign({}, initial_knob_settings)

  Object.assign(mySettings, options)

  for (const [property, value] of Object.entries(mySettings)) {
    knob.setProperty(property, value)
  }

  const node = knob.node()

  Dom.el(selector).appendChild(node)

  return knob
}

/* set initial values from defaults or specified in url
    url params over-ride default values */
const dotConstants = dotLayer.getDotSettings()

const C1 = vparams.c1 || dotConstants["C1"],
  C2 = vparams.c2 || dotConstants["C2"],
  SZ = vparams.sz || dotConstants["dotScale"]

dotConstants["C1"] = vparams.c1 = C1
dotConstants["C2"] = vparams.c2 = C2
dotConstants["dotScale"] = vparams.sz = SZ

const SPEED_SCALE = 5.0,
  SEP_SCALE = { m: 0.15, b: 15.0 }

// Dom.set("#sepConst", (Math.log2(C1) - SEP_SCALE.b) / SEP_SCALE.m );
// Dom.set("#speedConst", Math.sqrt(C2) / SPEED_SCALE );
// Dom.set("#dotScale", ds["dotScale"]);
// Dom.set("#dotAlpha", ds["dotAlpha"]);

// Instantiate knob controls with initial values and add them to the DOM
const knobs = {
  timeScale: makeKnob("#dot-controls1", {
    width: "150",
    height: "150",
    label: "Speed",
  }),

  period: makeKnob("#dot-controls1", {
    width: "150",
    height: "150",
    label: "Sparcity",
  }),

  dotAlpha: makeKnob("#dot-controls2", {
    width: "100",
    height: "100",
    valMin: 0,
    valMax: 10,
    label: "Alpha",
  }),

  dotSize: makeKnob("#dot-controls2", {
    width: "100",
    height: "100",
    valMin: 0,
    valMax: 10,
    label: "Size",
  }),
}

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

/* initialize shadow setting and change event */
const shadows = vparams["shadows"]
Dom.prop("#shadows", "checked", shadows)
dotLayer.updateDotSettings(dotConstants, { enabled: shadows })
Dom.addEvent("#shadows", "change", (e) => {
  const enabled = e.target.checked
  dotLayer.updateDotSettings(null, { enabled: enabled })
  vparams["shadows"] = enabled
  updateURL()
})

/* initialize show-paths setting and change event */
const paths = vparams["paths"]
Dom.prop("#showPaths", "checked", paths)
dotLayer.options.showPaths = paths
Dom.addEvent("#showPaths", "change", (e) => {
  dotLayer.options.showPaths = vparams.paths = e.target.checked
  dotLayer._redraw()
  updateURL()
})

// leaflet-easybutton is used for play/pause button and capture
// animation play-pause button
const button_states = [
  {
    stateName: "animation-running",
    icon: "fa-pause",
    title: "Pause Animation",
    onClick: function (btn) {
      // pauseFlow();
      dotLayer.pause()
      vparams.paused = true
      updateURL()
      btn.state("animation-paused")
    },
  },

  {
    stateName: "animation-paused",
    icon: "fa-play",
    title: "Resume Animation",
    onClick: function (btn) {
      vparams.paused = false
      dotLayer.animate()
      updateURL()
      btn.state("animation-running")
    },
  },
]

// add play/pause button to the map
L.easyButton({
  states: vparams.paused ? button_states.reverse() : button_states,
}).addTo(map)
