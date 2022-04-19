import { Knob } from "knob"
import type { KnobElement } from "knob"

import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"

import CONTENT from "bundle-text:./tab.controls.html"
export { CONTENT }

export const ID = "ControlsTab"
export const TITLE = "Layer Settings"
export const ICON = icon("equalizer")

const DIAL_FG = "rgba(0,255,255,0.8)"
const DIAL_BG = "rgba(255,255,255,0.2)"

const dialSpec1 = {
  min: 0,
  max: 100,
  step: 0.1,
  width: 140,
  height: 140,
  cursor: 20,
  displayInput: false,
  fgColor: DIAL_FG,
  bgColor: DIAL_BG,
}

const dialSpec2 = {
  min: 0.01,
  max: 10,
  step: 0.01,
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
  alphaConst: Knob(dialSpec2),
  sizeConst: Knob(dialSpec2),
}

// Add it to the DOM.
export function SETUP(state: State) {
  for (const [id, knob] of Object.entries(knobSpec)) {
    document.getElementById(id).appendChild(knob)
  }
}
