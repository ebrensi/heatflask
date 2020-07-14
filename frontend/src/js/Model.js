/*
 * Model.js -- This module defines the parameters of the Heatflask client,
 *    beginning with those specified by the current URL in the browser.
 */

import { CURRENT_USER } from "./Init.js";

/* For each visual parameter, we accept different possible names */
const paramNames = {
    date1: ["start", "after", "date1", "a"],
    date2: ["end", "before", "date2", "b"],
    days:  ["days", "preset", "d"],
    limit: ["limit", "l"],
    ids:   ["id", "ids"],
    zoom:  ["zoom", "z"],
    lat:   ["lat", "x"],
    lng:   ["lng", "y"],
    autozoom: ["autozoom", "az"],
    c1:    ["c1"],
    c2:    ["c2"],
    sz:    ["sz"],
    paused:    ["paused", "pu"],
    shadows:   ["sh", "shadows"],
    paths:     ["pa", "paths"],
    alpha:     ["alpha"],
    baselayer: ["baselayer", "map", "bl"]
};

/* TODO: add a geohash location parameter.
        maybe replace lat and lng altogether with geohash */

/* Default visual parameters. The default if there are no arguments
  is the last 10 activities */
const params = {
    queryType: 'activities',
    date1: null,
    date2: null,
    days: null,
    limit: 10,
    ids: "",
    zoom: 3,
    lat: 27.53,
    lng: 1.58,
    autozoom: true,
    c1: null,
    c2: null,
    sz: null,
    paused: false,
    shadows: true,
    paths: true,
    alpha: 1,
    baselayer: null
};


/* The current url is {domain}{/{userid}}?{urlArgs}.
    modelKey indicates whether this is simple (single target user) view,
    or a complex (multi-user) view

    If userid is empty string:
        * urlArgs["key"] is a lookup for a complex (multi-user) data-query
        * the rest of urlArgs is visual parameters
         (dots, map, speed, duration, dot-size, etc)

    If userid is a non-empty string:
        * userid is the identifier (id or username) of a single target user
        * urlArgs contains both visual and data-query parameters.
*/
const userid = window.location.pathname.substring(1);
const urlArgs = new URL(window.location.href).searchParams;

/* parse visual parameters from the url */
for (const [uKey, value] of urlArgs.entries()) {
    for (const [pKey, pNames] of Object.entries(paramNames)) {
        if (pNames.includes(uKey)) {
            params[pKey] = value;
            delete paramNames[pKey]; // this field is set no need to check it again
            break;
        }
    }
}

let query;

if (userid) {
    query = {
        userid:  userid,
        date1: params.date1,
        date2: params.date2,
        days:  params.days,
        limit: params.limit,
        ids:   params.ids
    };
} else {
    query = {
        key: urlArgs["key"]
    }
}


const appState = {

    /* each item of items will be an activity */
    items: new Map(),

    /* current user is the user who is currently logged-in, if any */
    currentUser: CURRENT_USER,

    vparams: {
        center:    [params.lat, params.lng],
        zoom:      params.zoom,
        autozoom:  params.autozoom,
        c1:        params.c1,
        c2:        params.c2,
        sz:        params.sz,
        paused:    params.paused,
        shadows:   params.shadows,
        paths:     params.paths,
        alpha:     params.alpha,
        baselayer: params.baselayer
    },

    query: query
};


window["heatflask"] = appState;


export { appState as default }

 /*
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



*/
