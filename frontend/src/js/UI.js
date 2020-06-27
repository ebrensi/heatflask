/*
 *  UI.js -- the front-end user interface for heatflask.
 *  Here we initialize the app model and set up the DOM
 */

// We use min as our "bootstrap" framework
import "../ext/css/min_entireframework.min.css";
import "../css/font-awesome-lite.css";

// Populate the browser window with a Leaflet map
import { map, msgBox, default_baseLayer, layerControl } from "./mapAPI.js";

import {
    ONLOAD_PARAMS,
    SELF,
    LOGGED_IN,
    SHARE_STATUS_UPDATE_URL,
    FLASH_MESSAGES,
    SHARE_PROFILE,
    USERPIC,
    ADMIN
} from "./Constants.js";

const USER_ID = ONLOAD_PARAMS["userid"];

import WS_SCHEME from "./appUtil.js";

import * as Dom from "./Dom.js";

/*
 * Set up the DOM with initial values, either defaults or
 *  specified as url parameters
 */


// if (FLASH_MESSAGES.length > 0) {
//     let msg = "<ul class=flashes>";
//     for (let i=0, len=FLASH_MESSAGES.length; i<len; i++) {
//         msg += "<li>" + FLASH_MESSAGES[i] + "</li>";
//     }
//     msg += "</ul>";
//     Lcontrol.window(map, {content:msg, visible:true});
// }


// get the parameters specified in the browser's current url
const urlArgs = new URL(window.location.href).searchParams;
console.log(`url parameters: ${urlArgs}`);

// put user profile urls in the DOM
Dom.prop(".strava-profile-link", "href", `https://www.strava.com/athletes/${USER_ID}`);

// Dom.addEvent(".logout", "click", e => console.log("logging out"));


// put Strava-login button images into the DOM
import strava_login_img from "../images/btn_strava_connectwith_orange.svg";
Dom.prop(".strava-auth", "src", strava_login_img);

// add paypal buttons
import paypalButtonHtml from "../html/paypal-button.html";
Dom.prop(".paypal-form", "innerHTML", paypalButtonHtml);


Dom.prop("#zoom-to-selection", "checked", false);
Dom.hide(".abort-render");
Dom.hide(".progbar");

Dom.prop("#autozoom", 'checked', ONLOAD_PARAMS["autozoom"]);
Dom.set("#activity_ids", "");

Dom.prop("#share", "checked", SHARE_PROFILE);


// Display or hide stuff based on whether current user is logged in
if (LOGGED_IN) {
    Dom.show(".logged-in");
    Dom.hide(".logged-out");

    // put user profile pics
    Dom.prop(".avatar", "src", USERPIC);
} else {
    Dom.show(".logged-out");
    Dom.hide(".logged-in");
}

// Display or hide stuff based on whether current user is an admin
if (ADMIN) {
  Dom.show(".admin");
} else {
  Dom.hide(".admin");
}

// Display or hide stuff based on whether or not current user
//  is the same as the user whose activities are being viewed
if (SELF) {
    Dom.show(".self");
} else {
    Dom.hide(".self");
}



/*
 * set up activity-query form
 */

// Put date-pickers in DOM
import "../../node_modules/pikaday/css/pikaday.css";
import Pikaday from 'pikaday';
function makeDatePicker(selector) {
    const el = Dom.el(selector),
          picker = new Pikaday({
        field: el,
        onSelect: function(date) {
            el.value = date.toISOString().split('T')[0];
            Dom.set(".preset", "");
        },
        yearRange: [2000, 2022],
        theme: "dark-theme"

    });
    return picker;
}

const date1picker = makeDatePicker('#date1'),
      date2picker = makeDatePicker('#date2');

// Set up form based on what kind of query this is
if (ONLOAD_PARAMS["activity_ids"]) {
    Dom.set("#activity_ids", ONLOAD_PARAMS["activity_ids"]);
    Dom.set("#select_type", "activity_ids");
} else if (ONLOAD_PARAMS["limit"]) {
    Dom.set("#num", ONLOAD_PARAMS["limit"]);
    Dom.set("#select_type", "activities");
} else if (ONLOAD_PARAMS["preset"]) {
    Dom.set("#num", ONLOAD_PARAMS["preset"]);
    Dom.set("#select_type", "days");
} else {
    Dom.set('#date1', ONLOAD_PARAMS["date1"]);
    Dom.set('#date2', ONLOAD_PARAMS["date2"]);
    Dom.set('#preset', "");
}

