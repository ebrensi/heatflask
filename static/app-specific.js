/* fps display control for leaflet*/
/* Efrem Rensi 2017/2/19 */

L.Control.fps = L.Control.extend({
    lastCalledTime: 1,

    options: {
        position: "topright"
    },

    onAdd: function (map) {
        // Control container
        this._container = L.DomUtil.create('div', 'leaflet-control-fps');
        L.DomEvent.disableClickPropagation(this._container);
        this._container.style.backgroundColor = 'white';
        this.update(0);
        return this._container;
    },

    update: function (now = Date.now(), msg = "") {
        let fps = ~~(1000 / (now - this.lastCalledTime) + 0.5);
        this._container.innerHTML = `${fps} f/s, ${msg}`;
        this.lastCalledTime = now;
        return fps;
    }
});

//constructor registration
L.control.fps = function (options) {
    return new L.Control.fps();
};


function hhmmss(secs) {
    return new Date(secs * 1000).toISOString().substr(11, 8);
}

function img(url, w = 20, h = 20, alt = "") {
    return `<img src=${url} width=${w}px height=${h}px class="img-fluid" alt="${alt}">`;
}

// return an HTML href tag from a url and text
function href(url, text) {
    return `<a href='${url}' target='_blank'>${text}</a>`;
}

function ip_lookup_url(ip) {
    return ip ? "http://freegeoip.net/json/" + ip : "#";
}

// Strava specific stuff
function stravaActivityURL(id) {
    return "https://www.strava.com/activities/" + id;
}

function stravaAthleteURL(id) {
    return "https://www.strava.com/athletes/" + id;
}
// ----------------------


// For DataTables
function formatDate(data, type, row, meta) {
    date = new Date(data);
    return type === "display" || type === "filter" ? date.toLocaleString("en-US", { hour12: false }) : date;
}

function formatIP(data, type, row, meta) {
    if (data) {
        let ip = data;
        return type === "display" ? href(ip_lookup_url(ip), ip) : ip;
    } else {
        return "";
    }
}

function formatUserId(data, type, row) {
    if (data) {
        if (type == "display") {
            return href("/" + data, img(row.profile, w = 40, h = 40, alt = data));
        } else {
            return data;
        }
    } else {
        return "";
    }
}
// ------------------------


// Fetching stuff using "ajax"
function httpGetAsync(theUrl, callback) {
    let xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function () {
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200) callback(xmlHttp.responseText);
    };
    xmlHttp.open("GET", theUrl, true); // true for asynchronous
    xmlHttp.send(null);
}

// decode a (possibly RLE-encoded) array of successive differences into
//  an array of the original values
//  This will decode both [1, 2,2,2,2,2,2, 5] and [1, [2,6], 5] into
//    [0, 1, 3, 5, 7, 9, 11, 13, 18]
function streamDecode(rle_list, first_value = 0) {
    let running_sum = first_value,
        outArray = [first_value],
        len = rle_list.length;
    for (let i = 0; i < len; i++) {
        el = rle_list[i];
        if (el instanceof Array) {
            for (let j = 0; j < el[1]; j++) {
                running_sum += el[0];
                outArray.push(running_sum);
            }
        } else {
            running_sum += el;
            outArray.push(running_sum);
        }
    }
    return outArray;
}


const SPEED_SCALE = 5.0,
      SEP_SCALE = { m: 0.14, b: 15.0 };

// Set up Map and base layers
var map_providers = ONLOAD_PARAMS.map_providers,
    baseLayers = { "None": L.tileLayer("") },
    default_baseLayer = baseLayers["None"],
    HeatLayer = false,
    FlowLayer = false,
    DotLayer = false,
    appState = {
    baseLayers: map_providers,
    paused: ONLOAD_PARAMS.start_paused,
    items: {}
};

if (!OFFLINE) {
    var online_baseLayers = {
        "Esri.WorldImagery": L.tileLayer.provider("Esri.WorldImagery"),
        "OpenStreetMap.Mapnik": L.tileLayer.provider("OpenStreetMap.Mapnik"),
        "Google.Roadmap": L.gridLayer.googleMutant({ type: 'roadmap' }),
        "Google.Terrain": L.gridLayer.googleMutant({ type: 'terrain' }),
        "Google.Hybrid": L.gridLayer.googleMutant({ type: 'hybrid' })
    };

    Object.assign(baseLayers, online_baseLayers);
    if (map_providers.length) {
        for (var i = 0; i < map_providers.length; i++) {
            provider = map_providers[i];
            var tl = L.tileLayer.provider(provider);
            baseLayers[provider] = tl;
            if (i == 0) default_baseLayer = tl;
        }
    } else {
        default_baseLayer = baseLayers["Google.Terrain"];
    }
}

var map = L.map('map', {
    center: ONLOAD_PARAMS.map_center,
    zoom: ONLOAD_PARAMS.map_zoom,
    layers: [default_baseLayer],
    renderer: L.svg({ padding: 0 }),
    zoomAnimation: false
});

