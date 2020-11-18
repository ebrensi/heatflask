import "./BoxHook.js"
import { SwipeSelect } from "./SwipeSelect.js"
import "leaflet-easybutton"
import { map, activityDataPopup } from "./MapAPI.js"
import { inPxBounds } from "./DotLayer/ActivityCollection.js"
import { dotLayer } from "./DotLayerAPI.js"
import { select } from "./Table.js"
const easyButton = window.L.easyButton

// Select-activities-in-region functionality IIFE
function doneSelecting(obj) {
  let count = 0
  let A

  for (A of inPxBounds(obj.pxBounds)) {
    select(A, !A.selected)
    A.selected && count++
  }

  if (selectControl.canvas) {
    selectControl.remove()
    selectButton.state("not-selecting")
  }

  if (!count) {
    return
  }

  dotLayer.redraw()

  /*
   * handle_path_selections returns the id of the single
   *  selected activity if only one is selected
   */
  if (count === 1) {
    const loc = A.llBounds.getCenter()

    setTimeout(function () {
      activityDataPopup(A, loc)
    }, 100)
  }
}


// set hooks for ctrl-drag
map.on("boxhookend", doneSelecting)
const selectControl = new SwipeSelect({}, doneSelecting)

// button for selecting via touchscreen
const selectButton_states = [
  {
    stateName: "not-selecting",
    icon: "fa-object-group",
    title: "Toggle Path Selection",
    onClick: function (btn, map) {
      btn.state("selecting")
      selectControl.addTo(map)
    },
  },
  {
    stateName: "selecting",
    icon: "<span>&cross;</span>",
    title: "Stop Selecting",
    onClick: function (btn) {
      btn.state("not-selecting")
      selectControl.remove()
    },
  },
]

export const selectButton = easyButton({
  states: selectButton_states,
  position: "topright",
}).addTo(map)


