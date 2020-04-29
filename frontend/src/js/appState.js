import "../css/heatflask.css";

import { WS_SCHEME } from './appUtil.js';
import * as Dom from "./Dom.js";

debugger;

const R = JSON.parse(window["_runtime"]);

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

export const appState = {
  paused: ONLOAD_PARAMS.start_paused,
  items: new Map(),
  currentBaseLayer: null
};


const urlArgs = new URL(window.location.href).searchParams;

import strava_login_img from "../images/btn_strava_connectwith_orange.svg";

debugger;
Dom.el(".strava-auth").forEach(el => el.src = strava_login_img);


