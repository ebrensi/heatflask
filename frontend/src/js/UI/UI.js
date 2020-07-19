/*
 *  UI.js -- the front-end user interface for heatflask.
 *  Here we initialize the DOM/user interface
 */

/* min is a lightweight bootstrap-like style framework */
import "../../ext/css/min_entireframework.min.css";
import "../../css/font-awesome-lite.css";

import * as L from "leaflet";

import "leaflet-easybutton";
import "../../../node_modules/leaflet-easybutton/src/easy-button.css";

import {
    FLASH_MESSAGES,
    MAKE_USER_URLS,
    BEACON_HANDLER_URL,
    AUTHORIZE_URL,
    CLIENT_ID
} from "../Init.js";

import appState from "../Model.js";
import * as Dom from "../Dom.js";
import { date1picker, date2picker } "./DatePickers.js";
import { updateURL } from "./URL.js";
import { map, errMsg } from "../MapAPI.js";
import { dotLayer } from "../DotLayerAPI.js";
import "./DotControls.js";
import strava_login_img from "../../images/btn_strava_connectwith_orange.svg";
import paypalButtonHtml from "../../html/paypal-button.html";
import { makeQuery } from "./DataImport.js";

/* currentUser will be null if not logged-in */
let { currentUser } = appState;
const { vparams, query } = appState;

makeQuery()

/* TODO: have two UI submodules: UI-simple.js (single) and
                                 UI-complex.js (multi-user)

    one of which to be dynamically imported depending on the data query.

  right now we are only doing the single target-user UI.
*/



const targetUser = {
    id: query.userid
}

// SELF indicates whether the target user is also the current user
const SELF = currentUser && (currentUser.id === targetUser.id) || (currentUser.username === targetUser.id);

/*
 * Set up the DOM with initial values, either defaults or
 *  specified as url parameters
 */
if (FLASH_MESSAGES.length > 0) {
    let msg = "<ul class=flashes>";
    for (let i=0, len=FLASH_MESSAGES.length; i<len; i++) {
        msg += "<li>" + FLASH_MESSAGES[i] + "</li>";
    }
    msg += "</ul>";
    errMsg(msg);
}

targetUser.url = MAKE_USER_URLS(targetUser.id);

// put user profile urls in the DOM
Dom.prop(".strava-profile-link", "href", targetUser.url.STRAVA_PROFILE);


// put Strava-login button images into the DOM
Dom.prop(".strava-auth", "src", strava_login_img);

// add paypal buttons
Dom.prop(".paypal-form", "innerHTML", paypalButtonHtml);


Dom.prop("#zoom-to-selection", "checked", false);
Dom.hide(".abort-render");
Dom.hide(".progbar");

Dom.prop("#autozoom", 'checked', vparams.autozoom);
Dom.set("#activity_ids", query.ids);

let nTabs;

/*
    Display or hide stuff based on whether current user is logged in
*/
if (currentUser) {
    /* the current user is authenticated so we enable the profile tab
       and enable those controls

       currentUser attribute names (except for ones we create here) are strings
       defined by the backend server so we have to address them by their string
       literals so the references won't get renamed by an optimizer during bundling
    */
    Dom.prop("#share", "checked", currentUser["share_profile"]);
    Dom.show(".logged-in");
    Dom.hide(".logged-out");
    nTabs = 4;

    /* display user profile pic(s) */
    Dom.prop(".avatar", "src", currentUser["profile"]);

    currentUser.url = MAKE_USER_URLS(currentUser.id);

    // Set a listener to change user's account to public or private
    //   if they change that setting
    Dom.addEvent("#share", "change", async function() {
        let status = Dom.prop("#share", "checked")? "public":"private";
        const resp = await fetch(`${currentUser.url.SHARE_STATUS_UPDATE}?status=${status}`),
              text = await resp.text();
        console.log(`response: ${text}`);
    });

    /* enable activity list button */
    Dom.addEvent(".activity-list", "click", () => {
        window.open(currentUser.url.ACTIVITY_LIST, "_blank")
    });

    /* enable log out button */
    Dom.addEvent(".logout", "click", () => {
        console.log(`${currentUser.id} logging out`);
        window.open(currentUser.url.LOG_OUT);
    });

    if (currentUser.isAdmin) {
      Dom.show(".admin");
    }

    if (SELF) {
        Dom.show(".self");
    }
} else {
    Dom.show(".logged-out");
    Dom.hide(".logged-in");
    Dom.hide(".admin");
    Dom.hide(".self");

    /* enable strava authentication (login) button */
    Dom.addEvent(".strava-auth", "click", () => {
        window.location.href = AUTHORIZE_URL;
    });
    nTabs = 3;
}


