/*
 * Model.js -- This module defines the parameters of the Heatflask client,
 *    beginning with those specified by the current URL in the browser.
 */

// import { CURRENT_USER } from "./Init.js";
import { BoundObject } from "./DataBinding.js";

/*
 * These are all the possible arguments that might be in the URL
 * parameter string.  The format here is:
 *     key: [[kwd1, kwd2, ...], default-value]
 * where kwd1, kwd2, etc are possible parameter names for this field
 */
const urlArgDefaults = {
  // Query parameters
  date1: [["start", "after", "date1", "a"], null],
  date2: [["end", "before", "date2", "b"], null],
  days: [["days", "preset", "d"], null],
  limit: [["limit", "l"], 10],
  ids: [["id", "ids"], ""],
  key: [["key"], null],

  // Visual parameters
  zoom: [["zoom", "z"], 3],
  lat: [["lat", "x"], 27.53],
  lng: [["lng", "y"], 1.58],
  autozoom: [["autozoom", "az"], true],
  c1: [["c1"], null],
  c2: [["c2"], null],
  sz: [["sz"], null],
  geohash: [["geohash"], null],
  paused: [["paused", "pu"], false],
  shadows: [["sh", "shadows"], true],
  paths: [["pa", "paths"], true],
  alpha: [["alpha"], 1],
  baselayer: [["baselayer", "map", "bl"], null],
};

const userid = window.location.pathname.substring(1);

const urlArgs = new URL(window.location.href).searchParams;

const names = {};
const params = {};

for (const [key, val] of Object.entries(urlArgDefaults)) {
  names[key] = val[0];
  params[key] = val[1];
}

/* parse parameters from the url */
for (const [uKey, value] of urlArgs.entries()) {
  for (const [pKey, pNames] of Object.entries(names)) {
    if (pNames.includes(uKey)) {
      params[pKey] = value;
      delete names[pKey]; // this field is set no need to check it again
      break;
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
 * @typedef {Object} dataQuery
 * @property {String} key - A lookup representing a query stored on the server
 * @property {String} userid - Identifier for the owner of the requested activities
 * @property {String} date1 - Start date
 * @property {String} date2 - End date
 * @property {String} ids - A string representing a list of activity ids
 * @property {Number} quantity
 * @property {String} queryType - "days", "activities", "dates", "ids", or "key"
 */

/**
 * Ininitial query extracted from defaults and URL parameters
 * @type {dataQuery}
 */
const qParamsInit = {
  userid: userid === "main.html" ? "" : userid,
  date1: params.date1,
  date2: params.date2,
  ids: params.ids,
  key: params.key,
};

qParamsInit.queryType = urlArgs["key"]
  ? "key"
  : params.ids
  ? "ids"
  : params.date1 || params.date2
  ? "dates"
  : params.days
  ? "days"
  : "activities";

qParamsInit.quantity =
  params.queryType === "days" ? +params.days : +params.limit;

/**
 * Current values of query parameters in the DOM
 * @type {BoundObject}
 */
export const qParams = BoundObject.fromObject(qParamsInit, {event: "change"});

/**
 * visual-parameters are those that determine what appears visually.
 *
 * @typedef {Object} visualParameters
 * @property {Number} zoom - map zoom level
 * @property {Array<Number>} center - map latitude, longitude
 * @property {Boolean} autozoom - Whether or not to automatically zoom
 *             to include all of the activities after render
 * @property {Number} c1 - Dot Constant C1
 * @property {Number} c2 - Dot Constant C2
 * @property {Number} sz - Dot Size
 * @property {String} geohash - An alternative indicator of map location
 * @property {Boolean} paused - Whether the animation is paused
 * @property {Boolean|Number} shadows - Whether dots have shadows
 *                                    (or shadow height)
 * @property {Boolean} paths - Whether to show paths
 * @property {Number} alpha - opacity of the vizualization over the map
 * @property {String} baselayer - The name of the current baselayer
 */

/**
 * Ininitial visual parameters extracted from defaults and URL parameters
 * @type {visualParameters}
 */
const vParamsInit = {
  center: [params["lat"], params["lng"]],
  zoom: params["zoom"],
  geohash: params["geohash"],
  autozoom: params["autozoom"],
  paused: params["paused"],
  baselayer: params["baselayer"],

  c1: params["c1"],
  c2: params["c2"],
  sz: params["sz"],
  alpha: params["alpha"],
  shadows: params["shadows"],
  paths: params["paths"],
};

/**
 * The visual paramters for the current view
 * @type {BoundObject}
 */
const vParams = BoundObject.fromObject(vParamsInit, {
  // bind "change" events of any elements whos data-bind attribute matches these
  event: "change",

  // except for the sliders whcih use "input" events
  sz: {event: "input"},
  alpha: {event: "input"}
});

// info elements have one-way bindings because the user cannot change them
export const messages = BoundObject.fromDOMelements("[data-class=info]");

export const targetUser = BoundObject.fromDOMelements("[data-class=target-user]");

export const currentUser = BoundObject.fromDOMelements("[data-class=current-user]");
currentUser.addProperty("authenticated", false);

export const items = new Set();

const state = {
  items: items,
  vParams: vParams,
  qParams: qParams,
  messages: messages,
  targetUser: targetUser,
  currentUser: currentUser,
  clientID: null
};

window["app"] = state;

export { state as default };
