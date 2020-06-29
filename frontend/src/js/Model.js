/*
 * appState is our model
 *  We expect map and dotLayer to be in the namespace
 *
 */

// get the parameters specified in the browser's current url
// TODO: get query parameters from the url rather than the backend
const urlArgs = new URL(window.location.href);//.searchParams;
console.log(`url parameters: ${urlArgs}`);

export const appState = {
  paused: ONLOAD_PARAMS.start_paused,
  items: new Map(),
  currentBaseLayer: null,
  msgBox: null,

  update: function(event){
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
        if (this.after) {
            params["after"] = this.after;
        }
        if (this.before && (this.before != "now")) {
            params["before"] = this.before;
        }
    }

    if (this.paused){
        params["paused"] = "1";
    }

    if (Dom.prop("#autozoom", 'checked')) {
        this.autozoom = true;
        params["autozoom"] = "1";
    } else {
        this.autozoom = false;
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

    if (this.currentBaseLayer.name) {
        params["baselayer"] = this.currentBaseLayer.name;
    }

    const paramsString = Object.keys(params).map(function(param) {
              return encodeURIComponent(param) + '=' +
              encodeURIComponent(params[param]);
          }).join('&'),

          newURL = `${USER_ID}?${paramsString}`;

    if (this.url != newURL) {
        // console.log(`pushing: ${newURL}`);
        this.url = newURL;
        window.history.replaceState("", "", newURL);
    }
  },

  updateShareStatus: async function(status) {
    if (OFFLINE) {
        return;
    }

    const resp = await fetch(`${SHARE_STATUS_UPDATE_URL}?status=${status}`),
          text = await resp.text();
    console.log(`response: ${text}`);
  },



  /*
   * Selections
   */
  selectedIDs: function(){
    return Array.from(this.items.values())
                .filter(A => A.selected)
                .map(A => A.id );
  },

  zoomToSelectedPaths: function(){
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
  },

  openSelected: function(){
    let ids = selectedIDs();
    if (ids.length > 0) {
        let url = BASE_USER_URL + "?id=" + ids.join("+");
        if (appState.paused == true){
            url += "&paused=1"
        }
        window.open(url,'_blank');
    }
  },

  deselectAll: function(){
    handle_path_selections(selectedIDs());
  },


};


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


function getBounds(ids) {
    const bounds = latLngBounds();
    for (const id of ids){
        bounds.extend( appState.items.get(id).bounds );
    }
    return bounds
}

