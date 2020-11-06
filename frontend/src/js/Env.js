/*
 *  Env.js  -- Here we define a set of runtime environment variables that may be
 *  of use to any other module.  Some of them are arguments that come from the
 *   backend server, embedded in main.html
 */

export const MAP_INFO = true

import { ws_prefix } from "./appUtil.js"
// import load_ga_object from "./google-analytics.js"

export let CLIENT_ID
export let DEVELOPMENT
export let FLASH_MESSAGES
export let APP_NAME
export let CURRENT_USER
export let OFFLINE

/*
 * any code contained in a block
 * if (DEV_BUNDLE) {
 *   ...code...
 * }
 * will be stripped out of a production build by terser's dead-code filter
 */
export const DEV_BUNDLE = process.env.NODE_ENV !== "production"

const argstring = document.querySelector("#runtime-arguments").innerText

if (argstring) {
  const jinja_args = JSON.parse(argstring)
  CLIENT_ID = jinja_args["CLIENT_ID"]
  DEVELOPMENT = jinja_args["DEVELOPMENT"]
  CURRENT_USER = jinja_args["CURRENT_USER"]
  FLASH_MESSAGES = jinja_args["FLASH_MESSAGES"]
  APP_NAME = jinja_args["APP_NAME"]
  OFFLINE = jinja_args["OFFLINE"]
} else {
  console.log("No server-sent arguments")
}

/* Load in the google analytics object if this is
   the production environment and the current user is not
   an admin
*/
// export const ga = ADMIN || DEVELOPMENT ? noop : load_ga_object();

export const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1IjoiaGVhdGZsYXNrIiwiYSI6ImNrMXB3NDZtMjA0cG4zbW85N2U1M2p2ZmQifQ.UvD1v0VyI_V1gJSey0vRbg"
export const CAPTURE_DURATION_MAX = 20

export const WEBSOCKET_URL = `${ws_prefix()}${window.location.host}/data_socket`
export const BEACON_HANDLER_URL = "/beacon_handler"
export const AUTHORIZE_URL = "/authorize"

export function USER_URLS(userid) {
  return {
    main: `/${userid}`,
    index: `/${userid}/activities`,
    public: `/${userid}/update_info`,
    delete: `${userid}/delete`,
    logout: `${userid}/logout`,
    strava: `https://www.strava.com/athletes/${userid}`,
  }
}

// Courtesy of TwoFuckingDevelopers (@2fdevs, @elecash and @qmarcos)
function isMobileDevice() {
  return (
    typeof window.orientation !== "undefined" ||
    navigator.userAgent.indexOf("IEMobile") !== -1
  )
}

export const MOBILE = isMobileDevice()