var sidebarControl = L.control.sidebar('sidebar').addTo(map),
    zoomControl = map.zoomControl.setPosition('bottomright'),
    layerControl = L.control.layers(baseLayers, null, { position: 'topleft' }).addTo(map),

// locateControl = L.control.locate({position: "bottomright", icon: "fa fa-anchor"}).addTo(map),
fps_display = null;

if (ADMIN) {
    fps_display = L.control.fps().addTo(map);
}

var button_states = [{
    stateName: 'animation-running',
    icon: 'fa-pause',
    title: 'Pause Animation',
    onClick: function (btn, map) {
        pauseFlow();
        updateState();
        btn.state('animation-paused');
    }
}, {
    stateName: 'animation-paused',
    icon: 'fa-play',
    title: 'Resume Animation',
    onClick: function (btn, map) {
        resumeFlow();
        if (DotLayer) {
            DotLayer.animate();
        }
        updateState();
        btn.state('animation-running');
    }
}],
    animationControl = L.easyButton({
    states: appState.paused ? button_states.reverse() : button_states
}).addTo(map);

// set up dial-controls
$(".dial").knob({
    min: 0,
    max: 100,
    step: 0.1,
    width: "150",
    height: "150",
    cursor: 20,
    inline: true,
    // displayInput: false,
    change: function (val) {
        if (DotLayer) {
            var newVal;
            if (this.$[0].id == "sepConst") {
                newVal = Math.pow(2, val * SEP_SCALE.m + SEP_SCALE.b);
                DotLayer.C1 = newVal;
                // console.log(`C1=${newVal}`)
            } else {
                newVal = val * val * SPEED_SCALE;
                DotLayer.C2 = newVal;
                // console.log(`C2=${newVal}`)
            }
        }
    }
});

if (FLASH_MESSAGES.length > 0) {
    var msg = "<ul class=flashes>";
    for (let i = 0, len = FLASH_MESSAGES.length; i < len; i++) {
        msg += "<li>" + FLASH_MESSAGES[i] + "</li>";
    }
    msg += "</ul>";
    L.control.window(map, { content: msg, visible: true });
}

var atable = $('#activitiesList').DataTable({
    paging: false,
    scrollY: "60vh",
    scrollX: true,
    scrollCollapse: true,
    order: [[0, "desc"]],
    select: true,
    data: Object.values(appState.items),
    idSrc: "id",
    columns: [{ title: "Date", data: null, render: A => href(stravaActivityURL(A.id), A.beginTimestamp.slice(0, 10)) }, { title: "Type", data: "type" }, { title: `Dist (${DIST_LABEL})`, data: "total_distance", render: data => +(data / DIST_UNIT).toFixed(2) }, { title: "Time", data: "elapsed_time", render: hhmmss }, { title: "Name", data: "name" }]
}).on('select', handle_table_selections).on('deselect', handle_table_selections);

function updateShareStatus(status) {
    console.log("updating share status.");
    url = `${SHARE_STATUS_UPDATE_URL}?status=${status}`;
    httpGetAsync(url, function (responseText) {
        console.log(`response: ${responseText}`);
    });
}

function handle_table_selections(e, dt, type, indexes) {
    if (type === 'row') {
        var selectedItems = atable.rows({ selected: true }).data(),
            unselectedItems = atable.rows({ selected: false }).data();

        for (var i = 0; i < selectedItems.length; i++) {
            if (!selectedItems[i].selected) {
                togglePathSelect(selectedItems[i].id);
            }
        }

        for (var i = 0; i < unselectedItems.length; i++) {
            if (unselectedItems[i].selected) {
                togglePathSelect(unselectedItems[i].id);
            }
        }

        let c = map.getCenter(),
            z = map.getZoom();

        if ($("#zoom-table-selection").is(':checked')) {
            zoomToSelected();
        }

        // If map didn't move then force a redraw
        let c2 = map.getCenter();
        if (DotLayer && c.x == c2.x && c.y == c2.y && z == map.getZoom()) {
            DotLayer._onLayerDidMove();
        }
    }
}

function zoomToSelected() {
    // Pan-Zoom to fit all selected activities
    var selection_bounds = L.latLngBounds();
    $.each(appState.items, (id, a) => {
        if (a.selected) {
            selection_bounds.extend(a.bounds);
        }
    });
    if (selection_bounds.isValid()) {
        map.fitBounds(selection_bounds);
    }
}

function selectedIDs() {
    return Object.values(appState.items).filter(a => {
        return a.selected;
    }).map(function (a) {
        return a.id;
    });
}

function openSelected() {
    ids = selectedIDs();
    if (ids.length > 0) {
        var url = BASE_USER_URL + "?id=" + ids.join("+");
        if (appState.paused == true) {
            url += "&paused=1";
        }
        window.open(url, '_blank');
    }
}

function pauseFlow() {
    DotLayer.pause();
    appState.paused = true;
}

function resumeFlow() {
    appState.paused = false;
    if (DotLayer) {
        DotLayer.animate();
    }
}