// set collapsed sidebar height just enough for icons to fit
const root = document.documentElement;
root.style.setProperty("--sidebar-height", 50 * nTabs + 10 + "px");


/*
 * set up activity-query form
 */


// Set up form based on what kind of query this is
if (query.ids) {
    Dom.set("#activity_ids", query.ids);
    Dom.set("#select_type", "activity_ids");
} else if (query["limit"]) {
    Dom.set("#num", query.limit);
    Dom.set("#select_type", "activities");
} else if (query["preset"]) {
    Dom.set("#num", query.days);
    Dom.set("#select_type", "days");
} else {
    Dom.set('#date1', query.date1);
    Dom.set('#date2', query.date2);
    Dom.set('#preset', "");
}

// formatQueryForm gets called whenever the activity query form changes
function formatQueryForm() {
    const num = Dom.get("#num"),
          type = Dom.get("#select_type");

    query.type = type;

    let now, then;

    switch (type) {

        case "days":
            Dom.hide(".date-select");
            Dom.hide("#id_select");
            Dom.show("#num_field");
            Dom.set('#date2', "now");
            date2picker.gotoToday();
            now = new Date();
            date2picker.setEndRange(now);
            query.date2 = now;

            then = new Date();
            then.setDate(now.getDate()-num);
            Dom.set('#date1', then.toISOString().split('T')[0] );
            date1picker.gotoDate(then);
            date1picker.setStartRange(then);
            query.date1 = then;
            break;

        case "activities":
            Dom.hide(".date-select");
            Dom.hide("#id_select");
            Dom.show("#num_field");
            Dom.set('#date1', "");
            Dom.set('#date2', "now");
            query.limit = num;
            date2picker.gotoToday();
            break;

        case "activity-ids":
            Dom.hide(".date-select");
            Dom.hide("#num_field");
            Dom.show("#id_select");
            break;

        case "date_range":
            Dom.show(".date-select");
            Dom.set("#num", "");
            Dom.hide("#num_field");
            Dom.hide("#id_select");
            break;
    }
}

// initial format of the Query form
formatQueryForm();

// reformat every time the user makes a change
Dom.addEvent(".preset", "change", formatQueryForm);


// ---------------------------------------------------------



/* Handle autozoom setting:
    current map location and zoom are encoded in the URL
    unless autozoom is set.  In that case, the map will initially
    pan and zoom to accomodate all activities being rendered.
 */
Dom.addEvent("#autozoom", "change", updateURL);
map.on('moveend', () => {
    if (!Dom.prop("#autozoom", 'checked')) {
        updateURL();
    }
});

// update the url right now
updateURL();


// What to do when user changes to a different tab or window
document.onvisibilitychange = function() {
    if (document.hidden) {
        if (!appState.paused)
            dotLayer.pause();
    } else if (!appState.paused && dotLayer) {
        dotLayer.animate();

    }
};

map.on('baselayerchange', function (e) {
    appState.currentBaseLayer = e.layer;
    updateURL();
});


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


window.addEventListener('beforeunload', () => {
    if (navigator.sendBeacon) {
        if (appState.wskey) {
            navigator.sendBeacon(BEACON_HANDLER_URL, appState.wskey);
        }
        navigator.sendBeacon(BEACON_HANDLER_URL, CLIENT_ID);
    }
    // if (sock && sock.readyState == 1) {
    //     sock.send(JSON.stringify({close: 1}));
    //     sock.close()
    // }
});









