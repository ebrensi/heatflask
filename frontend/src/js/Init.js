/*
 *  Init.js  -- runtime arguments that come from the backend server are
 *   embedded in the html and are made available to us as a variable in the window context
 */

export let CLIENT_ID;
export let DEVELOPMENT;
export let FLASH_MESSAGES;
export let APP_NAME;
export let CURRENT_USER;

if ("argstring" in window) {
  const jinja_args = JSON.parse(window["argstring"]);
  CLIENT_ID = jinja_args["CLIENT_ID"];
  DEVELOPMENT = jinja_args["DEVELOPMENT"];
  CURRENT_USER = jinja_args["CURRENT_USER"];
  FLASH_MESSAGES = jinja_args["FLASH_MESSAGES"];
  APP_NAME = jinja_args["APP_NAME"];
}

// const IMPERIAL = CURRENT_USER['measurement_preference'] == "feet"
// export const DIST_UNIT = IMPERIAL? 1609.34 : 1000.0;
// export const DIST_LABEL = IMPERIAL?  'mi' : 'km';

export const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1IjoiaGVhdGZsYXNrIiwiYSI6ImNrMXB3NDZtMjA0cG4zbW85N2U1M2p2ZmQifQ.UvD1v0VyI_V1gJSey0vRbg";
export const CAPTURE_DURATION_MAX = 20;

import { ws_prefix } from "./appUtil.js";

export const WEBSOCKET_URL = `${ws_prefix()}${
  window.location.host
}/data_socket`;
export const BEACON_HANDLER_URL = "/beacon_handler";
export const AUTHORIZE_URL = "/authorize";


export function MAKE_USER_URLS(userid) {
  return {
    main: `/${userid}`,
    activities: `/${userid}/activities`,
    public: `/${userid}/update_info`,
    delete: `${userid}/delete`,
    logout: `${userid}/logout`,
    strava: `https://www.strava.com/athletes/${userid}`,
  };
}

/* Load in the google analytics object if this is
   the production environment and the current user is not
   an admin
*/
import { noop } from "./appUtil.js";
import load_ga_object from "./google-analytics.js";

export const ADMIN = CURRENT_USER && CURRENT_USER.isAdmin;
export const ga = ADMIN || DEVELOPMENT ? noop : load_ga_object();