function highlightPath(id) {
    var A = appState.items[id];
    if (A.selected) return false;

    A.highlighted = true;

    var row = $("#" + id),
        scroller = $('.dataTables_scrollBody'),
        flow = A.flowLayer;

    // highlight table row and scroll to it if necessary
    row.addClass('selected');
    scroller.scrollTop(row.prop('offsetTop') - scroller.height() / 2);

    return A;
}

function unhighlightPath(id) {

    var A = appState.items[id];
    if (A.selected) return false;

    A.highlighted = false;

    // un-highlight table row
    $("#" + id).removeClass('selected');

    return A;
}

function togglePathSelect(id) {
    var A = appState.items[id];
    if (A.selected) {
        A.selected = false;
        unhighlightPath(id);
    } else {
        highlightPath(id);
        A.selected = true;
    }
}

function activityDataPopup(id, latlng) {
    var A = appState.items[id],
        d = parseFloat(A.total_distance),
        elapsed = hhmmss(parseFloat(A.elapsed_time)),
        v = parseFloat(A.average_speed);
    var dkm = +(d / 1000).toFixed(2),
        dmi = +(d / 1609.34).toFixed(2),
        vkm,
        vmi;

    if (A.vtype == "pace") {
        vkm = hhmmss(1000 / v).slice(3) + "/km";
        vmi = hhmmss(1609.34 / v).slice(3) + "/mi";
    } else {
        vkm = (v * 3600 / 1000).toFixed(2) + "km/hr";
        vmi = (v * 3600 / 1609.34).toFixed(2) + "mi/hr";
    }

    var popup = L.popup().setLatLng(latlng).setContent(`${A.name}<br>${A.type}: ${A.beginTimestamp}<br>` + `${dkm} km (${dmi} mi) in ${elapsed}<br>${vkm} (${vmi})<br>` + `View in <a href='https://www.strava.com/activities/${A.id}' target='_blank'>Strava</a>` + `, <a href='${BASE_USER_URL}?id=${A.id}&flowres=high' target='_blank'>Heatflask</a>`).openOn(map);
}

