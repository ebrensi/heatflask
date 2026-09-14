import { Knob } from "knob"
import type { KnobElement } from "knob"

import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import { dotLayer } from "~/src/js/DotLayerAPI"

import CONTENT from "bundle-text:./tab.controls.html"
export { CONTENT }

export const ID = "ControlsTab"
export const TITLE = "Layer Settings"
export const ICON = icon("equalizer")

const DIAL_FG = "rgba(0,255,255,0.8)"
const DIAL_BG = "rgba(255,255,255,0.2)"

/* 100px across, matching .dial in tab.controls.css. These were 140px, which
 * cannot sit beside a label in a sidebar that is 305px at its narrowest --
 * part of why the tab looked crowded. */
const dialSpec1 = {
  min: 0,
  max: 100,
  step: 0.1,
  width: 100,
  height: 100,
  cursor: 20,
  displayInput: false,
  fgColor: DIAL_FG,
  bgColor: DIAL_BG,
}

/* Dot size. Was 0.01..10, which bottomed out invisibly small, then 0.5..20,
 * which spent half the dial on dots far bigger than anyone wants. 10 is about
 * as big as they need to be, so the dial stops there and the smaller sizes get
 * twice the travel. The floor matches MIN_DOT_SIZE in DotLayer.ts: anything
 * lower is drawn at 0.5 anyway. */
const dialSpec2 = {
  min: 0.5,
  max: 10,
  step: 0.1,
  width: 100,
  height: 100,
  cursor: 20,
  displayInput: false,
  fgColor: DIAL_FG,
  bgColor: DIAL_BG,
}

const knobSpec = {
  speedConst: Knob(dialSpec1),
  sepConst: Knob(dialSpec1),
  sizeConst: Knob(dialSpec2),
}

/* tau spans 0.5 .. 3600 -- a factor of 7200 -- so the dial cannot carry it
 * linearly. It carries a normalised exponent s in [0,1] instead:
 *
 *     tau(s) = TAU_LOW * (TAU_HIGH / TAU_LOW) ** s
 *
 * giving tau(0) = TAU_LOW and tau(1) = TAU_HIGH. dialSpec1 reports 0..100,
 * so s = dialValue / 100. (From the original design notes in Model.ts.) */
const TAU_LOW = 0.5
const TAU_HIGH = 3600
const TAU_RATIO = TAU_HIGH / TAU_LOW

/* Sparsity s: the timestep between successive dots, in activity-seconds, so
 * one second of travel up to a full hour of it. Orders of magnitude again,
 * so the dial carries an exponent here too. The default of 60s lands the
 * dial exactly mid-travel. */
const S_LOW = 1
const S_HIGH = 3600
const S_RATIO = S_HIGH / S_LOW

/** A duration in seconds, at a length people can read at a glance. */
function fmtSecs(s: number): string {
  if (s < 10) return `${s.toFixed(1)} s`
  if (s < 60) return `${Math.round(s)} s`
  const m = Math.floor(s / 60)
  const rem = Math.round(s % 60)
  return rem ? `${m}m ${rem}s` : `${m} min`
}

type DialBinding = {
  id: keyof typeof knobSpec
  param: "tau" | "T" | "sz"
  /** dial position -> parameter value */
  toParam?: (dial: number) => number
  /** parameter value -> dial position */
  toDial?: (value: number) => number
  /** id of the element showing this parameter's current value */
  readout: string
  /** the value, as the reader should see it */
  format: (value: number) => string
  /** values outside this are clamped into it */
  range?: { min: number; max: number }
}

