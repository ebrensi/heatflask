import load_google_analytics from "./google-analytics.js";

// import {PersistentWebsocket} from "persistent-websocket"
import * as PersistentWebsocket from "./pws.js";

import * as pikaday from 'pikaday';
import "../../node_modules/pikaday/css/pikaday.css";

import { decode as msgpackDecode} from "@msgpack/msgpack";

import pureknob from "./pureknob.js";

import "../../node_modules/leaflet/dist/leaflet.css";
import {
    map as Lmap,
    popup as Lpopup,
    latLngBounds
} from "leaflet";

// Google-Analytics object
const ga = (OFFLINE || ADMIN || DEVELOPMENT)? noop : load_google_analytics();

import Dom from './Dom.js'

import * as strava from './strava.js';

import appState, * as args from "./appState.js";

import { map, dotLayer } from "./mainComponents.js"

import { default_baseLayer } from "./Baselayers.js";
default_baseLayer.addTo(map);
appState.currentBaseLayer = default_baseLayer;

map.on('baselayerchange', function (e) {
    appState.currentBaseLayer = e.layer;
    updateState();
});

import * as controls from "./Controls.js"
Object.values(controls).forEach( control =>
    if (!control._noadd)
        control.addTo(map)
);

import dotLayer from "./Control.dotLayer.js";
dotLayer.addTo(map);



let msgBox = null;



if (FLASH_MESSAGES.length > 0) {
    let msg = "<ul class=flashes>";
    for (let i=0, len=FLASH_MESSAGES.length; i<len; i++) {
        msg += "<li>" + FLASH_MESSAGES[i] + "</li>";
    }
    msg += "</ul>";
    Lcontrol.window(map, {content:msg, visible:true});
}




async function updateShareStatus(status) {
    if (OFFLINE) return;
    const resp = await fetch(`${SHARE_STATUS_UPDATE_URL}?status=${status}`),
          text = await resp.text();
    console.log(`response: ${text}`);
}






function zoomToSelectedPaths(){
    // Pan-Zoom to fit all selected activities
    let selection_bounds = latLngBounds();
    appState.items.forEach((A, id) => {
        if (A.selected) {
            selection_bounds.extend(A.bounds);
        }
    });
    if (selection_bounds.isValid()) {
        map.fitBounds(selection_bounds);
    }
}

function selectedIDs(){
    return Array.from(appState.items.values())
                .filter(A => A.selected)
                .map(A => A.id );
}

function openSelected(){
    let ids = selectedIDs();
    if (ids.length > 0) {
        let url = BASE_USER_URL + "?id=" + ids.join("+");
        if (appState.paused == true){
            url += "&paused=1"
        }
        window.open(url,'_blank');
    }
}

function deselectAll(){
    handle_path_selections(selectedIDs());
}


function activityDataPopup(id, latlng){
    let A = appState.items.get(id),
        d = A.total_distance,
        elapsed = util.hhmmss(A.elapsed_time),
        v = A.average_speed,
        dkm = +(d / 1000).toFixed(2),
        dmi = +(d / 1609.34).toFixed(2),
        vkm,
        vmi;

    if (A.vtype == "pace"){
        vkm = util.hhmmss(1000 / v).slice(3) + "/km";
        vmi = util.hhmmss(1609.34 / v).slice(3) + "/mi";
    } else {
        vkm = (v * 3600 / 1000).toFixed(2) + "km/hr";
        vmi = (v * 3600 / 1609.34).toFixed(2) + "mi/hr";
    }

    const popup = Lpopup()
                .setLatLng(latlng)
                .setContent(
                    `<b>${A.name}</b><br>${A.type}:&nbsp;${A.tsLoc}<br>`+
                    `${dkm}&nbsp;km&nbsp;(${dmi}&nbsp;mi)&nbsp;in&nbsp;${elapsed}<br>${vkm}&nbsp;(${vmi})<br>` +
                    `View&nbsp;in&nbsp;<a href='https://www.strava.com/activities/${A.id}' target='_blank'>Strava</a>`+
                    `,&nbsp;<a href='${BASE_USER_URL}?id=${A.id}'&nbsp;target='_blank'>Heatflask</a>`
                    )
                .openOn(map);
}


function getBounds(ids) {
    const bounds = latLngBounds();
    for (const id of ids){
        bounds.extend( appState.items.get(id).bounds );
    }
    return bounds
}


