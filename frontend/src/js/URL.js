/*
 * URL.js -- Browser URL functionality
 */

import { qParams, vParams, targetUser, urlArgDefaults } from "./Model.js";
// import { dotLayer } from "../DotLayerAPI.js";
import { defaultBaselayerName } from "./MapAPI.js";

let url, args;

function updateQueryType() {
  switch (qParams.queryType) {
    case "activities" || "days":
      args[qParams.queryType] = qParams.quantity;
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
}

function updateURL() {
  const paramsString = Object.entries(args)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&"),
    newURL = `${targetUser.id}?${paramsString}`;

  if (url !== newURL) {
    // console.log(`pushing: ${newURL}`);
    url = newURL;
    window.history.replaceState("", "", newURL);
  }
}

/*
 * Update the browser's current URL
 *   This gets called when certain app parameters change
 */
function initializeURL() {
  args = {};
  updateQueryType();

  if (!vParams.autozoom) args.geohash = vParams.geohash;

  if (vParams.baselayer !== defaultBaselayerName) args.bl = vParams.baselayer;

  for (const param of ["paused", "shadows", "paths"]) {
    const val = vParams[param],
      defaultVal = urlArgDefaults[param];
    if (val !== defaultVal) {
      args[param] = val ? 1 : 0;
    }
  }

  if (vParams.alpha < 1) args.alpha = vParams.alpha;

  updateURL();
}

qParams.onChange("queryType", () => {
  initializeURL();
});

qParams.onChange("quantity", (n) => {
  args[qParams.queryType] = n;
  updateURL();
});

qParams.onChange("ids", (ids) => {
  args.id = ids;
  updateURL();
});

for (const param of ["before", "after"]) {
  qParams.onChange(param, (date) => {
    if (date) args[param] = date;
    updateURL();
  });
}

qParams.onChange("key", (key) => {
  args.key = key;
  updateURL();
});

/*
 *  Handle autozoom setting:
 *  current map location and zoom are encoded in the URL
 *  unless autozoom is set.  In that case, the map will initially
 *  pan and zoom to accomodate all activities being rendered.
 */
vParams.onChange("autozoom", (az) => {
  if (az) delete args.geohash;
  else args.geohash = vParams.geohash;
  updateURL();
});

vParams.onChange("geohash", (gh) => {
  if (vParams.autozoom) {
    args.geohash = gh;
  }
  updateURL();
});

for (const param of ["c1", "c2", "sz", "paused", "shadows", "paths"]) {
  vParams.onChange(param, (val) => {
    args[param] = val? 1 : 0;
    updateURL();
  });
}

vParams.onChange("baselayer", (bl) => {
  if (bl !== defaultBaselayerName) args.bl = bl;
  updateURL();
});

initializeURL();
