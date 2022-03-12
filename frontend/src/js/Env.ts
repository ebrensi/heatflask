/*
 *  Env.js  -- Here we define a set of runtime environment variables that may be
 *  of use to any other module.  Some of them are arguments that come from the
 *   backend server, embedded in main.html template
 */

/*
 * any code contained in a block
 * if (DEV_BUNDLE) {
 *   ...code...
 * }
 * will be stripped out of a production build by terser's dead-code filter
 */
export const DEV_BUNDLE = process.env.NODE_ENV !== "production"
export const MAP_INFO = DEV_BUNDLE

const argstring = document.getElementById("runtime_json").innerText
export const { CURRENT_USER, ADMIN, APP_VERSION, URLS } = JSON.parse(argstring)

const flashes_text = document.getElementById("flashes").innerText
export const FLASHES = flashes_text ? JSON.parse(flashes_text) : null

export const OFFLINE = false

/*
 * Load in the google analytics object if this is
 *  the production environment and the current user is not
 *  an admin
 */
import { load_ga_object } from "./google-analytics"
import { noop } from "./appUtil"
export const ga = ADMIN || DEV_BUNDLE ? noop : load_ga_object()

export const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1IjoiaGVhdGZsYXNrIiwiYSI6ImNrMXB3NDZtMjA0cG4zbW85N2U1M2p2ZmQifQ.UvD1v0VyI_V1gJSey0vRbg"
export const CAPTURE_DURATION_MAX = 20

// Courtesy of TwoFuckingDevelopers (@2fdevs, @elecash and @qmarcos)
function isMobileDevice() {
  return (
    typeof window.orientation !== "undefined" ||
    navigator.userAgent.indexOf("IEMobile") !== -1
  )
}

export const MOBILE = isMobileDevice()