function initializedotLayer() {
    let ds = dotLayer.getDotSettings();
    if (ONLOAD_PARAMS.C1)
        ds["C1"] = ONLOAD_PARAMS["C1"];

    if (ONLOAD_PARAMS.C2)
        ds["C2"] = ONLOAD_PARAMS["C2"];

    if (ONLOAD_PARAMS.SZ)
        ds["dotScale"] = ONLOAD_PARAMS["SZ"];

    Dom.set("#sepConst", (Math.log2(ds["C1"]) - SEP_SCALE.b) / SEP_SCALE.m );
    Dom.set("#speedConst", Math.sqrt(ds["C2"]) / SPEED_SCALE );
    Dom.set("#dotScale", ds["dotScale"]);
    Dom.set("#dotAlpha", ds["dotAlpha"]);

    Dom.trigger("#sepConst",   "change");
    Dom.trigger("#speedConst", "change");
    Dom.trigger("#dotScale",   "change");
    Dom.trigger("#dotAlpha",   "change");




    if (ONLOAD_PARAMS.shadows)
        Dom.set("#shadows", "checked");

    Dom.prop("#shadows", "checked", dotLayer.options.dotShadows.enabled);

    Dom.addEvent("#shadows", "change", (e) => {
        dotLayer.updateDotSettings(null, {"enabled": e.target.checked})
    });

    Dom.prop("#showPaths", "checked", dotLayer.options.showPaths);
    Dom.addEvent("#showPaths", "change", function(){
         dotLayer.options.showPaths = Dom.prop("#showPaths", "checked");
         dotLayer._redraw();
    });

    dotLayer.updateDotSettings(ds);
}


/* Rendering */
function updateLayers(msg) {
    if (Dom.prop("#autozoom", "checked")){
        let totalBounds = getBounds(appState.items.keys());

        if (totalBounds.isValid()){
            map.fitBounds(totalBounds);
        }
    }

    const num = appState.items.size;
    Dom.html(".data_message",` ${msg} ${num} activities rendered.`);

    // (re-)render the activities table
    // atable.clear();
    // atable.rows.add(Array.from(appState.items.values()));
    // atable.columns.adjust().draw()

    const table = makeTable(appState.items);

    if (!ADMIN && !OFFLINE) {
        // Record this to google analytics
        try{
            ga('send', 'event', {
                eventCategory: USER_ID,
                eventAction: 'Render',
                eventValue: num
            });
        }
        catch(err){}
    }

    dotLayer.reset();
    const ds = dotLayer.getDotSettings(),
          T = dotLayer.periodInSecs().toFixed(2);
    Dom.html("#period-value", T)
    Dom.trigger("#period-value", "change");

    updateState();
}


let sock;

window.addEventListener('beforeunload', function (event) {
    if (navigator.sendBeacon) {
        if (appState.wskey) {
            navigator.sendBeacon(BEACON_HANDLER_URL, appState.wskey);
        }
        navigator.sendBeacon(BEACON_HANDLER_URL, CLIENT_ID);
    }
    if (sock && sock.readyState == 1) {
        sock.send(JSON.stringify({close: 1}));
        sock.close()
    }
});

