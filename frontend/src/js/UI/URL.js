/**
 * Browser URL functionality
 * @module
 */

import * as Dom from "../Dom.js";
import appState from "../Model.js";
import { map }  from "../MapAPI.js";

const query = appState.query;

/** Update the browser's current URL
    This gets called when certain app parameters change
*/
function export updateURL(){
    const  params = {};

    switch (Dom.get("#select_type")) {
        case "activities":
            params["limit"] = query.limit;
            break;

        case "activity-ids":
                params["id"] = query.ids;
            break;

        case "days":
            params["preset"] = query.days;
            break;

        case "date-range":
            params["after"] = query.date1;
//resume here
            if (query.before !== "now") {
                params["before"] = appState.query.before;
            }
    }


    if (Dom.prop("#autozoom", 'checked')) {
        params["az"] = "1";
    } else {
        const zoom = map.getZoom(),
              center = map.getCenter(),
              precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));

        if (center) {
            params.lat = center.lat.toFixed(precision);
            params.lng = center.lng.toFixed(precision);
            params.zoom = zoom;
        }
    }

    if (dotLayer) {
        const ds = dotLayer.getDotSettings();

        params["c1"] = Math.round(ds["C1"]);
        params["c2"] = Math.round(ds["C2"]);
        params["sz"] = Math.round(ds["dotScale"]);
    }

    if (appState.currentBaseLayer.name) {
        params["baselayer"] = appState.currentBaseLayer.name;
    }

    const paramsString = Object.entries(params).filter(([k,v]) => !!v).map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    ).join('&'),

    newURL = `${targetUser.id}?${paramsString}`;

    if (appState.url != newURL) {
        // console.log(`pushing: ${newURL}`);
        appState.url = newURL;
        window.history.replaceState("", "", newURL);
    }
  }

