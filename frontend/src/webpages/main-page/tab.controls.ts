import pureknob from "pure-knob"

const knob = pureknob.createKnob(100, 100)
// Create element node.
const node = knob.node()

// Add it to the DOM.
document.addEventListener("DOMContentLoaded", () => {
  const elem = document.getElementById("knob")
  elem.appendChild(node)
})
