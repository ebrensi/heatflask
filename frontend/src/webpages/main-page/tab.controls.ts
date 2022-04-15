import pureknob from "pure-knob"

import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"

import CONTENT from "bundle-text:./tab.controls.html"
export { CONTENT }

export const ID = "controls"
export const TITLE = "Layer Settings"
export const ICON = icon("equalizer")

const knob = pureknob.createKnob(250, 250)
// Create element node.
const node = knob.node()

// Add it to the DOM.
export function SETUP(state: State) {
  const elem = document.getElementById("knob")
  elem.appendChild(node)
}
