import "../css/heatflask.css";

import { WS_SCHEME } from './appUtil.js';

const R = JSON.parse(window["_argstring"]);

// R is defined at runtime and has attributes with these exact names
// so we don't want closure compiler renaming them
export const ONLOAD_PARAMS = R["QUERY"],
      CLIENT_ID = R["CLIENT_ID"],
      OFFLINE = R["OFFLINE"],
      ADMIN = R["ADMIN"],
      FLASH_MESSAGES = R["FLASH_MESSAGES"],
      MAPBOX_ACCESS_TOKEN = R["MAPBOX_ACCESS_TOKEN"],
      CAPTURE_DURATION_MAX = R["CAPTURE_DURATION_MAX"],
      DEFAULT_DOTCOLOR = R["DEFAULT_DOTCOLOR"],
      MEASURMENT_PREFERENCE = R["MEASURMENT_PREFERENCE"],
      USER_ID = R["USER_ID"],
      BASE_USER_URL = R["BASE_USER_URL"],
      SHARE_PROFILE = R["SHARE_PROFILE"],
      SHARE_STATUS_UPDATE_URL = R["SHARE_STATUS_UPDATE_URL"],
      ACTIVITY_LIST_URL = R["ACTIVITY_LIST_URL"],
      BEACON_HANDLER_URL = R["BEACON_HANDLER_URL"];

export const DIST_UNIT = (MEASURMENT_PREFERENCE=="feet")? 1609.34 : 1000.0,
      DIST_LABEL = (MEASURMENT_PREFERENCE=="feet")?  "mi" : "km",
      SPEED_SCALE = 5.0,
      SEP_SCALE = {m: 0.15, b: 15.0},
      WEBSOCKET_URL = WS_SCHEME+window.location.host+"/data_socket";

const appState = {
  paused: ONLOAD_PARAMS.start_paused,
  items: new Map(),
  currentBaseLayer: null
};

export { appState as default };

const urlArgs = new URL(window.location.href).searchParams;


import strava_login_img from "../images/btn_strava_connectwith_orange.svg";

// put user profile urls in the DOM
document.querySelectorAll(".strava-profile-link").forEach(
  el => el.href = `https://www.strava.com/athletes/${USER_ID}`
)

// put strava images into the DOM
document.querySelectorAll(".strava-auth").forEach(
  el => el.src = strava_login_img
);


import * as Dom from "./Dom.js";

appState.update = function(event){
    let  params = {},
         type = Dom.get("#select_type"),
         num = Dom.get("#select_num"),
         ids = Dom.get("#activity_ids");

    if (type == "activities") {
        params["limit"] = num;
    } else if (type == "activity_ids") {
        if (ids) params["id"] = ids;
    } else if (type == "days") {
        params["preset"] = num;
    } else {
        if (appState["after"]) {
            params["after"] = appState.after;
        }
        if (appState["before"] && (appState["before"] != "now")) {
            params["before"] = appState["before"];
        }
    }

    if (appState["paused"]){
        params["paused"] = "1";
    }

    if (Dom.prop("#autozoom", 'checked')) {
        appState["autozoom"] = true;
        params["autozoom"] = "1";
    } else {
        appState["autozoom"] = false;
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

        // Enable capture if period is less than CAPTURE_DURATION_MAX
        const cycleDuration = dotLayer.periodInSecs().toFixed(2),
              captureEnabled = controls.captureControl.enabled;

        Dom.html("#period-value", cycleDuration);

        if (cycleDuration <= CAPTURE_DURATION_MAX) {
            if (!captureEnabled) {
                controls.captureControl.addTo(map);
                controls.captureControl.enabled = true;
            }
        } else if (captureEnabled) {
            controls.captureControl.removeFrom(map);
            controls.captureControl.enabled = false;
        }
    }

    if (appState.currentBaseLayer.name)
        params["baselayer"] = appState.currentBaseLayer.name;

    const paramsString = Object.keys(params).map(function(param) {
              return encodeURIComponent(param) + '=' +
              encodeURIComponent(params[param])
          }).join('&'),

          newURL = `${USER_ID}?${paramsString}`;

    if (appState.url != newURL) {
        // console.log(`pushing: ${newURL}`);
        appState.url = newURL;
        window.history.replaceState("", "", newURL);
    }
}
