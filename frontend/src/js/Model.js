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
    lat: [["lat", "x"], null],
    lng: [["lng", "y"], null],
    autozoom: [["autozoom", "az"], true],
    c1: [["c1"], null],
    c2: [["c2"], null],
    sz: [["sz"], null],
    start_paused: [["paused", "p"], false],
    shadows: [["sh", "shadows"], true],
    baselayer: [["baselayer", "map", "bl"], null]
};

/* set up an initial query with only defaults */
const query = {};
for (const field in QUERY_SPEC) {
    query[field] = QUERY_SPEC[field][1];
}

/* get the parameters specified in the browser's current url */
const urlArgs = new URL(window.location.href).searchParams;
for (const [qk, qv] of urlArgs.entries()) {
    for (const [sk, sv] of Object.entries(QUERY_SPEC)) {
        const pnames = sv[0];
        if (pnames.includes(qk)) {
            query[sk] = qv;
            delete QUERY_SPEC[sk]; // this field is set no need checking it again
            break;
        }
    }
}


if (query.lat && query.lng) {
    query.map_center = [query.lat, query.lng];
}

export const appState = {
    /* target_user is the user whose activities we are viewing */
    target_user: {
        id: window.location.pathname.substring(1) || null
    },

    /* current user is the user who is currently logged-in */
    current_user: SELF? target_user : null,

    items: new Map(),

    paused: query.start_paused,

    query: query
};


console.log("initial appstate: ", appState);


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




function getBounds(ids) {
    const bounds = latLngBounds();
    for (const id of ids){
        bounds.extend( appState.items.get(id).bounds );
    }
    return bounds
}