function renderLayers(query={}) {
    const date1 = Dom.get("#date1"),
          date2 = Dom.get("#date2"),
          type = Dom.get("#select_type"),
          num = Dom.get("#select_num"),
          idString = Dom.get("#activity_ids"),
          to_exclude = Array.from(appState.items.keys()).map(Number);

    // create a status box
    msgBox = Lcontrol.window(map, {
            position: 'top',
            content:"<div class='data_message'></div><div><progress class='progbar' id='box'></progress></div>",
            visible:true
    });

    Dom.html(".data_message", "Retrieving activity data...");


    let rendering = true,
        listening = true,
        numActivities = 0,
        count = 0;

    if (!sock || sock.readyState > 1) {
        sock = new PersistentWebSocket(WEBSOCKET_URL);
        sock.binaryType = 'arraybuffer';
    } else
        sendQuery();

    Dom.html(".data_message", "Retrieving activity data...");

    if (!appState.abortButtonListener)
        appState.abortButtonListener = Dom.addEvent('#abortButton', "click", function() {
            stopListening();
            doneRendering("<font color='red'>Aborted:</font>");
        });

    Dom.fadeIn('#abortButton');
    Dom.fadeIn(".progbar");

    Dom.prop('#renderButton', 'disabled', true);

    function doneRendering(msg) {

        if (!rendering)
            return;

        appState['after'] = Dom.get("#date1");
        appState["before"] = Dom.get("#date2");
        updateState();

        Dom.fadeOut("#abortButton");
        Dom.fadeOut(".progbar");

        if (msgBox) {
            msgBox.close();
            msgBox = undefined;
        }

        rendering = false;
        updateLayers(msg);

    }

    function stopListening() {
        if (!listening)
            return
        listening = false;
        sock.send(JSON.stringify({close: 1}));
        sock.close();
        if (navigator.sendBeacon && appState.wskey) {
            navigator.sendBeacon(BEACON_HANDLER_URL, appState.wskey);
        }
        appState.wskey = null;
        Dom.prop('#renderButton', 'disabled', false);

    }


    function sendQuery() {
        const queryObj = {
            client_id: CLIENT_ID
        };

        queryObj[USER_ID] = {
                limit: (type == "activities")? Math.max(1, +num) : undefined,
                after: date1? date1 : undefined,
                before: (date2 && date2 != "now")? date2 : undefined,
                activity_ids: idString?
                    Array.from(new Set(idString.split(/\D/).map(Number))) : undefined,
                exclude_ids: to_exclude.length?  to_exclude: undefined,
                streams: true
        };

        let msg = JSON.stringify({query: queryObj});
        sock.send(msg);
    }

    sock.onopen = function(event) {
        // console.log("socket open: ", event);
        if (rendering) sendQuery();
    }

    sock.onclose = function(event) {
        // console.log(`socket ${appState.wskey} closed:`, event);
    }

    // handle one incoming chunk from websocket stream
    sock.onmessage = function(event) {

        let A;

        try {
            A = msgpackDecode(new Uint8Array(event.data));
        }
        catch(e) {
            console.log(event);
            console.log(event.data);
            console.log(e);
            return;
        }

        if (!A) {
            Dom.prop('#renderButton', 'disabled', false);
            doneRendering("Finished.");
            return;
        } else

        if (!("_id" in A)) {

            if ("idx" in A)
                Dom.html(".data_message", `indexing...${A.idx}`);

            else if ("count" in A)
                numActivities += A.count;

            else if ("wskey" in A)
                appState.wskey = A.wskey;

            else if ("delete" in A && A.delete.length) {
                // delete all ids in A.delete
                for (let id of A.delete)
                    appState.items.delete(id);
                dotLayer.removeItems(A.delete);

            } else if ("done" in A) {
                console.log("received done");
                doneRendering("Done rendering.");
                return;

            } else if ("error" in A) {
                let msg = `<font color='red'>${A.error}</font><br>`;
                Dom.html(".data_message", msg);
                console.log(`Error: ${A.error}`);
                return;
            } else if ("msg" in A) {
                Dom.html(".data_message", A.msg);
            }

            return;
        }

        // only add A to appState.items if it isn't already there
        if ( !appState.items.has(A._id) ) {
            if (!A.type)
                return;

            // assign this activity a path color and speed type (pace, mph)
            Object.assign( A, strava.ATYPE.specs(A) );
            A.id = A._id;
            delete A._id;

            const tup = A.ts;
            delete A.ts;

            A.tsLoc = new Date((tup[0] + tup[1]*3600) * 1000);
            A.UTCtimestamp = tup[0];

            A.bounds = latLngBounds(A.bounds.SW, A.bounds.NE);

            dotLayer.addItem(A.id, A.polyline, A.pathColor, A.time, tup[0], A.bounds, A.n);
            appState.items.set(A.id, A);

            delete A.n;
            delete A.ttl;
            delete A.polyline;
            delete A.time;
        }

        count++;
        if (count % 5 === 0) {
            if (numActivities) {
                Dom.set(".progbar", count/numActivities);
                Dom.html(".data_message", `imported ${count}/${numActivities}`);
            } else {
                Dom.html(".data_message", `imported ${count}/?`);
            }
        }

    }
}

function openActivityListPage() {
    window.open(ACTIVITY_LIST_URL, "_blank")
}

