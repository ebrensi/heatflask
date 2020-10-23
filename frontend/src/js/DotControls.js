/*
 * UI components for DotLayer control
 */
import "leaflet-easybutton"

import { map } from "./mapAPI.js"
import { dotLayer } from "./DotLayerAPI.js"
import { updateURL } from "./URL.js"
import { vparams } from "./Model.js"

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

