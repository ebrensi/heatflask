/*
 * URL.js -- Browser URL functionality
 */

import { qParams, vParams } from "./Model"
import { defaultBaselayerName, map } from "./Map"

// import { dotLayer } from "../DotLayerAPI.js";

import { nextTask } from "./appUtil"

/*
 * These are all the possible arguments that might be in the URL
 * parameter string.  The format here is:
 *     key: [[kwd1, kwd2, ...], default-value]
 * where kwd1, kwd2, etc are possible parameter names for this field
 */
const urlArgDefaults = {
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

/*
 * qArgs are updated on render and vArgs are updated every time the map moves
 */
let url, qArgs

function initializeURL() {
  qArgs = {}
  switch (qParams.queryType) {
    case "activities":
      qArgs.n = qParams.quantity
      break

    case "days":
      qArgs.days = qParams.quantity
      break

    case "ids":
      qArgs.id = qParams.ids
      break

    case "dates":
      if (qParams.before) qArgs.before = qParams.before
      if (qParams.after) qArgs.after = qParams.after
      break

    case "key":
      qArgs.key = qParams.key
  }

  // if (qParams.userid) qArgs.user = qParams.userid;

  updateURL()
}

/*
 * Reset qParams back to the values from the last render (in qArgs).
 */
export function resetQuery() {
  if ("n" in qArgs) {
    qParams.queryType = "activities"
    qParams.quantity = qArgs.n
  } else if ("days" in qArgs) {
    qParams.queryType = "days"
    qParams.quantity = qArgs.days
  } else if ("id" in qArgs) {
    qParams.queryType = "ids"
    qParams.ids = qArgs.id
  } else if ("before" in qArgs) {
    qParams.queryType = "dates"
    qParams.before = qArgs.before
    qParams.after = qArgs.after
  } else if ("key" in qArgs) {
    qParams.queryType = "key"
    qParams.key = qArgs.key
  }
}

/*
 * If the user closes the sidebar without performing the query, the
 * query form resets to the last query.
 */
sidebar.addEventListener("closing", resetQuery)

export function getUrlString(altQargs) {
  const vArgs = {}

  // put geohash in the url if autozoom is disabled
  if (!vParams.autozoom) vArgs.geohash = vParams.geohash

  // include baselayer name if it isn't the default
  const blName = vParams.baselayer.name
  if (blName !== defaultBaselayerName) vArgs.map = blName

  // include boolean options as 1 or 0 if they differ from the defaults
  for (const param of ["paused", "shadows", "paths"]) {
    const val = vParams[param],
      defaultVal = urlArgDefaults[param][1]
    if (val !== defaultVal) {
      vArgs[param] = val ? 1 : 0
    }
  }

  // include the global alpha value if it differs from 1
  for (const param of ["T", "tau", "alpha", "sz"]) {
    const val = vParams[param],
      defaultVal = urlArgDefaults[param][1]
    if (val !== defaultVal) {
      vArgs[param] = Math.round(val)
    }
  }

  const paramsString = Object.entries({ ...(altQargs || qArgs), ...vArgs })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&")
  return `?${paramsString}`
}

async function updateURL() {
  await nextTask()
  const newURL = getUrlString()

  if (url !== newURL) {
    // console.log(`pushing: ${newURL}`);
    url = newURL
    window.history.replaceState("", "", newURL)
  }
}

initializeURL()
vParams.onChange(updateURL)
map.on("moveend", updateURL)
