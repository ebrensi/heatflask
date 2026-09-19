import { Knob } from "knob"
import type { KnobElement } from "knob"

import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import { dotLayer } from "~/src/js/DotLayerAPI"
import * as Table from "~/src/js/Table"

import CONTENT from "bundle-text:./tab.controls.html"
export { CONTENT }

export const ID = "ControlsTab"
export const TITLE = `<span data-i18n="tab.controls.title">Layer Settings</span>`
export const ICON = icon("equalizer")

const DIAL_FG = "rgba(0,255,255,0.8)"
const DIAL_BG = "rgba(255,255,255,0.2)"

/* One dial per row (see tab.controls.css), so they have room to be bigger.
 * 140px leaves space for the readout beside it in a 305px sidebar. The knob
 * draws its canvas at this size once, so it cannot follow CSS.
 *
 * They are not all one size any more: five 140px dials and a heading did not
 * fit the pane, and timescale and period, which set the shape of the
 * animation, are the ones worth the most travel. The other three are a step
 * down. Removing the "Model Parameters" heading paid for most of it. */
const DIAL_LG = 140
const DIAL_MD = 120

/* Every dial reports 0..100; each binding maps that onto its parameter */
const dialSpec = {
  min: 0,
  max: 100,
  step: 0.1,
  cursor: 20,
  displayInput: false,
  fgColor: DIAL_FG,
  bgColor: DIAL_BG,
}

const sized = (px: number) => ({ ...dialSpec, width: px, height: px })

const knobSpec = {
  speedConst: Knob(sized(DIAL_LG)),
  sepConst: Knob(sized(DIAL_LG)),
  sizeConst: Knob(sized(DIAL_MD)),
  widthConst: Knob(sized(DIAL_MD)),
  colorConst: Knob(sized(DIAL_MD)),
}

/* tau spans 0.5 .. 3600 -- a factor of 7200 -- so the dial cannot carry it
 * linearly. It carries a normalised exponent s in [0,1] instead:
 *
 *     tau(s) = TAU_LOW * (TAU_HIGH / TAU_LOW) ** s
 *
 * giving tau(0) = TAU_LOW and tau(1) = TAU_HIGH. every dial reports 0..100,
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

/* Dot size range: CHANGE THESE to make the dial reach smaller or bigger dots.
 * Was linear over 0.5..10, where everything past 7.5 was too big and the small
 * sizes were crammed into the first few degrees. Exponential like the others,
 * so each stretch of the dial multiplies the size by the same amount and the
 * small end gets as much travel as the big end. The floor should not go below
 * MIN_DOT_SIZE in DotLayer.ts, which is what is drawn for anything smaller. */
const SZ_LOW = 0.25
const SZ_HIGH = 7.5
const SZ_RATIO = SZ_HIGH / SZ_LOW

/* Path width in px, linear rather than exponential like the dials above,
 * because this one has to reach 0: at the bottom of its travel it turns the
 * paths off, which is what the "Show Paths" checkbox used to do. The width
 * is the one an unselected activity draws with when nothing is selected;
 * selected and unselected activities scale with it (see Defaults.ts). */
const PW_HIGH = 10

/* Colour rotation, in degrees of one turn of the palette. The knob sweeps a
 * full circle from the top, so the dial's angle is the rotation itself, and
 * its rest position -- 12 o'clock, 0 degrees -- is the palette unturned. A
 * full turn comes back to the same colours, which is why this dial is linear
 * where the others are exponential: there is nothing at either end of it to
 * reach. */
const CR_HIGH = 360

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
  param: "tau" | "T" | "sz" | "pw" | "cr"
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
  /** what the layer has to do about the new value; a repaint by default */
  apply?: () => void
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
    toParam: (v) => SZ_LOW * SZ_RATIO ** (v / 100),
    toDial: (sz) => (100 * Math.log(sz / SZ_LOW)) / Math.log(SZ_RATIO),
    readout: "szValue",
    format: (sz) => (sz < 1 ? sz.toFixed(2) : sz.toFixed(1)),
    /* A link made when the dial went to 20 can still carry sz=15. The knob
     * clamps what it shows but not the model, so the dots would draw at 15
     * with the dial at its stop. */
    range: { min: SZ_LOW, max: SZ_HIGH },
  },
  {
    id: "widthConst",
    param: "pw",
    toParam: (v) => (PW_HIGH * v) / 100,
    toDial: (pw) => (100 * pw) / PW_HIGH,
    readout: "pwValue",
    format: (pw) => (pw > 0 ? `${pw.toFixed(1)} px` : "off"),
    range: { min: 0, max: PW_HIGH },
    // the width is baked into the path geometry, so it has to be rebuilt
    apply: () => dotLayer.updatePathWidth(),
  },
  {
    id: "colorConst",
    param: "cr",
    toParam: (v) => (CR_HIGH * v) / 100,
    toDial: (cr) => (100 * cr) / CR_HIGH,
    readout: "crValue",
    format: (cr) => `${Math.round(cr)}\u00b0`,
    range: { min: 0, max: CR_HIGH },
    /* The dots take their colour from the meta texture and the list from the
     * same Activity objects, so both have to be told. */
    apply: () => {
      dotLayer.updateColors()
      Table.updateSwatches()
    },
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
    const { id, param, toParam, toDial, readout, format, range, apply } =
      binding
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
      if (apply) apply()
      else dotLayer.updateDotSettings()
    })
  }

  /* The dots' shadow is the most expensive thing the layer draws: blurring it
   * costs more GPU time a frame than the dots themselves (see SHADOW_FS). */
  const shadows = <HTMLInputElement>document.getElementById("showShadows")
  shadows.addEventListener("change", () => {
    visual.shadows = shadows.checked
  })
  visual.onChange("shadows", (on: boolean) => {
    shadows.checked = !!on
    dotLayer.updateDotSettings()
  })
}

/**
 * The one number that follows from the other two, shown beside T as "T ~ T/tau"
 * so the two read as one quantity in two units rather than two settings.
 *
 * T is the spacing between successive dots in activity-seconds, and the dot
 * pattern repeats every T of activity time -- so T is the period of the cycle.
 * tau converts activity time to real time, which puts the loop the viewer
 * actually sees at T/tau real seconds. That is also exactly what a capture
 * records: one loop. It moves with either dial, so both of them call this.
 */
function updateCycleInfo(visual: State["visual"]): void {
  const el = document.getElementById("cycleValue")
  if (!el) return

  const tau = +visual.tau
  const T = +visual.T
  el.textContent = tau > 0 && T > 0 ? fmtSecs(T / tau) : "—"
}
