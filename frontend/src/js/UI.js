/*
 *  UI.js -- the front-end user interface for heatflask.
 *  Here we initialize the DOM/user interface
 */

// import "leaflet-easybutton";

import {
  BEACON_HANDLER_URL,
  AUTHORIZE_URL,
  USER_URLS
} from "./Init.js";

import app from "./Model.js";
import "./URL.js";

// import { map } from "./MapAPI.js";
// import { dotLayer } from "./DotLayerAPI.js";
// import "./DotControls.js";
// import strava_login_img from "url:../images/btn_strava_connectwith_orange.svg";

import paypalButtonHTML from "bundle-text:../html/paypal-button.html";
import infoTabHTML from  "bundle-text:../html/main-info.html";

// import { makeQuery } from "./DataImport.js";


// makeQuery();

/* TODO: have two UI submodules: UI-simple.js (single) and
                                 UI-complex.js (multi-user)

    one of which to be dynamically imported depending on the data query.

  right now we are only doing the single target-user UI.
*/

document.querySelector("#info-tab").innerHTML = infoTabHTML;


document.querySelectorAll(".paypal-button").forEach(el => {
  el.innerHTML = paypalButtonHTML;
});


// // put Strava-login button images into the DOM
// Dom.prop(".strava-auth", "src", strava_login_img);

// // add paypal buttons
// Dom.prop(".paypal-form", "innerHTML", paypalButtonHtml);



// Dom.prop("#zoom-to-selection", "checked", false);
// Dom.hide(".abort-render");
// Dom.hide(".progbar");

// let nTabs;

// /*
//     Display or hide stuff based on whether current user is logged in
// */
// if (currentUser) {
//   /* the current user is authenticated so we enable the profile tab
//        and enable those controls

//        currentUser attribute names (except for ones we create here) are strings
//        defined by the backend server so we have to address them by their string
//        literals so the references won't get renamed by an optimizer during bundling
//     */
//   Dom.prop("#share", "checked", currentUser["share_profile"]);
//   Dom.show(".logged-in");
//   Dom.hide(".logged-out");
//   nTabs = 4;

//   /* display user profile pic(s) */
//   Dom.prop(".avatar", "src", currentUser["profile"]);

//   currentUser.url = MAKE_USER_URLS(currentUser.id);

//   // Set a listener to change user's account to public or private
//   //   if they change that setting
//   Dom.addEvent("#share", "change", async function () {
//     let status = Dom.prop("#share", "checked") ? "public" : "private";
//     const resp = await fetch(
//         `${currentUser.url.SHARE_STATUS_UPDATE}?status=${status}`
//       ),
//       text = await resp.text();
//     console.log(`response: ${text}`);
//   });

//   /* enable activity list button */
//   Dom.addEvent(".activity-list", "click", () => {
//     window.open(currentUser.url.ACTIVITY_LIST, "_blank");
//   });

//   /* enable log out button */
//   Dom.addEvent(".logout", "click", () => {
//     console.log(`${currentUser.id} logging out`);
//     window.open(currentUser.url.LOG_OUT);
//   });

//   if (currentUser.isAdmin) {
//     Dom.show(".admin");
//   }

//   if (SELF) {
//     Dom.show(".self");
//   }
// } else {
//   Dom.show(".logged-out");
//   Dom.hide(".logged-in");
//   Dom.hide(".admin");
//   Dom.hide(".self");

//   /* enable strava authentication (login) button */
//   Dom.addEvent(".strava-auth", "click", () => {
//     window.location.href = AUTHORIZE_URL;
//   });
//   nTabs = 3;
// }


// // What to do when user changes to a different tab or window
// document.onvisibilitychange = function () {
//   if (document.hidden) {
//     if (!app.paused) dotLayer.pause();
//   } else if (!app.paused && dotLayer) {
//     dotLayer.animate();
//   }
// };


// // Dom.addEvent("#zoom-to-selection", "change", function(){
// //     if ( Dom.prop("#zoom-to-selection", 'checked') ) {
// //         zoomToSelectedPaths();
// //     }
// // });

// // Dom.addEvent("#render-selection-button", "click", openSelected);
// // Dom.addEvent("#clear-selection-button", "click", deselectAll);

// // Dom.addEvent("#renderButton", "click", renderLayers);
// // Dom.addEvent("#select_num", "keypress", function(event) {
// //     if (event.which == 13) {
// //         event.preventDefault();
// //         renderLayers();
// //     }
// // });

// window.addEventListener("beforeunload", () => {
//   if (navigator.sendBeacon) {
//     if (app.wskey) {
//       navigator.sendBeacon(BEACON_HANDLER_URL, app.wskey);
//     }
//     navigator.sendBeacon(BEACON_HANDLER_URL, CLIENT_ID);
//   }
//   // if (sock && sock.readyState == 1) {
//   //     sock.send(JSON.stringify({close: 1}));
//   //     sock.close()
//   // }
// });
