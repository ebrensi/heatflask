/*
 *  UI.js -- the front-end user interface for heatflask.
 *  Here we initialize the DOM/user interface
 */

/* min is a lightweight bootstrap-like style framework */
import "../ext/css/min_entireframework.min.css";
import "../css/font-awesome-lite.css";

import Pikaday from 'pikaday';
import "../../node_modules/pikaday/css/pikaday.css";

import * as L from "leaflet";

import "leaflet-easybutton";
import "../../node_modules/leaflet-easybutton/src/easy-button.css";

import pureknob from "pure-knob";

import {
    FLASH_MESSAGES,
    MAKE_USER_URLS,
    BEACON_HANDLER_URL,
    AUTHORIZE_URL,
    CLIENT_ID
} from "./Init.js";

import appState from "./Model.js";

import * as Dom from "./Dom.js";

import { map, errMsg } from "./MapAPI.js";

import { dotLayer } from "./DotLayerAPI.js";

import strava_login_img from "../images/btn_strava_connectwith_orange.svg";

import paypalButtonHtml from "../html/paypal-button.html";

import { makeQuery } from "./UI.DataImport.js";

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

// Put date-pickers in DOM
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


// Initialize knob controls for dotlayer
const rad = deg => deg * Math.PI/180,
      initial_knob_settings = {
        'angleStart': rad(0),
        'angleEnd': rad(360),
        'angleOffset': rad(-90),
        'colorFG': "rgba(0,255,255,0.4)",
        'colorBG': "rgba(255,255,255,0.2)",
        'trackWidth': 0.5,
        'valMin': 0,
        'valMax': 100,
        'needle': true,
      };

function makeKnob(selector, options) {
    const knob = pureknob.createKnob(options.width, options.height),
          mySettings = Object.assign({}, initial_knob_settings);

    Object.assign(mySettings, options);

    for ( const [property, value] of Object.entries(mySettings) ) {
        knob.setProperty(property, value);
    }

    const node = knob.node();

    Dom.el(selector).appendChild(node);

    return knob
}

/* set initial values from defaults or specified in url
    url params over-ride default values */
const dotConstants = dotLayer.getDotSettings();

const C1 = vparams.c1 || dotConstants["C1"],
      C2 = vparams.c2 || dotConstants["C2"],
      SZ = vparams.sz || dotConstants["dotScale"];

dotConstants["C1"] = vparams.c1 = C1;
dotConstants["C2"] = vparams.c2 = C2;
dotConstants["dotScale"] = vparams.sz = SZ;

const SPEED_SCALE = 5.0,
      SEP_SCALE = {m: 0.15, b: 15.0};

// Dom.set("#sepConst", (Math.log2(C1) - SEP_SCALE.b) / SEP_SCALE.m );
// Dom.set("#speedConst", Math.sqrt(C2) / SPEED_SCALE );
// Dom.set("#dotScale", ds["dotScale"]);
// Dom.set("#dotAlpha", ds["dotAlpha"]);

// Instantiate knob controls with initial values and add them to the DOM
const knobs = {
    timeScale: makeKnob('#dot-controls1', {
        width: "150",
        height: "150",
        "label": "Speed"
    }),

    period: makeKnob('#dot-controls1', {
        width: "150",
        height: "150",
        "label": "Sparcity"
    }),

    dotAlpha: makeKnob('#dot-controls2', {
        width: "100",
        height: "100",
        valMin: 0,
        valMax: 10,
        "label": "Alpha"
    }),

    dotSize: makeKnob('#dot-controls2', {
        width: "100",
        height: "100",
        valMin: 0,
        valMax: 10,
        "label": "Size"
    })
};

knobs.speed.setValue( Math.sqrt(C2) / SPEED_SCALE );
knobs.period.setValue( (Math.log2(C1) - SEP_SCALE.b) / SEP_SCALE.m );
knobs.dotSize.setValue(SZ);
knobs.dotAlpha.setValue(1);

