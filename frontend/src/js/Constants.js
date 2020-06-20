/*
 *  Constants.js  -- runtime arguments that come from the backend server are
 *   embedded in the html and are made available to us as a variable in the window context
 */

export const {
      ONLOAD_PARAMS,
      CLIENT_ID,
      USERNAME,
      SELF,
      DEVELOPMENT,
      IMPERIAL,
      FLASH_MESSAGES,
      MAPBOX_ACCESS_TOKEN,
      CAPTURE_DURATION_MAX,
      DEFAULT_DOTCOLOR,
      BASE_USER_URL,
      SHARE_PROFILE,
      SHARE_STATUS_UPDATE_URL,
      ACTIVITY_LIST_URL,
      BEACON_HANDLER_URL
} = window["_args"];


export const DIST_UNIT = IMPERIAL? 1609.34 : 1000.0,
             DIST_LABEL = IMPERIAL?  "mi" : "km",
             SPEED_SCALE = 5.0,
             SEP_SCALE = {m: 0.15, b: 15.0};

