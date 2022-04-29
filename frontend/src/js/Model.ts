/*
 * Model -- This module defines the parameters of the Heatflask client
 */
import Geohash from "latlon-geohash"
import type { Live } from "./DataBinding"

/**
 * User parameters are the current user browsing and
 * the user whose activities we are viewing
 */
export type User = {
  id: number
  name: string
  profile: string
  private: boolean
  units?: string
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
export type QueryParameters = {
  userid?: number
  type?: "days" | "activities" | "dates" | "ids" | "key"
  key?: string // A lookup representing a query stored on the server
  after?: number // Start date Epoch
  before?: number // End date Epoch
  ids?: string // string representing and Array of activity ids
  quantity?: number // number of days or activities
}
export const DefaultQuery: QueryParameters = {
  // type: "activities",
  // quantity: 10,
  type: "ids",
  ids: "6839876364",
}

/**
 * visual-parameters are those that determine what appears visually
 */
export type VisualParameters = {
  // Map
  center?: { lat: number; lng: number } // map latitude, longitude
  zoom?: number // map zoom level
  geohash?: string // a string representing zoom/center
  baselayer?: string // map background tile group name
  autozoom?: boolean // Whether or not to automatically zoom to include all of the activities after render

  // Animation
  tau?: number // timescale
  T?: number // Period
  sz?: number // Dot Size
  alpha?: number // global alpha for all rendering
  shadows?: boolean // render shadows under dots
  paths?: boolean // show paths
  paused?: boolean // start in paused state
}

const DEFAULT_CENTER = { lat: 27.53, lng: 1.58 }
const DEFAULT_ZOOM = 3
const DEFAULT_GEOHASH: string = Geohash.encode(
  DEFAULT_CENTER.lat,
  DEFAULT_CENTER.lng,
  DEFAULT_ZOOM
)
const DEFAULT_BASELAYER = "Mapbox.dark"

export const DefaultVisual: VisualParameters = {
  center: DEFAULT_CENTER,
  zoom: DEFAULT_ZOOM,
  geohash: DEFAULT_GEOHASH,
  baselayer: DEFAULT_BASELAYER,
  autozoom: true,
  tau: 30,
  T: 2,
  sz: 3,
  alpha: 0.8,
  shadows: true,
  paths: true,
  paused: false,
}

/**
 * All the model parameters that we can parse from the URL
 */
export type URLParameters = {
  // Query parameters
  after?: string
  before?: string
  days?: string
  limit?: string
  ids?: string
  key?: string
  userid?: string
  // Visual parameters
  // Map
  zoom?: string
  lat?: string
  lng?: string
  autozoom?: string
  geohash?: string
  baselayer?: string
  // Animation
  tau?: string
  T?: string
  sz?: string
  paused?: string
  shadows?: string
  paths?: string
  alpha?: string
}

/**
 * Parameterized representation of the current state of this app
 */
export type State = {
  url: Live<URLParameters>
  currentUser: Live<User>
  targetUser: Live<User>
  visual: Live<VisualParameters>
  query: Live<QueryParameters>
}

// // info elements have one-way bindings because the user cannot change them
// export const messages = BoundObject.fromDOMelements("[data-class=info]")

// vParams.onChange("s", (s) => {
//   const tau = (vParams.tau = tauLow * (tauHigh / tauLow) ** s)
//   messages["tau-info"] = `${tau.toFixed(1)}`
//   // console.log(`s = ${s} => tau = ${vParams.tau}`)
// })

// // exponential scaling so that tau(s=0) = tauLow
// //                          and tau(s=1) = tauHigh
// // tau(s) = tauLow * (tauHigh / tauLow) ** s
// const tauLow = 0.5
// const tauHigh = 3600
// const tau = vParams.tau
// vParams["s"] = Math.log2(tau / tauLow) / Math.log2(tauHigh / tauLow)

// function updateTinfo() {
//   const T = vParams.T
//   messages["T-info"] = `${T}s ~ ${HHMMSS(T * vParams.tau)}`
// }
// vParams.onChange("T", () => updateTinfo())
// vParams.onChange("tau", () => updateTinfo())

// export const targetUser = BoundObject.fromDOMelements(
//   "[data-class=target-user]"
// )
// targetUser.addProperty("id", targetUserId)
// targetUser.onChange("id", (newId) => (qParams.userid = newId))

// export const currentUser = BoundObject.fromDOMelements(
//   "[data-class=current-user]"
// )

// /*
//  * If the user is already logged in (via browser cookie),
//  *  populate currentUser object with data provided from the server
//  */
// if (CURRENT_USER) {
//   Object.assign(currentUser, CURRENT_USER)
//   currentUser.url = USER_URLS(currentUser.id)
// }

// export const flags = BoundObject.fromDOMelements("[data-class=flag]", {
//   event: "change",
// })
