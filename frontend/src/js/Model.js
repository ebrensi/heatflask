/*
 * Model.js -- This module defines the parameters of the Heatflask client,
 *    beginning with those specified by the current URL in the browser.
 */

// import { CURRENT_USER } from "./Init.js";
import { BoundVariable, BoundVariableCollection } from "./Binding.js";


/**
 * query parameters are those that describe the query we make to the
 * backend for activity data
 * @type {object}
 */
const queryDefaults = {
  date1: [["start", "after", "date1", "a"], null],
  date2: [["end", "before", "date2", "b"], null],
  days: [["days", "preset", "d"], null],
  limit: [["limit", "l"], 10],
  ids: [["id", "ids"], ""],
};

/**
 * vparams (visual-parameters) are those that determine
 *   what appears visually.
 * @type {Object}
 */
const vparamDefaults = {
  zoom: [["zoom", "z"], 3],
  lat: [["lat", "x"], 27.53],
  lng: [["lng", "y"], 1.58],
  autozoom: [["autozoom", "az"], true],
  c1: [["c1"], null],
  c2: [["c2"], null],
  sz: [["sz"], null],
  paused: [["paused", "pu"], false],
  shadows: [["sh", "shadows"], true],
  paths: [["pa", "paths"], true],
  alpha: [["alpha"], 1],
  baselayer: [["baselayer", "map", "bl"], null],
};

const paramDefaults = { ...queryDefaults, ...vparamDefaults };

/* TODO: add a geohash location parameter.
        maybe replace lat and lng altogether with geohash */

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

const params = {};
const paramNames = {};

for (const [key, val] of Object.entries(paramDefaults)) {
  paramNames[key] = val[0];
  params[key] = val[1];
}

/* parse visual parameters from the url */
for (const [uKey, value] of urlArgs.entries()) {
  for (const [pKey, pNames] of Object.entries(paramNames)) {
    if (pNames.includes(uKey)) {
      params[pKey] = value;
      delete paramNames[pKey]; // this field is set no need to check it again
      break;
    }
  }
}

const queryType = urlArgs["key"]
  ? "key"
  : params.ids
  ? "ids"
  : params.date1 || params.date2
  ? "dates"
  : params.days
  ? "days"
  : "activities";

// const qParams = {
//   userid: userid,
//   queryType: queryType,
//   key: urlArgs["key"],
//   quantity: (queryType === "days")? +params.days : +params.limit,
//   date1: params.date1,
//   date2: params.date2,
//   ids: params.ids
// };

// const bindings = {};

// for (const el of document.querySelectorAll("[data-class=query]")) {
//   const param =  el.dataset.bind,
//         attr = el.dataset.attr || "value";
//   console.log(`binding ${param}`);
//   bindings[param] = new Binding(qParams, param).addDOMbinding(el, attr, "change");
// }

const qParams = new BoundVariableCollection();

for (const el of document.querySelectorAll("[data-class=query]")) {
  const param = el.dataset.bind,
    attr = el.dataset.attr || "value";
  console.log(`binding ${param}`);
  qParams.add(
    param,
    new BoundVariable(params[param]).addDOMbinding({
      element: el,
      attribute: attr,
      event: "change"
    })
  );
}


// export const vParams = {
//   center: [params["lat"], params["lng"]],
//   zoom: params["zoom"],
//   autozoom: params["autozoom"],
//   c1: params["c1"],
//   c2: params["c2"],
//   sz: params["sz"],
//   paused: params["paused"],
//   shadows: params["shadows"],
//   paths: params["paths"],
//   alpha: params["alpha"],
//   baselayer: params["baselayer"],
// };

const vParams = new BoundVariableCollection();
for (const el of document.querySelectorAll("[data-class=visual]")) {
  const param = el.dataset.bind,
        bindInfo = {
          element: el,
          attribute: el.dataset.attr || "value",
          event: "change"
        };

  console.log(`binding ${param}`);

  let bv;
  if (param in qParams.binds) {
    bv = qParams.binds[param];
  } else {
    bv = new BoundVariable(params[param]);
    qParams.add(param, bv);
  }

  bv.addDOMbinding(bindInfo);

}


export const items = new Set();

// const appState = {
//   items: items,

//   vparams: vParams,

//   query: query,
// };

// window["heatflask"] = appState;

// export { appState as default };

// debugger;
