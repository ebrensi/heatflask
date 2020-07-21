import { latLngBounds } from "leaflet";
import * as Dom from "./Dom.js";
import appState from "./Model.js";
import { map, msgBox1, msgBox2 } from "./mapAPI.js";
import { dotLayer } from "./DotLayerAPI.js";
// import { makeTable } from "./UI.ActivitiesTable.js";
import { ATYPE } from "./strava.js";
import importData from "./Data.js";

const { items, query } = appState;

let numActivities,
  rendering,
  count,
  dataMsgElements,
  errMsgElements,
  progbarElements;

importData(query, onMessage);

function setAttr(els, attr, val) {
  els.forEach((el) => {
    el[attr] = val;
  });
}

const dataMsg = (msg) => setAttr(dataMsgElements, "innerHTML", msg);
const errMsg = (msg) => setAttr(errMsgElements, "innerHTML", msg);
const progress = (val) => setAttr(progbarElements, "value", val);

Dom.addEvent("#abortButton", "click", function () {
  importData();
  Dom.prop("#renderButton", "disabled", false);
  doneRendering("<font color='red'>Aborted:</font>");
});

/**
 *  this is the callback for our data importer. If there is an open
 *    connection with the data-layer (backend server), it gets called on
 *    every received message.
 *
 * @param {Object} A - A JSON object ecoding 1 message from the data layer
 */
function onMessage(A) {
  if (!A) {
    Dom.prop("#renderButton", "disabled", false);
    doneRendering("Finished.");
    return;
  } else if (!("_id" in A)) {
    if ("idx" in A) {
      dataMsg(`indexing...${A["idx"]}`);
    } else if ("count" in A) {
      numActivities += A["count"];
    } else if ("delete" in A) {
      const toDelete = A["delete"];
      if (toDelete.length) {
        // delete all ids in A.delete
        for (let id of toDelete) {
          items.delete(id);
        }
        dotLayer.removeItems(toDelete);
      }
    } else if ("done" in A) {
      console.log("received done");
      doneRendering("Done rendering.");
    } else if ("error" in A) {
      let msg = `<font color='red'>${A.error}</font><br>`;
      errMsg(msg);
      console.log(`Error: ${A.error}`);
      return;
    } else if ("msg" in A) {
      dataMsg(A.msg);
    }

    return;
  }

  if (!("type" in A)) {
    return;
  }

  const id = A["_id"];

  // only add A to items if it isn't already there
  if (!items.has(id)) {
    items.add(id);

    // assign this activity a path color and speed type (pace, mph)
    const atype = ATYPE.specs(A["type"]);
    const tup = A["ts"];
    const tsLocal = new Date((tup[0] + tup[1] * 3600) * 1000);
    const UTCtimestamp = tup[0];
    const bounds = latLngBounds(A["bounds"]["SW"], A["bounds"]["NE"]);

    dotLayer.addItem(
      id,
      A["polyline"],
      atype.pathColor,
      A["time"],
      UTCtimestamp,
      bounds,
      A["n"]
    );

    // activitiesTable.addItem();
  }

  count++;
  if (count % 5 === 0) {
    if (numActivities) {
      progress(count / numActivities);
      dataMsg(`imported ${count}/${numActivities}`);
    } else {
      dataMsg(`imported ${count}/?`);
    }
  }
}

/* Rendering */
function updateLayers(msg) {
  if (Dom.prop("#autozoom", "checked")) {
    let totalBounds = getBounds(appState.items.keys());

    if (totalBounds.isValid()) {
      map.fitBounds(totalBounds);
    }
  }

  const num = appState.items.size;
  Dom.html(".data_message", ` ${msg} ${num} activities rendered.`);

  const table = makeTable(appState.items);

  if (!ADMIN && !OFFLINE) {
    // Record this to google analytics
    try {
      ga("send", "event", {
        eventCategory: USER_ID,
        eventAction: "Render",
        eventValue: num,
      });
    } catch (err) {}
  }

  dotLayer.reset();
  const ds = dotLayer.getDotSettings(),
    T = dotLayer.periodInSecs().toFixed(2);
  Dom.html("#period-value", T);
  Dom.trigger("#period-value", "change");

  appState.update()();
}

function doneRendering(msg) {
  if (!rendering) return;

  appState["after"] = Dom.get("#date1");
  appState["before"] = Dom.get("#date2");
  appState.update()();

  Dom.fadeOut("#abortButton");
  Dom.fadeOut(".progbar");

  if (msgBox) {
    msgBox.close();
    msgBox = undefined;
  }

  rendering = false;
  updateLayers(msg);
}

/*

*/

export function renderLayers(query) {
  const to_exclude = Array.from(items.values()).map(Number);

  // create a status box
  msgBox1
    .content(
      "<div class='data_message'></div><div><progress class='progbar' id='box'></progress></div>"
    )
    .show();

  dataMsgElements = Dom.el(".data_message");
  dataMsg("Retrieving activity data...");

  progbarElements = Dom.el(".progbar");

  rendering = true;
  numActivities = 0;
  count = 0;

  Dom.fadeIn("#abortButton");

  Dom.prop("#renderButton", "disabled", true);

  queryObj[USER_ID] = {
    limit: type == "activities" ? Math.max(1, +num) : undefined,
    after: date1 ? date1 : undefined,
    before: date2 && date2 != "now" ? date2 : undefined,
    activity_ids: idString
      ? Array.from(new Set(idString.split(/\D/).map(Number)))
      : undefined,
    exclude_ids: to_exclude.length ? to_exclude : undefined,
    streams: true,
  };
}

function getBounds(ids) {
  const bounds = latLngBounds();
  for (const id of ids) {
    bounds.extend(appState.items.get(id).bounds);
  }
  return bounds;
}
