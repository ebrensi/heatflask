/*
 *  Init.js  -- runtime arguments that come from the backend server are
 *   embedded in the html and are made available to us as a variable in the window context
 */

import { ws_prefix } from "./appUtil.js";

import { noop } from "./appUtil.js";
import load_ga_object from "./google-analytics.js";

export let CLIENT_ID;
export let DEVELOPMENT = true;
export let FLASH_MESSAGES;
export let APP_NAME;
export let CURRENT_USER;

try {
  const jinja_args = JSON.parse(window["argstring"]);
  CLIENT_ID = jinja_args["CLIENT_ID"];
  DEVELOPMENT = jinja_args["DEVELOPMENT"] || DEVELOPMENT;
  CURRENT_USER = jinja_args["CURRENT_USER"];
  FLASH_MESSAGES = jinja_args["FLASH_MESSAGES"];
  APP_NAME = jinja_args["APP_NAME"];
} catch (e) {
  console.log("No server-sent arguments");
}

/* Load in the google analytics object if this is
   the production environment and the current user is not
   an admin
*/
export const ADMIN = CURRENT_USER && CURRENT_USER.isAdmin;
export const ga = ADMIN || DEVELOPMENT ? noop : load_ga_object();

// const IMPERIAL = CURRENT_USER['measurement_preference'] == "feet"
// export const DIST_UNIT = IMPERIAL? 1609.34 : 1000.0;
// export const DIST_LABEL = IMPERIAL?  'mi' : 'km';

export const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1IjoiaGVhdGZsYXNrIiwiYSI6ImNrMXB3NDZtMjA0cG4zbW85N2U1M2p2ZmQifQ.UvD1v0VyI_V1gJSey0vRbg";
export const CAPTURE_DURATION_MAX = 20;

export const WEBSOCKET_URL = `${ws_prefix()}${
  window.location.host
}/data_socket`;
export const BEACON_HANDLER_URL = "/beacon_handler";
export const AUTHORIZE_URL = "/authorize";

export function USER_URLS(userid) {
  return {
    main: `/${userid}`,
    index: `/${userid}/activities`,
    public: `/${userid}/update_info`,
    delete: `${userid}/delete`,
    logout: `${userid}/logout`,
    strava: `https://www.strava.com/athletes/${userid}`,
  };
}
