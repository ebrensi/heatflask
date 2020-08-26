/*
 * URL.js -- Browser URL functionality
 */

import { qParams, vParams, targetUser, urlArgDefaults } from "../Model.js";
import { dotLayer } from "../DotLayerAPI.js";
import { map } from "../MapAPI.js";

let url;

/*
 * Update the browser's current URL
 *   This gets called when certain app parameters change
 */
function updateURL() {
  const args = {};

  switch (qParams.queryType) {
    case "activities" || "days":
      args[qParams.queryType] = qParams.quantity;
      break;

    case "ids":
      args.id = qParams.ids;
      break;

    case "dates":
      args.before = qParams.before;
      args.after = qParams.after;
      break;

    case "key":
      args.key = qParams.key;
  }

  if (vParams.autozoom) {
    args.az = 1;
  } else {
    args.geohash = vParams.geohash;
  }

  const ds = dotLayer.getDotSettings();
  args.c1 = Math.round(ds.C1);
  args.c2 = Math.round(ds.C2);
  args.sz = Math.round(ds.dotScale);


  args.bl = vParams.baselayer;

  const paramsString = Object.entries(args)
      .filter(([k, v]) => !!v && v !== urlArgDefaults[k][1])
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&"),
    newURL = `${targetUser.id}?${paramsString}`;

  if (url !== newURL) {
    // console.log(`pushing: ${newURL}`);
    url = newURL;
    window.history.replaceState("", "", newURL);
  }
}


// Updates URL on map move if autozoom is turned off
vParams.onChange("autozoom", (val) => {
  if (val) {
    map.off("moveend", updateURL);
  } else {
    map.on("moveend", updateURL);
  }
});