/* Rendering */
function renderLayers() {
    const flowres = $("#flowres").val(),
          heatres = $("#heatres").val(),
          date1 = $("#date1").val(),
          date2 = $("#date2").val(),
          type = $("#select_type").val(),
          num = $("#select_num").val(),
          lores = flowres == "low" || heatres == "low",
          hires = flowres == "high" || heatres == "high";
    dotFlow = true;

    var query = {};

    if (type == "activity_ids") {
        query.id = $("#activity_ids").val();
    } else if (type == "activities") {
        if (num == 0) {
            query.limit = 1;
        } else {
            query.limit = num;
        }
    } else {
        if (date1) {
            query.date1 = date1;
        }
        if (date2 && date2 != "now") {
            query.date2 = date2;
        }
    }

    if (hires) {
        query.hires = hires;
    }

    // Remove HeatLayer from map and control if it's there
    if (HeatLayer) {
        map.removeLayer(HeatLayer);
        layerControl.removeLayer(HeatLayer);
        HeatLayer = false;
    }

    if (DotLayer) {
        map.removeLayer(DotLayer);
        layerControl.removeLayer(DotLayer);
        DotLayer = false;
    }

    // Add new blank HeatLayer to map if specified
    var latlngs_flat = [];
    if (heatres) {
        HeatLayer = L.heatLayer(latlngs_flat, HEATLAYER_DEFAULT_OPTIONS);
        map.addLayer(HeatLayer);
        layerControl.addOverlay(HeatLayer, "Point Density");
    }

    // locateControl.stop();
    // appState.items = {};

    // We will load in new items that aren't already in appState.items,
    //  and delete whatever is left.
    var toDelete = new Set(Object.keys(appState.items));

    atable.clear();

    var msgBox = L.control.window(map, { position: 'top',
        content: "<div class='data_message'></div><div><progress class='progbar' id='box'></progress></div>",
        visible: true
    }),
        progress_bars = $('.progbar'),
        rendering = true,
        listening = true,
        bounds = L.latLngBounds(),
        source = new EventSource(BASE_DATAURL + "?" + jQuery.param(query, true));

    $(".data_message").html("Rendering activities...");
    $("#abortButton").show();
    $(".progbar").show();
    $('#renderButton').prop('disabled', true);

    function doneRendering(msg) {
        if (rendering) {
            $("#abortButton").hide();
            $(".progbar").hide();
            try {
                msgBox.close();
            } catch (err) {
                console.log(err.message);
            }
            if ($("#autozoom:checked").val() && bounds.isValid()) map.fitBounds(bounds);
            var msg2 = msg + " " + Object.keys(appState.items).length + " activities rendered.";
            $(".data_message").html(msg2);
            rendering = false;
            if (dotFlow) {
                DotLayer = new L.DotLayer(appState.items, { startPaused: appState.paused });
                map.addLayer(DotLayer);
                layerControl.addOverlay(DotLayer, "Dots");

                $("#sepConst").val((Math.log2(DotLayer.C1) - SEP_SCALE.b) / SEP_SCALE.m).trigger("change");
                $("#speedConst").val(Math.sqrt(DotLayer.C2) / SPEED_SCALE).trigger("change");
                $("#showPaths").prop("checked", DotLayer.options.showPaths).on("change", function () {
                    DotLayer.options.showPaths = $(this).prop("checked");
                    DotLayer._onLayerDidMove();
                });

                // delete all members of toDelete from appState.items
                for (let item of toDelete) {
                    delete appState.items[item];
                }

                // render the activities table
                atable.rows.add(Object.values(appState.items)).draw(false);
            }
        }
    }

    function stopListening() {
        if (listening) {
            listening = false;
            source.close();
            $('#renderButton').prop('disabled', false);
        }
    }

    source.onmessage = function (event) {
        if (event.data == 'done') {
            doneRendering("Finished. ");
            stopListening();
            appState['date1'] = date1;
            appState["date2"] = date2;
            appState["flowres"] = flowres;
            appState["heatres"] = heatres;

            if ("limit" in query) appState["limit"] = query.limit;
            updateState();
        } else {
            var A = JSON.parse(event.data),
                heatpoints = false,
                flowpoints = false;
            A.selected = false;
            A.bounds = L.latLngBounds();

            if ("error" in A) {
                var msg = "<font color='red'>" + A.error + "</font><br>";
                $(".data_message").html(A.msg);
                console.log(`Error activity ${A.id}: ${A.error}`);
                return;
            } else if ("stop_rendering" in A) {
                doneRendering("Done rendering.");
            } else if ("msg" in A) {
                $(".data_message").html(A.msg);
                if ("value" in A) {
                    progress_bars.val(A.value);
                }
                return;
            } else {
                let alreadyIn = toDelete.delete(A.id.toString());

                // if A is already in appState.items then we can stop now
                if (!heatres && alreadyIn) {
                    return;
                }
            }

            if (lores && "summary_polyline" in A && A.summary_polyline) {
                let latlngs = L.PolylineUtil.decode(A.summary_polyline);
                if (heatres == "low") heatpoints = latlngs;
                // if (flowres == "low") flowpoints = latlngs;
            }

            if (query.hires && "polyline" in A && A.polyline) {
                let latLngArray = L.PolylineUtil.decode(A.polyline);

                if (heatres == "high") heatpoints = latLngArray;

                if (flowres == "high" && "time" in A) {
                    let len = latLngArray.length,
                        time = streamDecode(A.time),
                        latLngTime = new Float32Array(3 * len);

                    for (let i = 0, ll; i < len; i++) {
                        ll = latLngArray[i];

                        A.bounds.extend(ll);
                        idx = i * 3;
                        latLngTime[idx] = ll[0];
                        latLngTime[idx + 1] = ll[1];
                        latLngTime[idx + 2] = time[i];
                    }

                    A.latLngTime = latLngTime;
                    flowpoints = latLngTime;
                }
            }

            if (heatpoints) {
                latlngs_flat.push.apply(latlngs_flat, heatpoints);
            }

            if (heatpoints || flowpoints) {
                bounds.extend(A.bounds);
                delete A.summary_polyline;
                delete A.polyline;
                delete A.time;

                // only add A to appState.items if it isn't already there
                if (!(A.id in appState.items)) {
                    appState.items[A.id] = A;
                }
            }
        }
    };
}

function updateState() {
    var params = {},
        type = $("#select_type").val(),
        num = $("#select_num").val();

    if (type == "activities") {
        params.limit = num;
    } else if (type == "activity_ids") {
        params.id = $("#activity_ids").val();
    } else if (type == "days") {
        params.preset = num;
    } else {
        if (appState.date1) {
            params.date1 = appState.date1;
        }
        if (appState.date2 && appState.date2 != "now") {
            params.date2 = appState.date2;
        }
    }

    if (appState.paused) {
        params.paused = "1";
    }

    if ($("#info").is(':checked')) {
        appState.info = true;
        params.info = "1";
    }

    if ($("#autozoom").is(':checked')) {
        appState.autozoom = true;
        params.autozoom = "1";
    } else {
        appState.autozoom = false;
        var zoom = map.getZoom(),
            center = map.getCenter(),
            precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));
        params.lat = center.lat.toFixed(precision);
        params.lng = center.lng.toFixed(precision);
        params.zoom = zoom;
    }

    if ($("#heatres").val()) {
        params.heatres = $("#heatres").val();
    }

    if ($("#flowres").val()) {
        params.flowres = $("#flowres").val();
    }

    params["baselayer"] = appState.baseLayers;

    var newURL = USER_ID + "?" + jQuery.param(params, true);
    window.history.pushState("", "", newURL);

    $(".current-url").val(newURL);
}

