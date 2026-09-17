/**
 * Env.js  -- Here we define a set of runtime environment variables
 *    for the main (map) webpage
 *   Some of them are arguments that come from the
 *   backend server, embedded in main.html template
 */

export type UserInfo = {
  id: number
  name: string
  profile: string
  private: boolean
}

export type RuntimeJson = {
  APP_VERSION: string
  CURRENT_USER: UserInfo
  TARGET_USER: UserInfo
  ADMIN: boolean
  OFFLINE: boolean
  URLS: {
    login: string
    query: string
    index: string
    visibility: string
    delete: string
    logout: string
    /** The user listing; only sent to admins */
    admin: string
    /** The internal history log; only useful to admins */
    history: string
  }
}

const argstring = document.getElementById("runtime_json").innerText
export const { CURRENT_USER, TARGET_USER, ADMIN, APP_VERSION, URLS, OFFLINE } =
  <RuntimeJson>JSON.parse(argstring)

const flashes_text = document.getElementById("flashes").innerText
export const FLASHES = flashes_text ? <string[]>JSON.parse(flashes_text) : null

const StravaDomain = "https://www.strava.com"
export const STRAVA_USER_URL = (uid: number) =>
  `${StravaDomain}/athletes/${uid}`
export const STRAVA_ACTIVITY_URL = (aid: number) =>
  `${StravaDomain}/activities/${aid}`
export const STRAVA_PROFILE_URL = `${StravaDomain}/settings/profile`

/**
 * Any code contained in a block
 * if (DEV_BUNDLE) {
 *   ...code...
 * }
 * will be stripped out of a production build by terser's dead-code filter
 */
export const DEV_BUNDLE = process.env.NODE_ENV !== "production"

export const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1IjoiaGVhdGZsYXNrIiwiYSI6ImNrMXB3NDZtMjA0cG4zbW85N2U1M2p2ZmQifQ.UvD1v0VyI_V1gJSey0vRbg"
// Without it CARTO raster tiles carry an "API KEY REQUIRED" watermark
export const CARTO_API_KEY = "cb1_3iuf_1_b5f01624a165546780866afc"
// Strava accepts videos of up to 30 seconds
export const CAPTURE_DURATION_MAX = 30

// Where the "contribute" links point
export const SPONSOR_URL = "https://github.com/sponsors/ebrensi"

// What Heatflask shows to whom, in more detail than a checkbox can
export const PRIVACY_URL =
  "https://github.com/ebrensi/heatflask/blob/main/docs/PRIVACY.md"

/* The catalogs and the instructions for adding one live together, so the
 * "help fix it" link goes to the README next to them rather than to the repo
 * root, where someone would have to go looking. */
export const TRANSLATE_URL =
  "https://github.com/ebrensi/heatflask/blob/main/frontend/src/locales/README.md"

// Courtesy of TwoFuckingDevelopers (@2fdevs, @elecash and @qmarcos)
function isMobileDevice() {
  return (
    typeof window.orientation !== "undefined" ||
    navigator.userAgent.indexOf("IEMobile") !== -1
  )
}

export const MOBILE = isMobileDevice()
