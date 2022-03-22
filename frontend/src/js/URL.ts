/*
 * URL.js -- Browser URL functionality
 */

import {
  QueryParameters,
  DefaultQuery,
  VisualParameters,
  DefaultVisual,
} from "./Model"
import Geohash from "latlon-geohash"

import { BoundObject, mergeDefaults } from "./DataBinding"
// import { defaultBaselayerName, map } from "./Map"

// import { dotLayer } from "../DotLayerAPI.js";

import { nextTask } from "./appUtil"

/**
 * All the model parameters that we can parse from the URL
 */
interface URLParameters {
  // Query parameters
  after?: string
  before?: string
  days?: string
  limit?: string
  ids?: string
  key?: string
  userid?: string
  // Visual parameters
  zoom?: string
  lat?: string
  lng?: string
  autozoom?: string
  tau?: string
  T?: string
  sz?: string
  geohash?: string
  paused?: string
  shadows?: string
  paths?: string
  alpha?: string
  baselayer?: string
}

/**
 * Reverse-mapping of all the possible URL argument names to their
 * assoicated paramters.
 */
const urlArgNames: { [Property in keyof URLParameters]: string[] } = {
  // Query parameters
  after: ["start", "after", "date1", "a"],
  before: ["end", "before", "date2", "b"],
  days: ["days", "preset", "d"],
  limit: ["limit", "n"],
  ids: ["id", "ids"],
  key: ["key"],
  userid: ["user", "userid"],

  // Visual parameters
  zoom: ["zoom", "z"],
  lat: ["lat", "x"],
  lng: ["lng", "lon", "y"],
  autozoom: ["autozoom", "az"],
  tau: ["tau", "timescale"],
  T: ["T", "period"],
  sz: ["sz"],
  geohash: ["geohash", "gh"],
  paused: ["paused", "pu"],
  shadows: ["sh", "shadows"],
  paths: ["pa", "paths"],
  alpha: ["alpha"],
  baselayer: ["baselayer", "map", "bl"],
}

function bool(val) {
  return val !== "0" && val != "null" && !!val
}

/*
 * make a lookup to find the paramter name for a given URL argument
 */
const keyLookup: Record<string, string> = {}
for (const [key, names] of Object.entries(urlArgNames)) {
  for (const name of names) {
    keyLookup[name] = key
  }
}

export function parseURL() {
  /* parse parameters from the url */
  const urlArgs = new URL(window.location.href).searchParams

  const urlParams: URLParameters = {}
  for (const [urlArg, value] of urlArgs.entries()) {
    const key = keyLookup[urlArg]
    if (key) {
      urlParams[key] = value
    } else {
      console.log(`unknown URL arg ${urlArg}=${value}`)
    }
  }

  /*
   * ***  Construct Query from URL args  ***
   */
  let qparams: QueryParameters
  const queryType = urlArgs["key"]
    ? "key"
    : urlParams.ids
    ? "ids"
    : urlParams.after || urlParams.before
    ? "dates"
    : urlParams.days
    ? "days"
    : urlParams.limit
    ? "activities"
    : undefined

  if (queryType) {
    qparams = { queryType: queryType }

    const qt = qparams.queryType
    if (qt === "days" && urlParams.days) qparams.quantity = +urlParams.days
    else if (qt === "activities" && urlParams.limit)
      qparams.quantity = +urlParams.limit
    else if (qt === "dates") {
      qparams.before = urlParams.before
      qparams.after = urlParams.after
    } else if (qt === "ids") qparams.ids = urlParams.ids
    else if (qt === "key") qparams.key = urlParams.key
  } else {
    qparams = DefaultQuery
  }

  /*
   * This will give us the endpoint name of the current url,
   *  which is the target-user's id or "global"
   *  Example:  https://heatflask.com/1324531?bar=2
   *                 =>  endpoint = "1324531"
   */
  const endpoint = window.location.pathname.substring(1)
  qparams.userid = endpoint

  /*
   * *** Construct Visual from URL args ***
   */
  const vparams: VisualParameters = { ...DefaultVisual }

  if (urlParams.lat && urlParams.lng) {
    vparams.center = { lat: +urlParams.lat, lng: +urlParams.lng }
  }

  // string params
  for (const p of ["geohash", "baselayer"]) {
    if (urlParams[p]) vparams[p] = urlParams[p]
  }

  // numerical params
  for (const p of ["zoom", "tau", "T", "sz", "alpha"]) {
    if (urlParams[p]) vparams[p] = +urlParams[p]
  }

  // boolean params
  for (const p of ["shadows", "paths", "autozoom", "paused"]) {
    if (urlParams[p]) vparams[p] = bool(urlParams[p])
  }

  // GeoHash takes precedence over lat, lng if both are there
  if (vparams.geohash) {
    const ghObj = Geohash.decode(vparams.geohash)
    vparams.center = { lat: ghObj.lat, lng: ghObj.lon }
    vparams.zoom = vparams.geohash.length
  } else {
    vparams.geohash = Geohash.encode(
      vparams.center.lat,
      vparams.center.lng,
      vparams.zoom
    )
  }

  return { qparams, vparams }
}

