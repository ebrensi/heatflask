/*
 * Model.js -- This module defines the parameters of the Heatflask client,
 *    beginning with those specified by the current URL in the browser.
 */

import { CURRENT_USER, TARGET_USER_ID, USER_URLS } from "./Env"
import { BoundObject } from "./DataBinding"
import { HHMMSS } from "./appUtil"

interface ArgDefaults {
  after: [string[], string]
  before: [string[], string]
  days: [string[], number]
  limit: [string[], number]
  ids: [string[], string]
  key: [string[], string]
  zoom: [string[], number]
  lat: [string[], number]
  lng: [string[], number]
  autozoom: [string[], boolean]
  tau: [string[], number]
  T: [string[], number]
  sz: [string[], number]
  geohash: [string[], string]
  paused: [string[], boolean]
  shadows: [string[], boolean]
  paths: [string[], boolean]
  alpha: [string[], number]
}

/*
 * These are all the possible arguments that might be in the URL
 * parameter string.  The format here is:
 *     key: [[kwd1, kwd2, ...], default-value]
 * where kwd1, kwd2, etc are possible parameter names for this field
 */
export const urlArgDefaults: ArgDefaults = {
  // Query parameters
  after: [["start", "after", "date1", "a"], null],
  before: [["end", "before", "date2", "b"], null],
  days: [["days", "preset", "d"], null],
  limit: [["limit", "n"], 10],
  ids: [["id", "ids"], ""],
  key: [["key"], null],

  // Visual parameters
  zoom: [["zoom", "z"], 3],
  lat: [["lat", "x"], 27.53],
  lng: [["lng", "lon", "y"], 1.58],
  autozoom: [["autozoom", "az"], true],
  tau: [["tau", "timescale"], 30],
  T: [["T", "period"], 2],
  sz: [["sz"], 3],
  geohash: [["geohash", "gh"], null],
  paused: [["paused", "pu"], null],
  shadows: [["sh", "shadows"], null],
  paths: [["pa", "paths"], true],
  alpha: [["alpha"], 0.8],
}

const urlArgs = new URL(window.location.href).searchParams
const pathname = window.location.pathname.substring(1)
const targetUserId = urlArgs.get("user") || pathname

const names: { [name: string]: string[] } = {}
const params: QueryParameters & VisualParameters = {}

for (const [key, val] of Object.entries(urlArgDefaults)) {
  names[key] = val[0]
  params[key] = val[1]
}

/* parse parameters from the url */
for (const [uKey, value] of urlArgs.entries()) {
  for (const [pKey, pNames] of Object.entries(names)) {
    if (pNames.includes(uKey)) {
      params[pKey] = value
      delete names[pKey] // this field is set no need to check it again
      break
    }
  }
}

/**
 * Query parameters are those that describe the query we make to the
 * backend for activity data. Note that there are two types of query:
 *   (1) stored on the backend and referenced by "key", or
 *   (2) specific to one user
 * Type (1) is more general and is meant to be used for long complex
 *   queries and those involving multiple users.
 *
 */
interface QueryParameters {
  userid?: string
  queryType?: string //"days", "activities", "dates", "ids", or "key"
  key?: string // A lookup representing a query stored on the server
  after?: string // Start date
  before?: string // End date
  ids?: string //representing a list of activity ids
  quantity?: number
}

/*
 * Ininitial query extracted from defaults and URL parameters
 */
const qParamsInit: QueryParameters = {
  userid: targetUserId,
  after: params.after,
  before: params.before,
  ids: params.ids,
  key: params.key,
}

qParamsInit.queryType = urlArgs["key"]
  ? "key"
  : params.ids
  ? "ids"
  : params.after || params.before
  ? "dates"
  : params.days
  ? "days"
  : "activities"

qParamsInit.quantity =
  params.queryType === "days" ? +params.days : +params.limit

/*
 * Current values of query parameters in the DOM
 */
