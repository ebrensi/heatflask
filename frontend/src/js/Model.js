/*
 * Model.js --  This module holds all parameters for the front end client,
        beginning with those specified by the current URL in the browser.
 */


import {
    ONLOAD_PARAMS,
    SELF,
    LOGGED_IN,
    SHARE_STATUS_UPDATE_URL,
    FLASH_MESSAGES,
    SHARE_PROFILE,
    USERPIC,
    ADMIN,
    ACTIVITY_LIST_URL
} from "./Constants.js";


/* Define the URL query set and defaults
    For each possible url parameter, we give possible alternative names
     and a default value.

    Example: the 3 most recent activities can be specified by
        ?limit=3, or ?l=3, and if not specified it defaults to 10.
*/
const QUERY_SPEC = {
    date1: [["after", "date1", "a"], null],
    date2: [["before", "date2", "b"], null],
    preset: [["days", "preset", "d"], null],
    limit: [["limit", "l"], 10],
    activity_ids: [["id", "ids"], null],
    map_center: [["center"], [27.53, 1.58]],
    map_zoom: [["zoom", "z"], 3],
    lat: [["lat"], null],
    lng: [["lng"], null],
    autozoom: [["autozoom", "az"], true],
    c1: [["c1"], null],
    c2: [["c2"], null],
    sz: [["sz"], null],
    start_paused: [["paused", "p"], false],
    shadows: [["sh", "shadows"], true]
};

/* set up an initial query with only defaults */
const query = {};
for (const field in QUERY_SPEC) {
    query[field] = QUERY_SPEC[field][1];
}

/* This will be replaced by code using url parameters
query = Object.assign(query, ONLOAD_PARAMS);


/* get the parameters specified in the browser's current url */
// const urlArgs = new URL(window.location.href).searchParams;

const target_user = window.location.pathname.substring(1) || null;

export const appState = {
    /* target_user is the user whose activities we are viewing */
    target_user: target_user,

    /* current user is the user who is currently logged-in */
    current_user: SELF? target_user : null,

    items: new Map(),

    query: query
};



function update(event){
    let  params = {},
         type = Dom.get("#select_type"),
         num = Dom.get("#select_num"),
         ids = Dom.get("#activity_ids");

    if (type == "activities") {
        params["limit"] = num;
    } else if (type == "activity_ids") {
        if (ids) {
          params["id"] = ids;
        }
    } else if (type == "days") {
        params["preset"] = num;
    } else {
        if (appState.after) {
            params["after"] = appState.after;
        }
        if (appState.before && (appState.before != "now")) {
            params["before"] = appState.before;
        }
    }

    if (appState.paused){
        params["paused"] = "1";
    }

    if (Dom.prop("#autozoom", 'checked')) {
        appState.autozoom = true;
        params["autozoom"] = "1";
    } else {
        appState.autozoom = false;
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

    if (appState.currentBaseLayer.name) {
        params["baselayer"] = appState.currentBaseLayer.name;
    }

    const paramsString = Object.keys(params).map(function(param) {
              return encodeURIComponent(param) + '=' +
              encodeURIComponent(params[param]);
          }).join('&'),

          newURL = `${USER_ID}?${paramsString}`;

    if (appState.url != newURL) {
        // console.log(`pushing: ${newURL}`);
        appState.url = newURL;
        window.history.replaceState("", "", newURL);
    }
  }


  /*
   * Selections
   */
  function selectedIDs(){
    return Array.from(appState.items.values())
                .filter(A => A.selected)
                .map(A => A.id );
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

    const popupContent = `
        <b>${A.name}</b><br>
        ${A.type}:&nbsp;${A.tsLoc}<br>
        ${dkm}&nbsp;km&nbsp;(${dmi}&nbsp;mi)&nbsp;in&nbsp;${elapsed}<br>
        ${vkm}&nbsp;(${vmi})<br>
        View&nbsp;in&nbsp;
        <a href='https://www.strava.com/activities/${A.id}' target='_blank'>Strava</a>
        ,&nbsp;
        <a href='${BASE_USER_URL}?id=${A.id}'&nbsp;target='_blank'>Heatflask</a>
    `;

    const popup = L.popup().setLatLng(latlng).setContent(popupContent).openOn(map);
}


/*
// What to do when user changes to a different tab or window
document.onvisibilitychange = function() {
    if (document.hidden) {
        if (!appState.paused)
            dotLayer.pause();
    } else if (!appState.paused && dotLayer) {
        dotLayer.animate();

    }
};

appState.currentBaseLayer = default_baseLayer;
map.on('baselayerchange', function (e) {
    appState.currentBaseLayer = e.layer;
    appState.update();
});

*/

function getBounds(ids) {
    const bounds = latLngBounds();
    for (const id of ids){
        bounds.extend( appState.items.get(id).bounds );
    }
    return bounds
}