// formatQueryForm gets called whenever the activity query form changes
function formatQueryForm() {
    const num = Dom.get("#num"),
          type = Dom.get("#select_type");

    if (type === "days"){
        Dom.hide(".date-select");
        Dom.hide("#id_select");
        Dom.show("#num_field");
        Dom.set('#date2', "now");
        date2picker.gotoToday();
        date2picker.setEndRange(new Date());

        let d = new Date();
        d.setDate(d.getDate()-num);
        Dom.set('#date1', d.toISOString().split('T')[0] );
        date1picker.gotoDate(d);
        date1picker.setStartRange(d);

    } else if (type === "activities") {
        Dom.hide(".date-select");
        Dom.hide("#id_select");
        Dom.show("#num_field");
        Dom.set('#date1', "");
        Dom.set('#date2', "now");
        date2picker.gotoToday();
    }
    else if (type === "activity_ids") {
        Dom.hide(".date-select");
        Dom.hide("#num_field");
        Dom.show("#id_select");
    } else {
        Dom.show(".date-select");
        Dom.set("#num", "");
        Dom.hide("#num_field");
        Dom.hide("#id_select");
    }
}


// initial format of the Query form
formatQueryForm();
Dom.addEvent(".preset", "change", formatQueryForm);


// --------------------------------------------------------------------------

/*
 * instantiate a DotLayer object and add it to the map
 */
import { DotLayer } from "./DotLayer/DotLayer.js";
export const dotLayer = new DotLayer({
    startPaused: ONLOAD_PARAMS["paused"]
}).addTo(map);


// set initial values from defaults or specified in url
let ds = dotLayer.getDotSettings();

const C1 = ONLOAD_PARAMS["C1"],
      C2 = ONLOAD_PARAMS["C2"],
      SZ = ONLOAD_PARAMS["SZ"];

ds["C1"] = C1;
ds["C2"] = C2;
ds["dotScale"] = SZ;


const SPEED_SCALE = 5.0,
      SEP_SCALE = {m: 0.15, b: 15.0};

Dom.set("#sepConst", (Math.log2(C1) - SEP_SCALE.b) / SEP_SCALE.m );
Dom.set("#speedConst", Math.sqrt(C2) / SPEED_SCALE );
Dom.set("#dotScale", ds["dotScale"]);
Dom.set("#dotAlpha", ds["dotAlpha"]);


// the following two statements seem to be redundant
Dom.prop("#shadows", "checked", dotLayer.options.dotShadows.enabled);
if (ONLOAD_PARAMS["shadows"]) {
    Dom.set("#shadows", "checked");
}

Dom.addEvent("#shadows", "change", (e) => {
    dotLayer.updateDotSettings(null, {"enabled": e.target.checked})
});

Dom.prop("#showPaths", "checked", dotLayer.options.showPaths);
Dom.addEvent("#showPaths", "change", function(){
     dotLayer.options.showPaths = Dom.prop("#showPaths", "checked");
     dotLayer._redraw();
});

dotLayer.updateDotSettings(ds);

// now add dotlayer controls to the DOM


/*
 * appState is our model
 *  We expect map and dotLayer to be in the namespace
 *
 */
// export const appState = {
//   paused: ONLOAD_PARAMS.start_paused,
//   items: new Map(),
//   currentBaseLayer: null,
//   msgBox: null,

//   update: function(event){
//     let  params = {},
//          type = Dom.get("#select_type"),
//          num = Dom.get("#select_num"),
//          ids = Dom.get("#activity_ids");

//     if (type == "activities") {
//         params["limit"] = num;
//     } else if (type == "activity_ids") {
//         if (ids) {
//           params["id"] = ids;
//         }
//     } else if (type == "days") {
//         params["preset"] = num;
//     } else {
//         if (this.after) {
//             params["after"] = this.after;
//         }
//         if (this.before && (this.before != "now")) {
//             params["before"] = this.before;
//         }
//     }

//     if (this.paused){
//         params["paused"] = "1";
//     }

//     if (Dom.prop("#autozoom", 'checked')) {
//         this.autozoom = true;
//         params["autozoom"] = "1";
//     } else {
//         this.autozoom = false;
//         const zoom = map.getZoom(),
//               center = map.getCenter(),
//               precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));

//         if (center) {
//             params.lat = center.lat.toFixed(precision);
//             params.lng = center.lng.toFixed(precision);
//             params.zoom = zoom;
//         }
//     }

//     if (dotLayer) {
//         const ds = dotLayer.getDotSettings();

