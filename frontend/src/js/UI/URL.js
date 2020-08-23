/*
 * URL.js -- Browser URL functionality
 */

import * as Dom from "../Dom.js";
import { qParams, vParams } from "../Model.js";
import { map } from "../MapAPI.js";

/*
 * Update the browser's current URL
 *   This gets called when certain app parameters change
 */
export function updateURL() {
  const args = {};

  switch (qParams.queryType) {
    case "activities" || "days":
      args[qParams.queryType] = qParams.quantity;
      break;

    case "ids":
      args.id = qParams.ids;
      break;

    case "dates":
      args.after = qParams.date1;
      args.before = qParams.before;

    case "key":
      args.key = qParams.key;
  }

  if (vParams.autozoom) {
    args.az = 1;
  } else if (vParams.geohash) {
    args.geohash = vParams.geohash;
  } else {
    const zoom = vParams.zoom,
      center = vParams.center,
      precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));
    //here
    if (center) {
      params.lat = center.lat.toFixed(precision);
      params.lng = center.lng.toFixed(precision);
      params.zoom = zoom;
    }
  }

  if (dotLayer) {
    const ds = dotLayer.getDotSettings();

    params["c1"] = Math.round(ds["C1"]);
    params["c2"] = Math.round(ds["C2"]);
    params["sz"] = Math.round(ds["dotScale"]);
  }

  if (appState.currentBaseLayer.name) {
    params["baselayer"] = appState.currentBaseLayer.name;
  }

  const paramsString = Object.entries(params)
      .filter(([k, v]) => !!v)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&"),
    newURL = `${targetUser.id}?${paramsString}`;

  if (appState.url != newURL) {
    // console.log(`pushing: ${newURL}`);
    appState.url = newURL;
    window.history.replaceState("", "", newURL);
  }
}
