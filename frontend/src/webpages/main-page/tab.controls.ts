import pureknob from "pure-knob"

import { icon as ico } from "~/src/js/Icons"
import { State } from "~/src/js/Model"

import content from "bundle-text:./tab.controls.html"
export { content }

export const id = "controls"
export const title = "Layer Settings"
export const icon = ico("equalizer")

const knob = pureknob.createKnob(250, 250)
// Create element node.
const node = knob.node()

// Add it to the DOM.
export function setup(state: State) {
  const elem = document.getElementById("knob")
  elem.appendChild(node)
}
