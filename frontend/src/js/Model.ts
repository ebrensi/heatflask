/*
 * Model.js -- This module defines the parameters of the Heatflask client
 */

import { CURRENT_USER, USER_URLS } from "./Env"
import { BoundObject } from "./DataBinding"
import { HHMMSS } from "./appUtil"

/**
 * Query parameters are those that describe the query we make to the
 * backend for activity data. Note that there are two types of query:
 *   (1) stored on the backend and referenced by "key", or
 *   (2) specific to one user
 * Type (1) is more general and is meant to be used for long complex
 *   queries and those involving multiple users.
 *
 */
export interface QueryParameters {
  userid?: string
  queryType?: string //"days", "activities", "dates", "ids", or "key"
  key?: string // A lookup representing a query stored on the server
  after?: string // Start date
  before?: string // End date
  ids?: string //representing a list of activity ids
  quantity?: number

  days?: number
  limit?: number
}

export const DefaultQuery: QueryParameters = {
  queryType: "activities",
  quantity: 10,
}

/**
 * visual-parameters are those that determine what appears visually
 */
export interface VisualParameters {
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

export const DefaultVisual: VisualParameters = {
  zoom: 3,
  center: [27.53, 1.58],
  autozoom: true,
  paused: false,
  tau: 30,
  T: 2,
  sz: 3,
  shadows: true,
  paths: true,
  alpha: 0.8,
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
}

export { state as default }