function updateState(event){
    let  params = {},
         type = Dom.get("#select_type"),
         num = Dom.get("#select_num"),
         ids = Dom.get("#activity_ids");

    if (type == "activities") {
        params["limit"] = num;
    } else if (type == "activity_ids") {
        if (ids) params["id"] = ids;
    } else if (type == "days") {
        params["preset"] = num;
    } else {
        if (appState["after"]) {
            params["after"] = appState.after;
        }
        if (appState["before"] && (appState["before"] != "now")) {
            params["before"] = appState["before"];
        }
    }

    if (appState["paused"]){
        params["paused"] = "1";
    }

    if (Dom.prop("#autozoom", 'checked')) {
        appState["autozoom"] = true;
        params["autozoom"] = "1";
    } else {
        appState["autozoom"] = false;
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

        // Enable capture if period is less than CAPTURE_DURATION_MAX
        const cycleDuration = dotLayer.periodInSecs().toFixed(2),
              captureEnabled = controls.captureControl.enabled;

        Dom.html("#period-value", cycleDuration);

        if (cycleDuration <= CAPTURE_DURATION_MAX) {
            if (!captureEnabled) {
                controls.captureControl.addTo(map);
                controls.captureControl.enabled = true;
            }
        } else if (captureEnabled) {
            controls.captureControl.removeFrom(map);
            controls.captureControl.enabled = false;
        }
    }

    if (appState.currentBaseLayer.name)
        params["baselayer"] = appState.currentBaseLayer.name;

    const paramsString = Object.keys(params).map(function(param) {
              return encodeURIComponent(param) + '=' +
              encodeURIComponent(params[param])
          }).join('&'),

          newURL = `${USER_ID}?${paramsString}`;

    if (appState.url != newURL) {
        // console.log(`pushing: ${newURL}`);
        appState.url = newURL;
        window.history.replaceState("", "", newURL);
    }
}


function preset_sync() {
    const num = Dom.get("#select_num"),
          type = Dom.get("#select_type");

    if (type=="days"){
        Dom.hide(".date_select");
        Dom.hide("#id_select");
        Dom.show("#num_select");
        Dom.set('#date2', "now");
        date2picker.gotoToday();
        date2picker.setEndRange(new Date());

        let d = new Date();
        d.setDate(d.getDate()-num);
        Dom.set('#date1', d.toISOString().split('T')[0] );
        date1picker.gotoDate(d);
        date1picker.setStartRange(d)

    } else if (type=="activities") {
        Dom.hide(".date_select");
        Dom.hide("#id_select");
        Dom.show("#num_select");
        Dom.set('#date1', "");
        Dom.set('#date2', "now");
        date2picker.gotoToday();
    }
    else if (type=="activity_ids") {
        Dom.hide(".date_select");
        Dom.hide("#num_select");
        Dom.show("#id_select");
    } else {
        Dom.show(".date_select");
        Dom.set("#select_num", "");
        Dom.hide("#num_select");
        Dom.hide("#id_select");
    }

}


// What to do when user changes to a different tab or window
document.onvisibilitychange = function() {
    if (document.hidden) {
        if (!appState.paused)
            dotLayer.pause();
    } else if (!appState.paused && dotLayer) {
        dotLayer.animate();

    }
};

// activities table set-up
Dom.prop("#zoom-to-selection", "checked", false);

Dom.addEvent("#zoom-to-selection", "change", function(){
    if ( Dom.prop("#zoom-to-selection", 'checked') ) {
        zoomToSelectedPaths();
    }
});

Dom.addEvent("#render-selection-button", "click", openSelected);
Dom.addEvent("#clear-selection-button", "click", deselectAll);

Dom.addEvent("#select_num", "keypress", function(event) {
    if (event.which == 13) {
        event.preventDefault();
        renderLayers();
    }
});

Dom.show("#abortButton", false);

Dom.hide(".progbar");

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
    return picker
}

const date1picker = makeDatePicker('#date1'),
      date2picker = makeDatePicker('#date2');

map.on('moveend', updateState);

Dom.prop("#autozoom", "change", updateState);

Dom.prop("#share", "checked", SHARE_PROFILE);
Dom.addEvent("#share", "change", function() {
    let status = Dom.prop("#share", "checked")? "public":"private";
    updateShareStatus(status);
});



Dom.addEvent(".preset", "change", preset_sync);

Dom.addEvent("#renderButton", "click", renderLayers);

Dom.addEvent("#activity-list-buton", "click", () => openActivityListPage(false));

Dom.prop("#autozoom", 'checked', ONLOAD_PARAMS.autozoom);

Dom.set("#activity_ids", "");

if (ONLOAD_PARAMS.activity_ids) {
    Dom.set("#activity_ids", ONLOAD_PARAMS.activity_ids);
    Dom.set("#select_type", "activity_ids");
} else if (ONLOAD_PARAMS.limit) {
    Dom.set("#select_num", ONLOAD_PARAMS.limit);
    Dom.set("#select_type", "activities");
} else if (ONLOAD_PARAMS.preset) {
    Dom.set("#select_num", ONLOAD_PARAMS.preset);
    Dom.set("#select_type", "days");
    preset_sync();
} else {
    Dom.set('#date1', ONLOAD_PARAMS.date1);
    Dom.set('#date2', ONLOAD_PARAMS.date2);
    Dom.set('#preset', "");
}

initializedotLayer();
renderLayers();
preset_sync();

