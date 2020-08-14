/*
 * Model.js -- This module defines the parameters of the Heatflask client,
 *    beginning with those specified by the current URL in the browser.
 */

// import { CURRENT_USER } from "./Init.js";
import { BoundVariable } from "./Binding.js";

/**
 * Create a DOM binding with an object property
 * https://www.wintellect.com/data-binding-pure-javascript/
 *
 * @param {[type]} b [description]
 */
// function Binding(object, property) {
//   const _this = this;

//   this.DOMbindings = [];
//   this.generalBindings = [];

//   this.value = object[property];

//   this.valueSetter = function (val) {
//     _this.value = val;
//     for (let i = 0; i < _this.DOMbindings.length; i++) {
//       const binding = _this.DOMbindings[i];
//       binding.element[binding.attribute] = val;
//     }

//     for (let i = 0; i < _this.generalBindings.length; i++) {
//       const binding = _this.generalBindings[i];
//       binding.set(val);
//     }
//   };

//   this.addDOMbinding = function (element, attribute, event) {
//     const binding = {
//       element: element,
//       attribute: attribute,
//     };

//     if (event) {
//       element.addEventListener(event, function () {
//         _this.valueSetter(element[attribute]);
//       });
//       binding.event = event;
//     }
//     _this.DOMbindings.push(binding);
//     element[attribute] = _this.value;
//     return _this;
//   };

//   this.addGeneralBinding = function (object, setFunc) {
//     const binding = {
//       set: setFunc,
//     };

//     this.generalBindings.push(binding);
//     setFunc(_this.value);

//     return function onChange(newVal) {
//       _this.valueSetter(newVal);
//     };
//   };

//   Object.defineProperty(object, property, {
//     get: function () {
//       return _this.value;
//     },
//     set: this.valueSetter,
//   });

//   object[property] = this.value;
// }

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

const qParams = {};
for (const el of document.querySelectorAll("[data-class=query]")) {
  const param =  el.dataset.bind,
        attr = el.dataset.attr || "value";
  console.log(`binding ${param}`);
  qParams[param] = new BoundVariable(params[param]).addDOMbinding(el, attr, "change");
}

window.q = qParams;

export const vParams = {
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

export const items = new Set();

// const appState = {
//   items: items,

//   vparams: vParams,

//   query: query,
// };

// window["heatflask"] = appState;

// export { appState as default };

// debugger;
