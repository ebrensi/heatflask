/*
 * Model.js -- This module defines the parameters of the Heatflask client,
 *    beginning with those specified by the current URL in the browser.
 */

// import { CURRENT_USER } from "./Init.js";
import { BoundObject } from "./DataBinding.js";

/**
 * query parameters are those that describe the query we make to the
 * backend for activity data
 *
 * @namespace
 * @property {String} key - A lookup representing a query stored on the server
 * @property {String} date1 - Start date
 * @property {String} date2 - End date
 * @property {String|Number} days  - Number of most recent days
 * @property {String|Number} limit - Number of most recent activities
 * @property {String} ids - A string representing a list of activity ids
 */
const queryDefaults = {
  date1: [["start", "after", "date1", "a"], null],
  date2: [["end", "before", "date2", "b"], null],
  days: [["days", "preset", "d"], null],
  limit: [["limit", "l"], 10],
  ids: [["id", "ids"], ""],
  key: [["key"], null],
};

/**
 * vparams (visual-parameters) are those that determine
 *   what appears visually.
 * @namespace
 * @property {Number} zoom - current zoom level
 * @property {Number} lat - current latitude
 * @property {Number} lng - current longitude
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
const vparamDefaults = {
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

const paramDefaults = { ...queryDefaults, ...vparamDefaults };

/* The current url is {domain}{/{userid}}?{urlArgs}.
    modelKey indicates whether this is simple (single target user) view,
    or a complex (multi-user) view

    If userid is empty string:
        * urlArgs["key"] is a lookup for a complex (multi-user) data-query
        * the rest of urlArgs is visual parameters
         (dots, map, speed, duration, dot-size, etc)

    If userid is a non-empty string:
        * userid is the identifier (id or username) of a single target user
        * urlArgs contains both visual and data-query parameters.
*/
const userid = window.location.pathname.substring(1);

const urlArgs = new URL(window.location.href).searchParams;

const names = {};
const params = {};

for (const [key, val] of Object.entries(paramDefaults)) {
  names[key] = val[0];
  params[key] = val[1];
}

/* parse visual parameters from the url */
for (const [uKey, value] of urlArgs.entries()) {
  for (const [pKey, pNames] of Object.entries(names)) {
    if (pNames.includes(uKey)) {
      params[pKey] = value;
      delete names[pKey]; // this field is set no need to check it again
      break;
    }
  }
}

params.queryType = urlArgs["key"]
  ? "key"
  : params.ids
  ? "ids"
  : params.date1 || params.date2
  ? "dates"
  : params.days
  ? "days"
  : "activities";

params.quantity = params.queryType === "days" ? +params.days : +params.limit;

export const qParams = new BoundObject();

for (const el of document.querySelectorAll("[data-class=query]")) {
  const param = el.dataset.bind,
    attr = el.dataset.attr || "value";

  qParams.addProperty(param, params[param]).addDOMbinding({
    element: el,
    attribute: attr,
    event: "change",
  });
}

// These qParams don't have bindings yet
qParams.addProperty("userid", userid);

export const vParamsInit = {
  center: [params["lat"], params["lng"]],
  zoom: params["zoom"],
  autozoom: params["autozoom"],
  c1: params["c1"],
  c2: params["c2"],
  sz: params["sz"],
  paused: params["paused"],
  shadows: params["shadows"],
  paths: params["paths"],
  alpha: params["alpha"],
  baselayer: params["baselayer"],
};

const vParams = new BoundObject();
for (const [key, val] of Object.entries(vParamsInit)) {
  const bv = vParams.addProperty(key, val),
    elements = document.querySelectorAll(`[data-bind=${key}]`);

  for (const el of elements) {
    bv.addDOMbinding({
      element: el,
      attribute: el.dataset.attr || "value",
      event: el.dataset.event || "change",
    });
  }
}

export const items = new Set();

const state = {
  items: items,
  vParams: vParams,
  qParams: qParams,
};

window["app"] = state;

export { state as default };

// debugger;
