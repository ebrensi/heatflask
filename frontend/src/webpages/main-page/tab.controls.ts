import pureknob from "npm:pure-knob"
import { State } from "~/src/js/Model"

const knob = pureknob.createKnob(250, 250)
// Create element node.
const node = knob.node()

// Add it to the DOM.
export default function onload(state: State) {
  const elem = document.getElementById("knob")
  elem.appendChild(node)
}
