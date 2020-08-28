/*
 * URL.js -- Browser URL functionality
 */

import { qParams, vParams, urlArgDefaults } from "./Model.js";
// import { dotLayer } from "../DotLayerAPI.js";
import { defaultBaselayerName, map } from "./MapAPI.js";

let url;

function updateURL() {
  const args = {};

  switch (qParams.queryType) {
    case "activities":
      args.n = qParams.quantity;
      break;

    case "days":
      args.days = qParams.quantity;
      break;

    case "ids":
      args.id = qParams.ids;
      break;

    case "dates":
      if (qParams.before) args.before = qParams.before;
      if (qParams.after) args.after = qParams.after;
      break;

    case "key":
      args.key = qParams.key;
  }

  // put geohash in the url if autozoom is disabled
  if (!vParams.autozoom) args.geohash = vParams.geohash;

  // include baselayer name if it isn't the default
  if (vParams.baselayer !== defaultBaselayerName) args.map = vParams.baselayer;

  // include boolean options as 1 or 0 if they differ from the defaults
  for (const param of ["paused", "shadows", "paths"]) {
    const val = vParams[param],
      defaultVal = urlArgDefaults[param][1];
    if (val !== defaultVal) {
      args[param] = val ? 1 : 0;
    }
  }

  // include the global alpha value if it differs from 1
  if (vParams.alpha < 1) args.alpha = vParams.alpha;

  if (qParams.userid)
    args.user = qParams.userid;

  const paramsString = Object.entries(args)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&"),
    // newURL = `${targetUser.id}?${paramsString}`;
    newURL = `?${paramsString}`;

  if (url !== newURL) {
    console.log(`pushing: ${newURL}`);
    url = newURL;
    window.history.replaceState("", "", newURL);
  }
}



updateURL();

qParams.onChange(updateURL);
vParams.onChange(updateURL);
map.on("moveend", updateURL);