export const qParams = <QueryParameters & BoundObject>(
  BoundObject.fromObject(qParamsInit, { event: "change" })
)

const afterDateElement: HTMLInputElement =
  document.querySelector("[data-bind=after]")
const beforeDateElement: HTMLInputElement =
  document.querySelector("[data-bind=before]")

// afterDateElement.max = today
// beforeDateElement.min = today
qParams.onChange("after", (newDate) => {
  beforeDateElement.min = newDate
})

qParams.onChange("before", (newDate) => {
  afterDateElement.max = newDate
})

/**
 * visual-parameters are those that determine what appears visually
 */

interface VisualParameters {
  zoom?: number // map zoom level
  center?: [number, number] // map latitude, longitude
  geohash?: string // a string representing zoom/center
  autozoom?: boolean // Whether or not to automatically zoom to include all of the activities after render
  paused?: boolean // start in paused state
  baselayer?: string // map background tile group name
  tau?: number // timescale
  T?: number // Period
  sz?: number // Dot Size
  alpha?: number // global alpha for all rendering
  shadows?: boolean // render shadows under dots
  paths?: boolean // show paths
}

function bool(val) {
  return val !== "0" && !!val
}
/*
 * Ininitial visual parameters extracted from defaults and URL parameters
 */
const vParamsInit: VisualParameters = {
  center: { lat: params["lat"], lng: params["lng"] },
  zoom: params["zoom"],
  geohash: params["geohash"],
  autozoom: bool(params["autozoom"]),
  paused: bool(params["paused"]),
  baselayer: params["baselayer"],

  s: NaN,
  tau: params["tau"],
  T: params["T"],
  sz: params["sz"],
  alpha: params["alpha"],
  shadows: bool(params["shadows"]),
  paths: bool(params["paths"]),
}

/*
 * The visual paramters for the current view
 */
export const vParams = <VisualParameters & BoundObject>BoundObject.fromObject(
  vParamsInit,
  {
    // bind "change" events of any elements whos data-event attribute not set
    event: "change",
  }
)

// info elements have one-way bindings because the user cannot change them
export const messages = BoundObject.fromDOMelements("[data-class=info]")

vParams.onChange("s", (s) => {
  const tau = (vParams.tau = tauLow * (tauHigh / tauLow) ** s)
  messages["tau-info"] = `${tau.toFixed(1)}`
  // console.log(`s = ${s} => tau = ${vParams.tau}`)
})

// exponential scaling so that tau(s=0) = tauLow
//                          and tau(s=1) = tauHigh
// tau(s) = tauLow * (tauHigh / tauLow) ** s
const tauLow = 0.5
const tauHigh = 3600
const tau = vParams.tau
vParams["s"] = Math.log2(tau / tauLow) / Math.log2(tauHigh / tauLow)

function updateTinfo() {
  const T = vParams.T
  messages["T-info"] = `${T}s ~ ${HHMMSS(T * vParams.tau)}`
}
vParams.onChange("T", () => updateTinfo())
vParams.onChange("tau", () => updateTinfo())

export const targetUser = BoundObject.fromDOMelements(
  "[data-class=target-user]"
)
targetUser.addProperty("id", targetUserId)
targetUser.onChange("id", (newId) => (qParams.userid = newId))
targetUser.username = targetUserId || targetUser.name

export const currentUser = BoundObject.fromDOMelements(
  "[data-class=current-user]"
)

/*
 * If the user is already logged in (via browser cookie),
 *  populate currentUser object with data provided from the server
 */
if (CURRENT_USER) {
  Object.assign(currentUser, CURRENT_USER)
  currentUser.url = USER_URLS(currentUser.id)
}

export const flags = BoundObject.fromDOMelements("[data-class=flag]", {
  event: "change",
})

export const state = {
  flags: flags,
  vParams: vParams,
  qParams: qParams,
  messages: messages,
  targetUser: targetUser,
  currentUser: currentUser,
  clientID: null,
}

export { state as default }

window.app = state