function knobListener(knob, val) {
    let updatePeriod;

    const knobName = knob['_properties']['label'];

    switch (knobName) {
        case "Speed":
            vparams.c2 = val * val * SPEED_SCALE;
            dotLayer.updateDotSettings({C2: vparams.c2});
            console.log("C2: "+vparams.c2);
            updatePeriod = true;
        break;

        case "Sparcity":
            vparams.c1 = Math.pow(2, val * SEP_SCALE.m + SEP_SCALE.b);
            dotLayer.updateDotSettings({C1: vparams.c1});
            console.log("C1: "+vparams.c1);
            updatePeriod = true;
        break;

        case "Alpha":
            vparams.alpha = val / 10;
            dotLayer.updateDotSettings({alphaScale: vparams.alpha});
            dotLayer.drawPaths();
            console.log("alpha: "+vparams.alpha);
        break;

        case "Size":
            vparams.sz = val;
            dotLayer.updateDotSettings({dotScale: val});
            console.log("size: "+val);
        break;
    }

    if (updatePeriod) {
        const cycleDuration = dotLayer.periodInSecs().toFixed(2);
        Dom.html("#period-value", cycleDuration);
    }

    updateURL();
}


for (const knob of Object.values(knobs)) {
    knob.addListener(knobListener);
}



/* initialize shadow setting and change event */
const shadows = vparams["shadows"];
Dom.prop("#shadows", "checked", shadows);
dotLayer.updateDotSettings(dotConstants, {"enabled": shadows});
Dom.addEvent("#shadows", "change", (e) => {
    const enabled = e.target.checked;
    dotLayer.updateDotSettings(null, {"enabled": enabled});
    vparams["shadows"] = enabled;
    updateURL();
});

/* initialize show-paths setting and change event */
const paths = vparams["paths"]
Dom.prop("#showPaths", "checked", paths);
dotLayer.options.showPaths = paths;
Dom.addEvent("#showPaths", "change", (e) => {
    dotLayer.options.showPaths = vparams.paths = e.target.checked;
    dotLayer._redraw();
    updateURL();
});



// leaflet-easybutton is used for play/pause button and capture
// animation play-pause button
const button_states = [
    {
        stateName: 'animation-running',
        icon:      'fa-pause',
        title:     'Pause Animation',
        onClick: function(btn) {
            // pauseFlow();
            dotLayer.pause();
            vparams.paused = true;
            updateURL();
            btn.state('animation-paused');
            }
    },

    {
        stateName: 'animation-paused',
        icon:      'fa-play',
        title:     'Resume Animation',
        onClick: function(btn) {
            vparams.paused = false;
            dotLayer.animate();
            updateURL();
            btn.state('animation-running');
        }
    }
];


// add play/pause button to the map
L.easyButton({
    states: vparams.paused? button_states.reverse() : button_states,
}).addTo(map);



/* Update the browser's current URL
    This gets called when certain app parameters change
*/
function updateURL(){
    const  params = {};

    switch (Dom.get("#select_type")) {
        case "activities":
            params["limit"] = query.limit;
            break;

        case "activity-ids":
                params["id"] = query.ids;
            break;

        case "days":
            params["preset"] = query.days;
            break;

        case "date-range":
            params["after"] = query.date1;
//resume here
            if (query.before !== "now") {
                params["before"] = appState.query.before;
            }
    }


    if (Dom.prop("#autozoom", 'checked')) {
        params["az"] = "1";
    } else {
        const zoom = map.getZoom(),
              center = map.getCenter(),
              precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));

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

    const paramsString = Object.entries(params).filter(([k,v]) => !!v).map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
    ).join('&'),

    newURL = `${targetUser.id}?${paramsString}`;

    if (appState.url != newURL) {
        // console.log(`pushing: ${newURL}`);
        appState.url = newURL;
        window.history.replaceState("", "", newURL);
    }
  }


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