const dialBindings: DialBinding[] = [
  {
    id: "speedConst",
    param: "tau",
    toParam: (v) => TAU_LOW * TAU_RATIO ** (v / 100),
    toDial: (tau) => (100 * Math.log(tau / TAU_LOW)) / Math.log(TAU_RATIO),
    readout: "tauValue",
    /* tau is activity-seconds per real second, which is exactly a playback
     * speed, so show it the way people already read playback speeds. */
    format: (tau) => (tau < 10 ? `${tau.toFixed(1)}×` : `${Math.round(tau)}×`),
  },
  {
    id: "sepConst",
    param: "T",
    toParam: (v) => S_LOW * S_RATIO ** (v / 100),
    toDial: (s) => (100 * Math.log(s / S_LOW)) / Math.log(S_RATIO),
    readout: "TValue",
    format: fmtSecs,
  },
  {
    id: "sizeConst",
    param: "sz",
    readout: "szValue",
    format: (sz) => sz.toFixed(1),
    /* A link made when the dial went to 20 can still carry sz=15. The knob
     * clamps what it shows but not the model, so the dots would draw at 15
     * with the dial reading 10. */
    range: dialSpec2,
  },
]

/**
 * Add the dials to the DOM and bind them to the model and the layer.
 *
 * The binding half of this used to sit commented out in this file, against
 * `vParams`, which Model stopped exporting when it became appState.visual.
 * So the dials were created and appended -- visible, draggable -- and wired
 * to nothing.
 */
export function SETUP(state: State) {
  const { visual } = state

  for (const [id, knob] of Object.entries(knobSpec)) {
    document.getElementById(id).appendChild(knob)
  }

  for (const binding of dialBindings) {
    const { id, param, toParam, toDial, readout, format, range } = binding
    const knob = knobSpec[id]
    const fromDial = toParam || ((v: number) => v)
    const fromValue = toDial || ((v: number) => v)
    const readoutEl = document.getElementById(readout)

    // dial -> model
    knob.onchange = () => {
      visual[param] = fromDial(knob.getValue())
    }

    /* model -> dial, readout and layer. onChange fires immediately by default,
     * which conveniently seeds each dial and its readout from the current
     * value. The readouts used to be data-bind="info.tauInfo:innerText" and
     * data-bind="info.TInfo:innerText", but the model has no `info` class --
     * nothing was ever bound, so they sat permanently empty. */
    visual.onChange(param, (value: number) => {
      if (range && (value < range.min || value > range.max)) {
        // assigning notifies again, with the clamped value
        visual[param] = Math.min(range.max, Math.max(range.min, value))
        return
      }
      const dialValue = fromValue(value)
      if (Math.abs(knob.getValue() - dialValue) > 1e-9) knob.setValue(dialValue)
      if (readoutEl) readoutEl.textContent = format(value)
      updateCycleInfo(visual)
      dotLayer.updateDotSettings()
    })
  }

  bindCheckbox(visual, "showPaths", "paths", (on) => {
    dotLayer.options.showPaths = on
    dotLayer.redraw(true)
  })
}

/**
 * The one number that follows from the other two.
 *
 * T is the spacing between successive dots in activity-seconds, and the dot
 * pattern repeats every T of activity time -- so T is the period of the cycle.
 * tau converts activity time to real time, which puts the loop the viewer
 * actually sees at T/tau real seconds. That is also exactly what a capture
 * records: one loop.
 */
function updateCycleInfo(visual: State["visual"]): void {
  const el = document.getElementById("cycleInfo")
  if (!el) return

  const tau = +visual.tau
  const T = +visual.T
  if (!(tau > 0) || !(T > 0)) {
    el.textContent = ""
    return
  }

  el.innerHTML =
    `one loop = <code>T/&tau;</code> = ` +
    `<code>${fmtSecs(T / tau)}</code> of real time`
}

/** Two-way bind a checkbox to a boolean on appState.visual. */
function bindCheckbox(
  visual: State["visual"],
  elementId: string,
  param: "paths",
  apply: (on: boolean) => void
) {
  const el = <HTMLInputElement>document.getElementById(elementId)
  if (!el) return

  el.addEventListener("change", () => {
    visual[param] = el.checked
  })

  visual.onChange(param, (on: boolean) => {
    el.checked = on
    apply(on)
  })
}
