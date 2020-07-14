
import * as Dom from "./Dom.js";
import appState from "./Model.js";
import { map } from "./mapAPI.js";
import { dotLayer } from "./DotLayerAPI.js";
import { makeTable } from "./UI.Table.js";
import { ATYPE } from "./strava.js";
import importData from "./Data.js";

const { items, query } = appState.items;

let numActivities = 0,
    count;

/* Rendering */
function updateLayers(msg) {
    if (Dom.prop("#autozoom", "checked")) {
        let totalBounds = getBounds(appState.items.keys());

        if (totalBounds.isValid()){
            map.fitBounds(totalBounds);
        }
    }

    const num = appState.items.size;
    Dom.html(".data_message",` ${msg} ${num} activities rendered.`);

    // (re-)render the activities table
    // atable.clear();
    // atable.rows.add(Array.from(appState.items.values()));
    // atable.columns.adjust().draw()

    const table = makeTable(appState.items);

    if (!ADMIN && !OFFLINE) {
        // Record this to google analytics
        try{
            ga('send', 'event', {
                eventCategory: USER_ID,
                eventAction: 'Render',
                eventValue: num
            });
        }
        catch(err){}
    }

    dotLayer.reset();
    const ds = dotLayer.getDotSettings(),
          T = dotLayer.periodInSecs().toFixed(2);
    Dom.html("#period-value", T)
    Dom.trigger("#period-value", "change");

    appState.update()();
}


/**
 *  addItem is the callback for our data importer. If there is an open
 *    connection with the data-layer (backend server), it gets called on
 *    every received message.
 *
 * @param {Object} A - A JSON object ecoding 1 message from the data layer
 */
export function addItem(A) {
    if (!A) {
        Dom.prop('#renderButton', 'disabled', false);
        doneRendering("Finished.");
        return;
    } else

    if (!("_id" in A)) {

        if ("idx" in A) {
            Dom.html(".data_message", `indexing...${A["idx"]}`);

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
            Dom.html(".data_message", msg);
            console.log(`Error: ${A.error}`);
            return;

        } else if ("msg" in A) {
            Dom.html(".data_message", A.msg);
        }

        return;
    }

    if (!("type" in A)) {
        return;
    }

     const id = A["_id"];

    // only add A to items if it isn't already there
    if ( !items.has(id) ) {

        // assign this activity a path color and speed type (pace, mph)
        Object.assign( A, ATYPE.specs(A["type"]) );
        A.id = id;
        delete A["_id"];

        const tup = A["ts"];
        delete A["ts"];

        A.tsLoc = new Date((tup[0] + tup[1]*3600) * 1000);
        A.UTCtimestamp = tup[0];

        A.bounds = L.latLngBounds(A["bounds"]["SW"], A["bounds"]["NE"]);

        dotLayer.addItem(id, A["polyline"], A.pathColor, A["time"], tup[0], A.bounds, A["n"]);
        appState.items.set(A.id, A);

        delete A["n"];
        delete A["ttl"];
        delete A["polyline"];
        delete A["time"];
    }

    count++;
    if (count % 5 === 0) {
        if (numActivities) {
            Dom.set(".progbar", count/numActivities);
            Dom.html(".data_message", `imported ${count}/${numActivities}`);
        } else {
            Dom.html(".data_message", `imported ${count}/?`);
        }
    }
}


function doneRendering(msg) {

    if (!rendering)
        return;

    appState['after'] = Dom.get("#date1");
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



export function renderLayers(query={}) {
    const date1 = Dom.get("#date1"),
          date2 = Dom.get("#date2"),
          type = Dom.get("#select_type"),
          num = Dom.get("#select_num"),
          idString = Dom.get("#activity_ids"),
          to_exclude = Array.from(appState.items.keys()).map(Number);

    // create a status box
    msgBox = Lcontrol.window(map, {
            position: 'top',
            content:"<div class='data_message'></div><div><progress class='progbar' id='box'></progress></div>",
            visible:true
    });

    Dom.html(".data_message", "Retrieving activity data...");


    let rendering = true,
        listening = true,
        numActivities = 0,
        count = 0;



    Dom.html(".data_message", "Retrieving activity data...");

    if (!appState.abortButtonListener)
        appState.abortButtonListener = Dom.addEvent('#abortButton', "click", function() {
            stopListening();
            Dom.prop('#renderButton', 'disabled', false);
            doneRendering("<font color='red'>Aborted:</font>");
        });

    Dom.fadeIn('#abortButton');
    Dom.fadeIn(".progbar");

    Dom.prop('#renderButton', 'disabled', true);

}


importData(query, addItem);