//         params["c1"] = Math.round(ds["C1"]);
//         params["c2"] = Math.round(ds["C2"]);
//         params["sz"] = Math.round(ds["dotScale"]);

//         // Enable capture if period is less than CAPTURE_DURATION_MAX
//         const cycleDuration = dotLayer.periodInSecs().toFixed(2),
//               captureEnabled = controls.captureControl.enabled;

//         Dom.html("#period-value", cycleDuration);

//         if (cycleDuration <= CAPTURE_DURATION_MAX) {
//             if (!captureEnabled) {
//                 controls.captureControl.addTo(map);
//                 controls.captureControl.enabled = true;
//             }
//         } else if (captureEnabled) {
//             controls.captureControl.removeFrom(map);
//             controls.captureControl.enabled = false;
//         }
//     }

//     if (this.currentBaseLayer.name) {
//         params["baselayer"] = this.currentBaseLayer.name;
//     }

//     const paramsString = Object.keys(params).map(function(param) {
//               return encodeURIComponent(param) + '=' +
//               encodeURIComponent(params[param]);
//           }).join('&'),

//           newURL = `${USER_ID}?${paramsString}`;

//     if (this.url != newURL) {
//         // console.log(`pushing: ${newURL}`);
//         this.url = newURL;
//         window.history.replaceState("", "", newURL);
//     }
//   },

//   updateShareStatus: async function(status) {
//     if (OFFLINE) {
//         return;
//     }

//     const resp = await fetch(`${SHARE_STATUS_UPDATE_URL}?status=${status}`),
//           text = await resp.text();
//     console.log(`response: ${text}`);
//   },



//   /*
//    * Selections
//    */
//   selectedIDs: function(){
//     return Array.from(this.items.values())
//                 .filter(A => A.selected)
//                 .map(A => A.id );
//   },

//   zoomToSelectedPaths: function(){
//     // Pan-Zoom to fit all selected activities
//     let selection_bounds = latLngBounds();
//     appState.items.forEach((A, id) => {
//         if (A.selected) {
//             selection_bounds.extend(A.bounds);
//         }
//     });
//     if (selection_bounds.isValid()) {
//         map.fitBounds(selection_bounds);
//     }
//   },

//   openSelected: function(){
//     let ids = selectedIDs();
//     if (ids.length > 0) {
//         let url = BASE_USER_URL + "?id=" + ids.join("+");
//         if (appState.paused == true){
//             url += "&paused=1"
//         }
//         window.open(url,'_blank');
//     }
//   },

//   deselectAll: function(){
//     handle_path_selections(selectedIDs());
//   },


// };


// function activityDataPopup(id, latlng){
//     let A = appState.items.get(id),
//         d = A.total_distance,
//         elapsed = util.hhmmss(A.elapsed_time),
//         v = A.average_speed,
//         dkm = +(d / 1000).toFixed(2),
//         dmi = +(d / 1609.34).toFixed(2),
//         vkm,
//         vmi;

//     if (A.vtype == "pace"){
//         vkm = util.hhmmss(1000 / v).slice(3) + "/km";
//         vmi = util.hhmmss(1609.34 / v).slice(3) + "/mi";
//     } else {
//         vkm = (v * 3600 / 1000).toFixed(2) + "km/hr";
//         vmi = (v * 3600 / 1609.34).toFixed(2) + "mi/hr";
//     }

//     const popupContent = `
//         <b>${A.name}</b><br>
//         ${A.type}:&nbsp;${A.tsLoc}<br>
//         ${dkm}&nbsp;km&nbsp;(${dmi}&nbsp;mi)&nbsp;in&nbsp;${elapsed}<br>
//         ${vkm}&nbsp;(${vmi})<br>
//         View&nbsp;in&nbsp;
//         <a href='https://www.strava.com/activities/${A.id}' target='_blank'>Strava</a>
//         ,&nbsp;
//         <a href='${BASE_USER_URL}?id=${A.id}'&nbsp;target='_blank'>Heatflask</a>
//     `;

//     const popup = L.popup().setLatLng(latlng).setContent(popupContent).openOn(map);
// }


// // What to do when user changes to a different tab or window
// document.onvisibilitychange = function() {
//     if (document.hidden) {
//         if (!appState.paused)
//             dotLayer.pause();
//     } else if (!appState.paused && dotLayer) {
//         dotLayer.animate();

//     }
// };

// appState.currentBaseLayer = default_baseLayer;
// map.on('baselayerchange', function (e) {
//     appState.currentBaseLayer = e.layer;
//     appState.update();
// });
