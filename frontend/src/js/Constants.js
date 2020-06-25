/*
 *  Constants.js  -- runtime arguments that come from the backend server are
 *   embedded in the html and are made available to us as a variable in the window context
 */

const R = window["_args"];

export const ONLOAD_PARAMS = R["ONLOAD_PARAMS"],
       CLIENT_ID = R["CLIENT_ID"],
       USERNAME = R["USERNAME"],
       LOGGED_IN = R["LOGGED_IN"],
       SELF = R["SELF"],
       DEVELOPMENT = R["DEVELOPMENT"],
       IMPERIAL = R["IMPERIAL"],
       FLASH_MESSAGES = R["FLASH_MESSAGES"],
       MAPBOX_ACCESS_TOKEN = R["MAPBOX_ACCESS_TOKEN"],
       CAPTURE_DURATION_MAX = R["CAPTURE_DURATION_MAX"],
       DEFAULT_DOTCOLOR = R["DEFAULT_DOTCOLOR"],
       BASE_USER_URL = R["BASE_USER_URL"],
       SHARE_PROFILE = R["SHARE_PROFILE"],
       SHARE_STATUS_UPDATE_URL = R["SHARE_STATUS_UPDATE_URL"],
       ACTIVITY_LIST_URL = R["ACTIVITY_LIST_URL"],
       BEACON_HANDLER_URL = R["BEACON_HANDLER_URL"],
       OFFLINE = R["OFFLINE"],
       ADMIN = R["ADMIN"];

export const DIST_UNIT = IMPERIAL? 1609.34 : 1000.0,
             DIST_LABEL = IMPERIAL?  "mi" : "km",
             SPEED_SCALE = 5.0,
             SEP_SCALE = {m: 0.15, b: 15.0};

