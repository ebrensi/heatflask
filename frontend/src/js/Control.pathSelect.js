import * as L from "leaflet";
import "./L.BoxHook.js";
import "./L.SwipeSelect.js";

import { map, dotLayer } from "./mainComponents.js";
import appState from "./appState.js";

// Select-activities-in-region functionality IIFE
function doneSelecting(obj) {
  dotLayer.setSelectRegion(obj.pxBounds, function (ids) {
    if (selectControl.canvas) {
      selectControl.remove();
      selectButton.state("not-selecting");
    }

    // handle_path_selections returns the id of the single
    // selected activity if only one is selected
    const id = handle_path_selections(ids);

    if (id) {
      const A = appState.items.get(id),
        loc = A.bounds.getCenter();

      setTimeout(function () {
        activityDataPopup(id, loc);
      }, 100);
    }
  });
}

// set hooks for ctrl-drag
map.on("boxhookend", doneSelecting);
const selectControl = new L.SwipeSelect({}, doneSelecting);

// button for selecting via touchscreen
const selectButton_states = [
  {
    stateName: "not-selecting",
    icon: "fa-object-group",
    title: "Toggle Path Selection",
    onClick: function (btn, map) {
      btn.state("selecting");
      selectControl.addTo(map);
    },
  },
  {
    stateName: "selecting",
    icon: "<span>&cross;</span>",
    title: "Stop Selecting",
    onClick: function (btn, map) {
      btn.state("not-selecting");
      selectControl.remove();
    },
  },
];

import "../../node_modules/leaflet-easybutton/src/easy-button.d.ts";
import "../../node_modules/leaflet-easybutton/src/easy-button.css";
selectButton = L.easyButton({
  states: selectButton_states,
  position: "topright",
});

export default selectButton;

function handle_path_selections(ids) {
  // if (!ids) return;
  // const toSelect = [],
  //       toDeSelect = [];
  // let count = 0,
  //     id;
  // for (id of ids) {
  //     const A = appState.items.get(id),
  //           tag = `#${A.id}`;
  //     if (A.selected)
  //         toDeSelect.push(tag);
  //     else
  //         toSelect.push(tag);
  //     count++;
  // }
  // // simulate table (de)selections
  // // note that table selection events get triggered
  // // either way
  // // atable.rows(toSelect).select();
  // // atable.rows(toDeSelect).deselect();
  // if (toSelect.length == 1) {
  //     let row = $(toSelect[0]);
  //     tableScroller.scrollTop(row.prop('offsetTop') - tableScroller.height()/2);
  // }
  // if (count === 1)
  //     return id
}
