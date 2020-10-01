import app from "./Model.js";
import { L, controlWindow } from "./MapAPI.js";
// import { dotLayer } from "./DotLayerAPI.js";
import { ATYPE } from "./strava.js";
import queryBackend from "./Socket.js";

import { dataTable } from "./Table.js";

let numActivities, count;
const dtRows = dataTable.rows();

app.dataTable = dataTable;

/*
 * Set up a message box that appears only when app.flags.importing is true
 */
const importInfoBox = controlWindow({
  position: "center",
  title: '<i class="fas fa-download"></i> Importing...',
  content: `<div class="info-message"></div>
            <div class="progress msgbox">
            <progress class="progbar"></progress>
            </div>`,
  prompt: {},
  visible: false,
});

app.flags.onChange("importing", (val) => {
  val ? importInfoBox.show() : importInfoBox.hide();
});

const infoMsgElements = document.querySelectorAll(".info-message"),
  progBars = document.querySelectorAll(".progbar");

/*
 * Display a progress message and percent-completion
 */
function displayProgressInfo(msg, progress) {
  if (!msg && !progress) {
    infoMsgElements.forEach((el) => (el.innerHTML = ""));
    progBars.forEach((el) => el.removeAttribute("value"));
    return;
  }

  if (msg) {
    for (const el of infoMsgElements) {
      el.innerHTML = msg;
    }
  }

  if (progress) {
    for (const el of progBars) {
      el.value = progress;
    }
  }
}

// app.box = displayProgressInfo;

/*
 * Send a query to the backend and populate the table and dotlayer with it.
 */
export function makeQuery(query, done) {
  app.flags.importing = true;
  numActivities = 0;
  count = 0;
  displayProgressInfo("Retrieving activity data...");

  queryBackend(query, onMessage, done);
}

export function abortQuery() {
  app.flags.importing = false;
}

// when done
// Dom.prop("#renderButton", "disabled", false);
// doneRendering("Finished.");
// return;

/*
 *  this is the callback for our data importer. If there is an open
 *    connection with the data-layer (backend server), it gets called on
 *    every received message.
 *
 * @param {Object} A - A JSON object ecoding 1 message from the data layer
 */
function onMessage(A) {
  if (!("_id" in A)) {
    if ("idx" in A) {
      displayProgressInfo(`indexing...${A["idx"]}`);
    } else if ("count" in A) {
      numActivities += A["count"];
    } else if ("delete" in A) {
      const toDelete = A["delete"];
      if (toDelete.length) {
        // delete all ids in A.delete
        for (let id of toDelete) {
          app.items.delete(id);
        }
        // dotLayer.removeItems(toDelete);
      }
    } else if ("done" in A) {
      console.log("received done");
      // doneRendering("Done rendering.");
    } else if ("msg" in A) {
      displayProgressInfo(A.msg);
    }

    return;
  }

  if (!("type" in A)) {
    return;
  }

  const id = A["_id"];

  if (app.items.has(id)) {
    console.log(`${id} already in items`);
    return;
  }

  app.items.add(id);

  // assign this activity a path color and speed type (pace, mph)
  // const atype = ATYPE.specs(A["type"]);
  const tup = A["ts"];
  // const tsLocal = new Date((tup[0] + tup[1] * 3600) * 1000);
  // const UTCtimestamp = tup[0];
  // const bounds = L.latLngBounds(A["bounds"]["SW"], A["bounds"]["NE"]);

  dtRows.add([
    String(id),
    String((tup[0] + tup[1] * 3600) * 1000),
    A.type,
    String(A.total_distance),
    String(A.elapsed_time),
    A.name,
  ]);

  // dotLayer.addItem(
  //   id,
  //   A["polyline"],
  //   atype.pathColor,
  //   A["time"],
  //   UTCtimestamp,
  //   bounds,
  //   A["n"]
  // );

  // activitiesTable.addItem();

  count++;
  if (count % 5 === 0) {
    const prog = numActivities ? count / numActivities : null;
    displayProgressInfo(`imported ${count}/${numActivities || "?"}`, prog);
  }
}

/* Rendering */
// function updateLayers(msg) {
//   if (Dom.prop("#autozoom", "checked")) {
//     let totalBounds = getBounds(app.items.keys());

//     if (totalBounds.isValid()) {
//       map.fitBounds(totalBounds);
//     }
//   }

//   const num = app.items.size;
//   Dom.html(".data_message", ` ${msg} ${num} activities rendered.`);

//   const table = makeTable(app.items);

//   if (!ADMIN && !OFFLINE) {
//     // Record this to google analytics
//     try {
//       ga("send", "event", {
//         eventCategory: USER_ID,
//         eventAction: "Render",
//         eventValue: num,
//       });
//     } catch (err) {}
//   }

//   dotLayer.reset();
//   const ds = dotLayer.getDotSettings(),
//     T = dotLayer.periodInSecs().toFixed(2);
//   Dom.html("#period-value", T);
//   Dom.trigger("#period-value", "change");

//   app.update()();
// }

// function doneRendering(msg) {
//   if (!rendering) return;

//   app["after"] = Dom.get("#date1");
//   app["before"] = Dom.get("#date2");
//   app.update()();

//   Dom.fadeOut("#abortButton");
//   Dom.fadeOut(".progbar");

//   if (msgBox) {
//     msgBox.close();
//     msgBox = undefined;
//   }

//   rendering = false;
//   updateLayers(msg);
// }

// function getBounds(ids) {
//   const bounds = L.latLngBounds();
//   for (const id of ids) {
//     bounds.extend(app.items.get(id).bounds);
//   }
//   return bounds;
// }

// Dom.addEvent("#abortButton", "click", function () {
//   importData();
//   Dom.prop("#renderButton", "disabled", false);
//   doneRendering("<font color='red'>Aborted:</font>");
// });