function preset_sync() {
    var F = "YYYY-MM-DD",
        num = $("#select_num").val(),
        type = $("#select_type").val();

    $('#query_type').text(type);
    if (type == "days") {
        $(".date_select").hide();
        $("#id_select").hide();
        $("#num_select").show();
        $('#date1').val(moment().subtract(num, 'days').format(F));
        $('#date2').val("now");
    } else if (type == "activities") {
        $(".date_select").hide();
        $("#id_select").hide();
        $("#num_select").show();
        $('#date1').val("");
        $('#date2').val("now");
    } else if (type == "activity_ids") {
        $(".date_select").hide();
        $("#num_select").hide();
        $("#id_select").show();
    } else {
        $(".date_select").show();
        $("#select_num").val("");
        $("#num_select").hide();
        $("#id_select").hide();
    }
}

$(document).ready(function () {
    $("#select_num").keypress(function (event) {
        if (event.which == 13) {
            event.preventDefault();
            renderLayers();
        }
    });

    $("#abortButton").hide();
    $('#abortButton').click(function () {
        stopListening();
        doneRendering("<font color='red'>Aborted:</font>");
    });

    $(".progbar").hide();
    $(".datepick").datepicker({ dateFormat: 'yy-mm-dd',
        changeMonth: true,
        changeYear: true
    });

    map.on('moveend', function (e) {
        if (!appState.autozoom) {
            updateState();
        }
    });

    $("#autozoom").on("change", updateState);
    $("#info").on("change", updateState);

    $("#share").prop("checked", SHARE_PROFILE);
    $("#share").on("change", function () {
        var status = $("#share").is(":checked") ? "public" : "private";
        updateShareStatus(status);
    });

    $("#zoom-table-selection").prop("checked", true);
    $("#zoom-table-selection").on("change", function () {
        if ($("#zoom-table-selection").is(':checked')) {
            zoomToSelected();
        }
    });

    $(".datepick").on("change", function () {
        $(".preset").val("");
    });
    $(".preset").on("change", preset_sync);

    $("#renderButton").click(renderLayers);
    $("#render-selection-button").click(openSelected);

    $("#heatres").val(ONLOAD_PARAMS.heatres);
    $("#flowres").val(ONLOAD_PARAMS.flowres);
    $("#autozoom").prop('checked', ONLOAD_PARAMS.autozoom);

    if (ONLOAD_PARAMS.activity_ids) {
        $("#activity_ids").val(ONLOAD_PARAMS.activity_ids);
        $("#select_type").val("activity_ids");
    } else if (ONLOAD_PARAMS.limit) {
        $("#select_num").val(ONLOAD_PARAMS.limit);
        $("#select_type").val("activities");
    } else if (ONLOAD_PARAMS.preset) {
        $("#select_num").val(ONLOAD_PARAMS.preset);
        $("#select_type").val("days");
        preset_sync();
    } else {
        $('#date1').val(ONLOAD_PARAMS.date1);
        $('#date2').val(ONLOAD_PARAMS.date2);
        $("#preset").val("");
    }

    renderLayers();
    preset_sync();
});


/*
  DotLayer Efrem Rensi, 2017,
  based on L.CanvasLayer by Stanislav Sumbera,  2016 , sumbera.com
  license MIT
*/

// -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
//------------------------------------------------------------------------------
L.DomUtil.setTransform = L.DomUtil.setTransform || function (el, offset, scale) {
    var pos = offset || new L.Point(0, 0);

    el.style[L.DomUtil.TRANSFORM] = (L.Browser.ie3d ? "translate(" + pos.x + "px," + pos.y + "px)" : "translate3d(" + pos.x + "px," + pos.y + "px,0)") + (scale ? " scale(" + scale + ")" : "");
};

