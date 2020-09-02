/*
 *  UI.js -- the front-end user interface for heatflask.
 *  Here we initialize the DOM/user interface
 */

// import "leaflet-easybutton";

import { BEACON_HANDLER_URL, AUTHORIZE_URL, USER_URLS } from "./Init.js";

import app from "./Model.js";
import "./URL.js";

// import { map } from "./MapAPI.js";
// import { dotLayer } from "./DotLayerAPI.js";
// import "./DotControls.js";
// import strava_login_img from "url:../images/btn_strava_connectwith_orange.svg";

import paypalButtonHTML from "bundle-text:../html/paypal-button.html";
import infoTabHTML from "bundle-text:../html/main-info.html";

// import { makeQuery } from "./DataImport.js";

// makeQuery();

/* TODO: have two UI submodules: UI-simple.js (single) and
                                 UI-complex.js (multi-user)

    one of which to be dynamically imported depending on the data query.

  right now we are only doing the single target-user UI.
*/

let dotLayer;

// What to do when user changes to a different tab or window
document.onvisibilitychange = function () {
  const paused = app.vParams.paused;
  if (document.hidden && !paused) {
    dotLayer.pause();
  } else if (!paused) {
    dotLayer.animate();
  }
};

document.querySelector("#info-tab").innerHTML = infoTabHTML;

document.querySelectorAll(".paypal-button").forEach((el) => {
  el.innerHTML = paypalButtonHTML;
});

/*
 * Set a listener to change user's account to public or private
 *  if they change that setting
 */
app.currentUser.onChange("public", async (status) => {
  const id = app.currentUser.id;
  const statusUpdateURL = USER_URLS(id).public;
  const resp = await fetch(`${statusUpdateURL}?status=${status}`);
  const response = await resp.text();
  console.log(`response: ${response}`);
});

/*
 * Bind data-actions
 */
const userActions = {
  "selection-clear": null,
  "selection-render": null,
  query: null,
  "abort-query": null,
  login: null,
  logout: null,
  delete: null,
  "view-index": openIndexView,
};

const doAction = (event) => {
  const name = event.target.dataset.action,
    action = userActions[name];
  console.log(name);
  action && action();
};

for (const el of document.querySelectorAll("[data-action]")) {
  el.addEventListener("click", doAction);
}

// put Strava-login button images into the DOM
// Dom.prop(".strava-auth", "src", strava_login_img);

function openIndexView(id) {
  id = id || app.currentUser.id;
  if (!id) return;
  const indexViewURL = USER_URLS(id).index;
  window.open(indexViewURL, "_blank");
}

// /*
//  *  Set up or tear down current user stuff
//  */
// if (app.currentUser.id) {
//   /* enable log out button */
//   Dom.addEvent(".logout", "click", () => {
//     console.log(`${currentUser.id} logging out`);
//     window.open(currentUser.url.LOG_OUT);
//   });

//   /* enable strava authentication (login) button */
//   Dom.addEvent(".strava-auth", "click", () => {
//     window.location.href = AUTHORIZE_URL;
//   });
//   nTabs = 3;
// }

// Dom.addEvent("#zoom-to-selection", "change", function(){
//     if ( Dom.prop("#zoom-to-selection", 'checked') ) {
//         zoomToSelectedPaths();
//     }
// });

// Dom.addEvent("#render-selection-button", "click", openSelected);
// Dom.addEvent("#clear-selection-button", "click", deselectAll);

// Dom.addEvent("#renderButton", "click", renderLayers);
// Dom.addEvent("#select_num", "keypress", function(event) {
//     if (event.which == 13) {
//         event.preventDefault();
//         renderLayers();
//     }
// });

window.addEventListener("beforeunload", () => {
  if (navigator.sendBeacon) {
    if (app.wskey) {
      navigator.sendBeacon(BEACON_HANDLER_URL, app.wskey);
    }
    navigator.sendBeacon(BEACON_HANDLER_URL, CLIENT_ID);
  }
  // if (sock && sock.readyState == 1) {
  //     sock.send(JSON.stringify({close: 1}));
  //     sock.close()
  // }
});
