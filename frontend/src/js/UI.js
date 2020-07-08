/*
 *  UI.js -- the front-end user interface for heatflask.
 *  Here we initialize the app model and set up the DOM
 */

// We use min as our "bootstrap" framework
import "../ext/css/min_entireframework.min.css";
import "../css/font-awesome-lite.css";

import { appState } from "./Model.js";

const INITIAL_QUERY = appState.query;

// Populate the browser window with a Leaflet map
import { map, showInfoMessage, showErrMessage, layerControl } from "./MapAPI.js";

import {
    SELF,
    LOGGED_IN,
    SHARE_STATUS_UPDATE_URL,
    FLASH_MESSAGES,
    SHARE_PROFILE,
    USERPIC,
    ADMIN,
    ACTIVITY_LIST_URL,
    BEACON_HANDLER_URL,
    CLIENT_ID
} from "./Constants.js";

const USER_ID = appState.target_user.id;

import WS_SCHEME from "./appUtil.js";

import * as Dom from "./Dom.js";

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
    showErrMessage(msg);
}


// put user profile urls in the DOM
Dom.prop(".strava-profile-link", "href", `https://www.strava.com/athletes/${USER_ID}`);


// put Strava-login button images into the DOM
import strava_login_img from "../images/btn_strava_connectwith_orange.svg";
Dom.prop(".strava-auth", "src", strava_login_img);

// add paypal buttons
import paypalButtonHtml from "../html/paypal-button.html";
Dom.prop(".paypal-form", "innerHTML", paypalButtonHtml);


Dom.prop("#zoom-to-selection", "checked", false);
Dom.hide(".abort-render");
Dom.hide(".progbar");

Dom.prop("#autozoom", 'checked', appState.query["autozoom"]);
Dom.set("#activity_ids", "");

let nTabs;

