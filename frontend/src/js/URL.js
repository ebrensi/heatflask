/*
 * URL.js -- Browser URL functionality
 */

import { qParams, vParams, urlArgDefaults } from "./Model.js"
// import { dotLayer } from "../DotLayerAPI.js";
import { defaultBaselayerName, map, sidebar } from "./MapAPI.js"

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

function updateURL() {
  const vArgs = {}

  // put geohash in the url if autozoom is disabled
  if (!vParams.autozoom) vArgs.geohash = vParams.geohash

  // include baselayer name if it isn't the default
  if (vParams.baselayer !== defaultBaselayerName) vArgs.map = vParams.baselayer

  // include boolean options as 1 or 0 if they differ from the defaults
  for (const param of ["paused", "shadows", "paths"]) {
    const val = vParams[param],
      defaultVal = urlArgDefaults[param][1]
    if (val !== defaultVal) {
      vArgs[param] = val ? 1 : 0
    }
  }

  // include the global alpha value if it differs from 1
  if (vParams.alpha < 1) vArgs.alpha = vParams.alpha

  const paramsString = Object.entries({ ...qArgs, ...vArgs })
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&"),
    // newURL = `${targetUser.id}?${paramsString}`;
    newURL = `?${paramsString}`

  if (url !== newURL) {
    // console.log(`pushing: ${newURL}`);
    url = newURL
    window.history.replaceState("", "", newURL)
  }
}

initializeURL()
vParams.onChange(updateURL)
map.on("moveend", updateURL)