// const qParams: QueryObject = BoundObject.fromObject(qParamsInit, {
//   event: "change",
// })

// const afterDateElement: HTMLInputElement =
//   document.querySelector("[data-bind=after]")
// const beforeDateElement: HTMLInputElement =
//   document.querySelector("[data-bind=before]")

// qParams.onChange("after", (newDate) => {
//   beforeDateElement.min = newDate
// })

// qParams.onChange("before", (newDate) => {
//   afterDateElement.max = newDate
// })

// /*
//  * qArgs are updated on render and vArgs are updated every time the map moves
//  */
// let url, qArgs

// function initializeURL() {
//   qArgs = {}
//   switch (qParams.queryType) {
//     case "activities":
//       qArgs.n = qParams.quantity
//       break

//     case "days":
//       qArgs.days = qParams.quantity
//       break

//     case "ids":
//       qArgs.id = qParams.ids
//       break

//     case "dates":
//       if (qParams.before) qArgs.before = qParams.before
//       if (qParams.after) qArgs.after = qParams.after
//       break

//     case "key":
//       qArgs.key = qParams.key
//   }

//   // if (qParams.userid) qArgs.user = qParams.userid;

//   updateURL()
// }

// /*
//  * Reset qParams back to the values from the last render (in qArgs).
//  */
// export function resetQuery() {
//   if ("n" in qArgs) {
//     qParams.queryType = "activities"
//     qParams.quantity = qArgs.n
//   } else if ("days" in qArgs) {
//     qParams.queryType = "days"
//     qParams.quantity = qArgs.days
//   } else if ("id" in qArgs) {
//     qParams.queryType = "ids"
//     qParams.ids = qArgs.id
//   } else if ("before" in qArgs) {
//     qParams.queryType = "dates"
//     qParams.before = qArgs.before
//     qParams.after = qArgs.after
//   } else if ("key" in qArgs) {
//     qParams.queryType = "key"
//     qParams.key = qArgs.key
//   }
// }

// /*
//  * If the user closes the sidebar without performing the query, the
//  * query form resets to the last query.
//  */
// sidebar.addEventListener("closing", resetQuery)

// export function getUrlString(altQargs) {
//   const vArgs = {}

//   // put geohash in the url if autozoom is disabled
//   if (!vParams.autozoom) vArgs.geohash = vParams.geohash

//   // include baselayer name if it isn't the default
//   const blName = vParams.baselayer.name
//   if (blName !== defaultBaselayerName) vArgs.map = blName

//   // include boolean options as 1 or 0 if they differ from the defaults
//   for (const param of ["paused", "shadows", "paths"]) {
//     const val = vParams[param],
//       defaultVal = urlArgDefaults[param][1]
//     if (val !== defaultVal) {
//       vArgs[param] = val ? 1 : 0
//     }
//   }

//   // include the global alpha value if it differs from 1
//   for (const param of ["T", "tau", "alpha", "sz"]) {
//     const val = vParams[param],
//       defaultVal = urlArgDefaults[param][1]
//     if (val !== defaultVal) {
//       vArgs[param] = Math.round(val)
//     }
//   }

//   const paramsString = Object.entries({ ...(altQargs || qArgs), ...vArgs })
//     .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
//     .join("&")
//   return `?${paramsString}`
// }

// async function updateURL() {
//   await nextTask()
//   const newURL = getUrlString()

//   if (url !== newURL) {
//     // console.log(`pushing: ${newURL}`);
//     url = newURL
//     window.history.replaceState("", "", newURL)
//   }
// }

// initializeURL()
// vParams.onChange(updateURL)
// map.on("moveend", updateURL)