/*
    Display or hide stuff based on whether current user is logged in
*/
if (LOGGED_IN) {
    /* the current user is authenticated so we enable the profile tab
       and enable those controls
    */
    Dom.prop("#share", "checked", SHARE_PROFILE);
    Dom.show(".logged-in");
    Dom.hide(".logged-out");
    nTabs = 4;

    /* display user profile pic(s) */
    Dom.prop(".avatar", "src", USERPIC);

    // Set a listener to change user's account to public or private
    //   if they change that setting
    Dom.addEvent("#share", "change", async function() {
        let status = Dom.prop("#share", "checked")? "public":"private";
        const resp = await fetch(`${SHARE_STATUS_UPDATE_URL}?status=${status}`),
              text = await resp.text();
        // console.log(`response: ${text}`);
    });

    /* enable activity list button */
    Dom.addEvent(".activity-list", "click", e => {
        window.open(ACTIVITY_LIST_URL, "_blank")
    });

    /* enable log out button */
    Dom.addEvent(".logout", "click", e => {
        const current_user = appState.current_user;
        console.log(`${current_user} logging out`);
        window.open(`${current_user}/logout`);
    });


} else {
    Dom.show(".logged-out");
    Dom.hide(".logged-in");

    /* enable strava authentication (login) button */
    Dom.addEvent(".strava-auth", "click", e => {
        window.location.href = "/authorize";
    });
    nTabs = 3;
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


// set collapsed sidebar height just enough for icons to fit
const root = document.documentElement;
root.style.setProperty("--sidebar-height", 50*nTabs+10+"px");


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
if (INITIAL_QUERY["activity_ids"]) {
    Dom.set("#activity_ids", INITIAL_QUERY["activity_ids"]);
    Dom.set("#select_type", "activity_ids");
} else if (INITIAL_QUERY["limit"]) {
    Dom.set("#num", INITIAL_QUERY["limit"]);
    Dom.set("#select_type", "activities");
} else if (INITIAL_QUERY["preset"]) {
    Dom.set("#num", INITIAL_QUERY["preset"]);
    Dom.set("#select_type", "days");
} else {
    Dom.set('#date1', INITIAL_QUERY["date1"]);
    Dom.set('#date2', INITIAL_QUERY["date2"]);
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

// reformat every time the user makes a change
Dom.addEvent(".preset", "change", formatQueryForm);


// ---------------------------------------------------------

/*
 * instantiate a DotLayer object and add it to the map
 */
import { DotLayer } from "./DotLayer/DotLayer.js";
export const dotLayer = new DotLayer({
    startPaused: INITIAL_QUERY["paused"]
}).addTo(map);


// set initial values from defaults or specified in url
let ds = dotLayer.getDotSettings();

const C1 = INITIAL_QUERY["C1"],
      C2 = INITIAL_QUERY["C2"],
      SZ = INITIAL_QUERY["SZ"];

ds["C1"] = C1;
ds["C2"] = C2;
ds["dotScale"] = SZ;


const SPEED_SCALE = 5.0,
      SEP_SCALE = {m: 0.15, b: 15.0};

// Dom.set("#sepConst", (Math.log2(C1) - SEP_SCALE.b) / SEP_SCALE.m );
// Dom.set("#speedConst", Math.sqrt(C2) / SPEED_SCALE );
// Dom.set("#dotScale", ds["dotScale"]);
// Dom.set("#dotAlpha", ds["dotAlpha"]);


// the following two statements seem to be redundant
Dom.prop("#shadows", "checked", dotLayer.options.dotShadows.enabled);
if (INITIAL_QUERY["shadows"]) {
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


/*
 *  now add dotlayer controls to the DOM
 */

// leaflet-easybutton is used for play/pause button and capture
import "leaflet-easybutton";
import "../../node_modules/leaflet-easybutton/src/easy-button.css";


// animation play-pause button
const button_states = [
    {
        stateName: 'animation-running',
        icon:      'fa-pause',
        title:     'Pause Animation',
        onClick: function(btn, map) {
            // pauseFlow();
            // dotLayer.pause();
            // appState.paused = true;
            // appState.update();
            btn.state('animation-paused');
            }
    },

    {
        stateName: 'animation-paused',
        icon:      'fa-play',
        title:     'Resume Animation',
        onClick: function(btn, map) {
            // appState.paused = false;
            // dotLayer.animate();
            // appState.update();
            btn.state('animation-running');
        }
    }
];

// add play/pause button to the map
const animationControl =  L.easyButton({
    // states: appState.paused? button_states.reverse() : button_states
    states: button_states.reverse()
}).addTo(map);



// knobs for dotlayer control
let dialfg, dialbg;

const rad = deg => deg * Math.PI/180,
      settings = {
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

dialfg = settings["colorFG"];
dialbg = settings["colorBG"];


/* There are several knob components available but most of them
    require jQuery.  Pure-Knob does not.
*/

import pureknob from "pure-knob";

function makeKnob(selector, options) {
    const knob = pureknob.createKnob(options.width, options.height),
          mySettings = Object.assign({}, settings);

    Object.assign(mySettings, options);

    for ( const [property, value] of Object.entries(mySettings) ) {
        knob.setProperty(property, value);
    }

    const node = knob.node();

    Dom.el(selector).appendChild(node);

    return knob
}



function knobListener(knob, val) {
    let period_changed,
        newVal,
        updatePeriod;

    const knobName = knob['_properties']['label'];

    switch (knobName) {
        case "Speed":
            newVal = val * val * SPEED_SCALE;
            dotLayer.updateDotSettings({C2: newVal});
            console.log("C2: "+newVal);
            updatePeriod = true;
        break;

        case "Sparcity":
            newVal = Math.pow(2, val * SEP_SCALE.m + SEP_SCALE.b);
            dotLayer.updateDotSettings({C1: newVal});
            console.log("C1: "+newVal);
            updatePeriod = true;
        break;

        case "Alpha":
            newVal = val / 10;
            dotLayer.updateDotSettings({alphaScale: newVal});
            dotLayer.drawPaths();
            console.log("alpha: "+newVal);
        break;

        case "Size":
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

// Instantiate knob controls and add them to the DOM
makeKnob('#dot-controls1', {
    width: "150",
    height: "150",
    "label": "Speed"
}).addListener(knobListener);

makeKnob('#dot-controls1', {
    width: "150",
    height: "150",
    "label": "Sparcity"
}).addListener(knobListener);

makeKnob('#dot-controls2', {
    width: "100",
    height: "100",
    valMin: 0,
    valMax: 10,
    "label": "Alpha"
}).addListener(knobListener);

makeKnob('#dot-controls2', {
    width: "100",
    height: "100",
    valMin: 0,
    valMax: 10,
    "label": "Size"
}).addListener(knobListener);


/* Update the browser's current URL
    This gets called when certain app parameters change
*/
function updateURL(event){
    const  params = {};

    switch (Dom.get("#select_type")) {
        case "activities":
            params["limit"] = Dom.get("#num");
            break;

        case "activity-ids":
            if (ids) {
                params["id"] = Dom.get("#activity_ids");
            }
            break;

        case "days":
            params["preset"] = Dom.get("#num");
            break;

        case "date-range":
            params["after"] = appState.query.after;

            if (appState.query.before !== "now") {
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

    newURL = `${USER_ID}?${paramsString}`;

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
map.on('moveend', e => {
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


window.addEventListener('beforeunload', function (event) {
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