// -- support for both  0.0.7 and 1.0.0 rc2 leaflet
L.DotLayer = (L.Layer ? L.Layer : L.Class).extend({

    _pane: "shadowPane",
    two_pi: 2 * Math.PI,
    target_fps: 32,
    smoothFactor: 1.0,
    _tThresh: 100000000.0,
    C1: 1000000.0,
    C2: 200.0,

    options: {
        startPaused: false,
        showPaths: true,
        normal: {
            dotColor: "#000000",
            pathColor: "#000000",
            pathOpacity: 0.5,
            pathWidth: 1
        },
        selected: {
            dotColor: "#FFFFFF",
            dotStrokeColor: "#FFFFFF",
            pathColor: "#000000",
            pathOpacity: 0.7,
            pathWidth: 3
        }
    },

    // -- initialized is called on prototype
    initialize: function (items, options) {
        this._map = null;
        this._canvas = null;
        this._ctx = null;
        this._frame = null;
        this._items = items || null;
        this._timeOffset = 0;
        this._colorPalette = [];
        L.setOptions(this, options);
        this._paused = this.options.startPaused;
    },

    //-------------------------------------------------------------
    _onLayerDidResize: function (resizeEvent) {
        let newWidth = resizeEvent.newSize.x,
            newHeight = resizeEvent.newSize.y;

        this._canvas.width = newWidth;
        this._canvas.height = newHeight;

        this._canvas2.width = newWidth;
        this._canvas2.height = newHeight;

        this._onLayerDidMove();
    },

    //-------------------------------------------------------------
    _onLayerDidMove: function () {
        this._mapMoving = false;

        let topLeft = this._map.containerPointToLayerPoint([0, 0]);

        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        L.DomUtil.setPosition(this._canvas, topLeft);

        this._ctx2.clearRect(0, 0, this._canvas2.width, this._canvas2.height);
        L.DomUtil.setPosition(this._canvas2, topLeft);

        this._setupWindow();

        if (!this._paused) {
            this.animate();
        } else {
            this._frame = L.Util.requestAnimFrame(this.drawLayer, this);
        }
    },

    //-------------------------------------------------------------
    getEvents: function () {
        var events = {
            movestart: function () {
                this._mapMoving = true;
            },
            moveend: this._onLayerDidMove,
            resize: this._onLayerDidResize
        };

        if (this._map.options.zoomAnimation && L.Browser.any3d) {
            events.zoomanim = this._animateZoom;
        }

        return events;
    },

    //-------------------------------------------------------------
    onAdd: function (map) {
        this._map = map;

        let size = this._map.getSize(),
            zoomAnimated = this._map.options.zoomAnimation && L.Browser.any3d;

        // dotlayer canvas
        this._canvas = L.DomUtil.create("canvas", "leaflet-layer");
        this._canvas.width = size.x;
        this._canvas.height = size.y;
        this._ctx = this._canvas.getContext("2d");
        L.DomUtil.addClass(this._canvas, "leaflet-zoom-" + (zoomAnimated ? "animated" : "hide"));
        map._panes.shadowPane.style.pointerEvents = "none";
        map._panes.shadowPane.appendChild(this._canvas);

        // create Canvas for polyline-ish things
        this._canvas2 = L.DomUtil.create("canvas", "leaflet-layer");
        this._canvas2.width = size.x;
        this._canvas2.height = size.y;
        this._ctx2 = this._canvas2.getContext("2d");
        this._ctx2.lineCap = "round";
        this._ctx2.lineJoin = "round";
        L.DomUtil.addClass(this._canvas2, "leaflet-zoom-" + (zoomAnimated ? "animated" : "hide"));
        map._panes.overlayPane.appendChild(this._canvas2);

        map.on(this.getEvents(), this);

        if (this._items) {

            // Set dotColors for these items
            let itemsList = Object.values(this._items),
                numItems = itemsList.length;

            this._colorPalette = createPalette(numItems);
            for (let i = 0; i < numItems; i++) {
                itemsList[i].dotColor = this._colorPalette[i];
            }

            this._onLayerDidMove();
        }
    },

    //-------------------------------------------------------------
    onRemove: function (map) {
        this.onLayerWillUnmount && this.onLayerWillUnmount(); // -- callback


        // map.getPanes().overlayPane.removeChild(this._canvas);
        map._panes.shadowPane.removeChild(this._canvas);
        this._canvas = null;

        map._panes.overlayPane.removeChild(this._canvas2);
        this._canvas2 = null;

        map.off(this.getEvents(), this);
    },

    // --------------------------------------------------------------------
    addTo: function (map) {
        map.addLayer(this);
        return this;
    },

    // --------------------------------------------------------------------
    LatLonToMercator: function (latlon) {
        return {
            x: latlon.lng * 6378137 * Math.PI / 180,
            y: Math.log(Math.tan((90 + latlon.lat) * Math.PI / 360)) * 6378137
        };
    },

    // -------------------------------------------------------------------
    _setupWindow: function () {
        if (!this._map || !this._items) {
            return;
        }

        const perf_t0 = performance.now();

        // Get new map orientation
        this._zoom = this._map.getZoom();
        this._center = this._map.getCenter;
        this._size = this._map.getSize();

        this._latLngBounds = this._map.getBounds();
        this._mapPanePos = this._map._getMapPanePos();
        this._pxOrigin = this._map.getPixelOrigin();
        this._pxBounds = this._map.getPixelBounds();
        this._pxOffset = this._mapPanePos.subtract(this._pxOrigin)._add(new L.Point(0.5, 0.5));

        var line_ctx = this._ctx2,
            z = this._zoom,
            ppos = this._mapPanePos,
            pxOrigin = this._pxOrigin,
            pxBounds = this._pxBounds,
            items = this._items;

        this._ctx.strokeStyle = this.options.selected.dotStrokeColor;

        this._dotSize = Math.log(z);
        this._dotOffset = ~~(this._dotSize / 2 + 0.5);
        this._zoomFactor = 1 / Math.pow(2, z);

        var tThresh = this._tThresh * DotLayer._zoomFactor;

        console.log(`zoom=${z}\nmapPanePos=${ppos}\nsize=${this._size}\n` + `pxOrigin=${pxOrigin}\npxBounds=[${pxBounds.min}, ${pxBounds.max}]`);

        this._processedItems = {};

        let pxOffx = this._pxOffset.x,
            pxOffy = this._pxOffset.y;

        for (let id in items) {
            if (!items.hasOwnProperty(id)) {
                //The current property is not a direct property of p
                continue;
            }

            let A = this._items[id];
            drawingLine = false;

            // console.log("processing "+A.id);

            if (!A.projected) {
                A.projected = {};
            }

            if (A.latLngTime && this._latLngBounds.overlaps(A.bounds)) {
                let projected = A.projected[z],
                    llt = A.latLngTime;

                // Compute projected points if necessary
                if (!projected) {
                    let numPoints = llt.length / 3,
                        projectedObjs = new Array(numPoints);

                    for (let i = 0, p, idx; i < numPoints; i++) {
                        idx = 3 * i;
                        p = this._map.project([llt[idx], llt[idx + 1]]);
                        p.t = llt[idx + 2];
                        projectedObjs[i] = p;
                    }

                    projectedObjs = L.LineUtil.simplify(projectedObjs, this.smoothFactor);

                    // now projectedObjs is an Array of objects, so we convert it
                    // to a Float32Array
                    let numObjs = projectedObjs.length,
                        projected = new Float32Array(numObjs * 3);
                    for (let i = 0, obj, idx; i < numObjs; i++) {
                        obj = projectedObjs[i];
                        idx = 3 * i;
                        projected[idx] = obj.x;
                        projected[idx + 1] = obj.y;
                        projected[idx + 2] = obj.t;
                    }
                    A.projected[z] = projected;
                }

                projected = A.projected[z];
                // determine whether or not each projected point is in the
                // currently visible area
                let numProjected = projected.length / 3,
                    numSegs = numProjected - 1,
                    segGood = new Int8Array(numProjected - 2),
                    goodSegCount = 0,
                    t0 = projected[2],
                    in0 = this._pxBounds.contains([projected[0], projected[1]]);

                for (let i = 1, idx; i < numSegs; i++) {
                    let idx = 3 * i,
                        p = projected.slice(idx, idx + 3),
                        in1 = this._pxBounds.contains([p[0], p[1]]),
                        t1 = p[2],
                        isGood = in0 && in1 && t1 - t0 < tThresh ? 1 : 0;
                    segGood[i - 1] = isGood;
                    goodSegCount += isGood;
                    in0 = in1;
                    t0 = t1;
                }

                // console.log(segGood);
                if (goodSegCount == 0) {
                    continue;
                }

                let dP = new Float32Array(goodSegCount * 3);

                for (let i = 0, j = 0; i < numSegs; i++) {
                    // Is the current segment in the visible area?
                    if (segGood[i]) {
                        let pidx = 3 * i,
                            didx = 3 * j,
                            p = projected.slice(pidx, pidx + 6);
                        j++;

                        // p[0:2] are p1.x, p1.y, and p1.t
                        // p[3:5] are p2.x, p2.y, and p2.t

                        // Compute derivative for this segment
                        dP[didx] = pidx;
                        dt = p[5] - p[2];
                        dP[didx + 1] = (p[3] - p[0]) / dt;
                        dP[didx + 2] = (p[4] - p[1]) / dt;

                        if (this.options.showPaths) {
                            if (!drawingLine) {
                                line_ctx.beginPath();
                                drawingLine = true;
                            }
                            // draw polyline segment from p1 to p2
                            let c1x = ~~(p[0] + pxOffx),
                                c1y = ~~(p[1] + pxOffy),
                                c2x = ~~(p[3] + pxOffx),
                                c2y = ~~(p[4] + pxOffy);
                            line_ctx.moveTo(c1x, c1y);
                            line_ctx.lineTo(c2x, c2y);
                        }
                    }
                }

                if (this.options.showPaths) {
                    if (drawingLine) {
                        lineType = A.highlighted ? "selected" : "normal";
                        line_ctx.globalAlpha = this.options[lineType].pathOpacity;
                        line_ctx.lineWidth = this.options[lineType].pathWidth;
                        line_ctx.strokeStyle = A.path_color || this.options[lineType].pathColor;
                        line_ctx.stroke();
                    } else {
                        line_ctx.stroke();
                    }
                }

                this._processedItems[id] = {
                    dP: dP,

                    P: projected,

                    dotColor: A.dotColor,

                    startTime: new Date(A.ts_UTC || A.beginTimestamp).getTime(),
                    totSec: projected.slice(-1)[0]
                };
            }
        }

        elapsed = (performance.now() - perf_t0).toFixed(2);
        console.log(`dot context update took ${elapsed} ms`);
        console.log(this._processedItems);
    },

    // --------------------------------------------------------------------
    drawDots: function (obj, now, highlighted) {
        var P = obj.P,
            dP = obj.dP,
            len_dP = dP.length / 3,
            totSec = obj.totSec,
            zf = this._zoomFactor,
            dT = this.C1 * zf,
            s = this.C2 * zf * (now - obj.startTime),
            xmax = this._size.x,
            ymax = this._size.y,
            ctx = this._ctx,
            dotSize = this._dotSize,
            dotOffset = this._dotOffset,
            two_pi = this.two_pi,
            xOffset = this._pxOffset.x,
            yOffset = this._pxOffset.y;

        var timeOffset = s % dT,
            count = 0,
            idx = dP[0],
            dx = dP[1],
            dy = dP[2],
            p = P.slice(idx, idx + 3);

        if (highlighted) {
            ctx.fillStyle = obj.dotColor || this.options.selected.dotColor;
        }

        if (timeOffset < 0) {
            timeOffset += dT;
        }

        // Console.log("\nnew obj");
        // let out;
        debugger;

        for (let t = timeOffset, i = 0; t < totSec; t += dT) {
            while (t >= P[idx + 5]) {
                i += 3;
                idx = dP[i];
                dx = dP[i + 1];
                dy = dP[i + 2];

                p = P.slice(idx, idx + 3);
                if (i >= len_dP) {
                    return count;
                }
            }

            let dt = t - p[2];
            if (dt > 0) {
                let lx = ~~(p[0] + dx * dt + xOffset),
                    ly = ~~(p[1] + dy * dt + yOffset);

                if (lx >= 0 && lx <= xmax && ly >= 0 && ly <= ymax) {
                    if (highlighted) {
                        ctx.beginPath();
                        ctx.arc(lx, ly, dotSize, 0, two_pi);
                        ctx.fill();
                        ctx.closePath();
                        ctx.stroke();
                    } else {
                        ctx.fillRect(lx - dotOffset, ly - dotOffset, dotSize, dotSize);
                    }
                    count++;
                }
            }
        }
        return count;
    },

    drawLayer: function (now) {
        if (!this._map) {
            return;
        }

        this._ctx.clearRect(0, 0, this._canvas.width, this._canvas.height);
        this._ctx.fillStyle = this.options.normal.dotColor;

        var ctx = this._ctx,
            zoom = this._zoom,
            count = 0,
            t0 = performance.now(),
            id,
            item,
            items = this._items,
            pItem,
            pItems = this._processedItems,
            highlighted_items = [];

        for (id in pItems) {
            item = pItems[id];
            if (items[id].highlighted) {
                highlighted_items.push(item);
            } else {
                count += this.drawDots(item, now, false);
            }
        }

        // Now plot highlighted paths
        var i,
            dotColor,
            hlen = highlighted_items.length;
        if (hlen) {
            for (i = 0; i < hlen; i++) {
                item = highlighted_items[i];
                count += this.drawDots(item, now, true);
            }
        }

        var elapsed = (performance.now() - t0).toFixed(1);
        fps_display && fps_display.update(now, `${elapsed} ms/f, n=${count}, z=${this._zoom}`);
    },

    // --------------------------------------------------------------------
    animate: function () {
        this._paused = false;
        this.lastCalledTime = 0;
        this.minDelay = ~~(1000 / this.target_fps + 0.5);
        this._frame = L.Util.requestAnimFrame(this._animate, this);
    },

    // --------------------------------------------------------------------
    pause: function () {
        this._paused = true;
    },

    // --------------------------------------------------------------------
    _animate: function () {
        if (this._paused || this._mapMoving) {
            // Ths is so we can start where we left off when we resume
            this._timePaused = Date.now();
            return;
        }

        if (this._timePaused) {
            this._timeOffset = Date.now() - this._timePaused;
            this._timePaused = null;
        }

        let now = Date.now() - this._timeOffset;
        if (now - this.lastCalledTime > this.minDelay) {
            this.lastCalledTime = now;
            this.drawLayer(now);
        }

        this._frame = null;

        this._frame = this._frame || L.Util.requestAnimFrame(this._animate, this);
    },

    // -- L.DomUtil.setTransform from leaflet 1.0.0 to work on 0.0.7
    //------------------------------------------------------------------------------
    _setTransform: function (el, offset, scale) {
        var pos = offset || new L.Point(0, 0);

        el.style[L.DomUtil.TRANSFORM] = (L.Browser.ie3d ? "translate(" + pos.x + "px," + pos.y + "px)" : "translate3d(" + pos.x + "px," + pos.y + "px,0)") + (scale ? " scale(" + scale + ")" : "");
    },

    //------------------------------------------------------------------------------
    _animateZoom: function (e) {
        var scale = this._map.getZoomScale(e.zoom);

        // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1
        var offset = L.Layer ? this._map._latLngToNewLayerPoint(this._map.getBounds().getNorthWest(), e.zoom, e.center) : this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());

        L.DomUtil.setTransform(this._canvas, offset, scale);
    }
});

L.dotLayer = function (items, options) {
    return new L.DotLayer(items, options);
};

/* From http://stackoverflow.com/a/20591891/4718949 */
function hslToRgbString(h, s, l) {
    return "hsl(" + h + "," + s + "%," + l + "% )";
}

function createPalette(colorCount) {
    let newPalette = [],
        hueStep = Math.floor(330 / colorCount),
        hue = 0,
        saturation = 95,
        luminosity = 55,
        greenJump = false;

    for (let colorIndex = 0; colorIndex < colorCount; colorIndex++) {
        saturation = colorIndex & 1 ? 90 : 65;
        luminosity = colorIndex & 1 ? 80 : 55;
        newPalette.push(hslToRgbString(hue, saturation, luminosity));
        hue += hueStep;
        if (!greenJump && hue > 100) {
            hue += 30;
            greenJump = true;
        }
    }
    return newPalette;
}

