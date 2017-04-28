const SPEED_SCALE = 5.0,
      SEP_SCALE = {m: 0.14, b: 15.0};

// Set up Map and base layers
var map_providers = ONLOAD_PARAMS.map_providers,
    baseLayers = {"None": L.tileLayer("")},
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
        "Google.Roadmap": L.gridLayer.googleMutant({type: 'roadmap'}),
        "Google.Terrain": L.gridLayer.googleMutant({type: 'terrain'}),
        "Google.Hybrid": L.gridLayer.googleMutant({type: 'hybrid'})
    };

    Object.assign(baseLayers, online_baseLayers);
    if (map_providers.length) {
        for (var i = 0; i < map_providers.length; i++) {
            provider = map_providers[i];
            var tl = L.tileLayer.provider(provider);
            baseLayers[provider] = tl;
            if (i==0) default_baseLayer = tl;
        }
    } else {
        default_baseLayer = baseLayers["Google.Terrain"];
    }
}

var map = L.map('map', {
        center: ONLOAD_PARAMS.map_center,
        zoom: ONLOAD_PARAMS.map_zoom,
        layers : [ default_baseLayer ],
        renderer: L.svg({ padding: 0 }),
        zoomAnimation: false
    });


var sidebarControl = L.control.sidebar('sidebar').addTo(map),
    zoomControl = map.zoomControl.setPosition('bottomright'),
    layerControl = L.control.layers(baseLayers, null, {position: 'topleft'}).addTo(map),
        // locateControl = L.control.locate({position: "bottomright", icon: "fa fa-anchor"}).addTo(map),
        fps_display = null;

        if (ADMIN) {
            fps_display = L.control.fps().addTo(map);
        }


        var button_states = [{
            stateName: 'animation-running',
            icon:      'fa-pause',
            title:     'Pause Animation',
            onClick: function(btn, map) {
                pauseFlow();
                updateState();
                btn.state('animation-paused');
            }
        }, {
            stateName: 'animation-paused',
            icon:      'fa-play',
            title:     'Resume Animation',
            onClick: function(btn, map) {
                resumeFlow();
                if (DotLayer) {
                    DotLayer.animate();
                }
                updateState();
                btn.state('animation-running');
            }
        }],

        animationControl = L.easyButton({
            states: appState.paused? button_states.reverse() : button_states
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
    for (let i=0, len=FLASH_MESSAGES.length; i<len; i++) {
        msg += "<li>" + FLASH_MESSAGES[i] + "</li>";
    }
    msg += "</ul>";
    L.control.window(map, {content:msg, visible:true});
}

var atable = $('#activitiesList').DataTable({
                paging: false,
                scrollY: "60vh",
                scrollX: true,
                scrollCollapse: true,
                order: [[ 0, "desc" ]],
                select: true,
                data: Object.values(appState.items),
                idSrc: "id",
                columns: [
                { title: "Date",  data: null, render: (A) => href( stravaActivityURL(A.id), A.beginTimestamp.slice(0,10) ) },
                { title: "Type", data: "type"},
                { title: `Dist (${DIST_LABEL})`, data: "total_distance", render: (data) => +(data / DIST_UNIT).toFixed(2)},
                { title: "Time", data: "elapsed_time", render: hhmmss},
                { title: "Name", data: "name"}
                ]
            }).on( 'select', handle_table_selections)
              .on( 'deselect', handle_table_selections);

function updateShareStatus(status) {
    console.log("updating share status.");
    url = `${SHARE_STATUS_UPDATE_URL}?status=${status}`;
    httpGetAsync(url, function(responseText) {
        console.log(`response: ${responseText}`);
    });
}


function handle_table_selections( e, dt, type, indexes ) {
    if ( type === 'row' ) {
        var selectedItems = atable.rows( {selected: true} ).data(),
            unselectedItems = atable.rows( {selected: false} ).data();

        for (var i = 0; i < selectedItems.length; i++) {
            if (!selectedItems[i].selected){
                togglePathSelect(selectedItems[i].id);
            }
        }

        for (var i = 0; i < unselectedItems.length; i++) {
            if (unselectedItems[i].selected){
                togglePathSelect(unselectedItems[i].id);
            }
        }

        let c = map.getCenter(),
            z = map.getZoom();

        if ( $("#zoom-table-selection").is(':checked') ) {
            zoomToSelected();
        }

        // If map didn't move then force a redraw
        let c2 = map.getCenter();
        if (DotLayer && c.x == c2.x &&  c.y == c2.y && z == map.getZoom()) {
            DotLayer._onLayerDidMove();
        }
    }
}

function zoomToSelected(){
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

function selectedIDs(){
    return Object.values(appState.items).filter(
        (a) => { return a.selected; }
        ).map(function(a) { return a.id; });
}

function openSelected(){
    ids = selectedIDs();
    if (ids.length > 0) {
        var url = BASE_USER_URL + "?id=" + ids.join("+");
        if (appState.paused == true){
            url += "&paused=1"
        }
        window.open(url,'_blank');
    }
}

function pauseFlow(){
    DotLayer.pause();
    appState.paused = true;
}

function resumeFlow(){
    appState.paused = false;
    if (DotLayer) {
        DotLayer.animate();
    }
}

function highlightPath(id) {
    var A = appState.items[id];
    if (A.selected) return false;

    A.highlighted = true;

    var row = $("#"+id),
    scroller = $('.dataTables_scrollBody'),
    flow = A.flowLayer;

    // highlight table row and scroll to it if necessary
    row.addClass('selected');
    scroller.scrollTop(row.prop('offsetTop') - scroller.height()/2);

    return A;
}


function unhighlightPath(id){

    var A = appState.items[id];
    if (A.selected) return false;

    A.highlighted = false;

    // un-highlight table row
    $("#"+id).removeClass('selected');

    return A;
}

function togglePathSelect(id){
    var A = appState.items[id];
    if (A.selected) {
        A.selected = false;
        unhighlightPath(id);
    } else {
        highlightPath(id);
        A.selected = true;
    }
}

function activityDataPopup(id, latlng){
    var A = appState.items[id],
    d = parseFloat(A.total_distance),
    elapsed = hhmmss(parseFloat(A.elapsed_time)),
    v = parseFloat(A.average_speed);
    var dkm = +(d / 1000).toFixed(2),
    dmi = +(d / 1609.34).toFixed(2),
    vkm,
    vmi;

    if (A.vtype == "pace"){
        vkm = hhmmss(1000 / v).slice(3) + "/km";
        vmi = hhmmss(1609.34 / v).slice(3) + "/mi";
    } else {
        vkm = (v * 3600 / 1000).toFixed(2) + "km/hr";
        vmi = (v * 3600 / 1609.34).toFixed(2) + "mi/hr";
    }

    var popup = L.popup()
                .setLatLng(latlng)
                .setContent(
                    `${A.name}<br>${A.type}: ${A.beginTimestamp}<br>`+
                    `${dkm} km (${dmi} mi) in ${elapsed}<br>${vkm} (${vmi})<br>` +
                    `View in <a href='https://www.strava.com/activities/${A.id}' target='_blank'>Strava</a>`+
                    `, <a href='${BASE_USER_URL}?id=${A.id}&flowres=high' target='_blank'>Heatflask</a>`
                    )
                .openOn(map);
}

/* Rendering */
function renderLayers() {
    const flowres = $("#flowres").val(),
    heatres = $("#heatres").val(),
    date1 = $("#date1").val(),
    date2 = $("#date2").val(),
    type = $("#select_type").val(),
    num = $("#select_num").val(),
    lores = (flowres == "low" || heatres == "low"),
    hires = (flowres == "high" || heatres == "high");
    dotFlow = true;

    var query = {};

    if (type == "activity_ids") {
        query.id = $("#activity_ids").val();
    } else if (type=="activities") {
        if (num == 0) {
            query.limit = 1;
        }
        else {
            query.limit = num;
        }
    } else {
        if (date1) {
            query.date1 = date1;
        }
        if (date2 && (date2 != "now")) {
            query.date2 = date2;
        }
    }

    if (hires) {
        query.hires = hires;
    }


    // Remove HeatLayer from map and control if it's there
    if (HeatLayer){
        map.removeLayer(HeatLayer);
        layerControl.removeLayer(HeatLayer);
        HeatLayer = false;
    }

    if (DotLayer){
        map.removeLayer(DotLayer);
        layerControl.removeLayer(DotLayer);
        DotLayer = false;
    }


    // Add new blank HeatLayer to map if specified
    var latlngs_flat = [];
    if (heatres){
        HeatLayer = L.heatLayer(latlngs_flat, HEATLAYER_DEFAULT_OPTIONS);
        map.addLayer(HeatLayer);
        layerControl.addOverlay(HeatLayer, "Point Density");
    }

    // locateControl.stop();
    appState.items = {};
    atable.clear();


    var msgBox = L.control.window(map,
        {position: 'top',
        content:"<div class='data_message'></div><div><progress class='progbar' id='box'></progress></div>",
        visible:true
    }),
    progress_bars = $('.progbar'),
    rendering = true,
    listening = true,
    bounds = L.latLngBounds(),
    source = new EventSource(
        BASE_DATAURL + "?" + jQuery.param(query, true)
        );

    $(".data_message").html("Rendering activities...");
    $("#abortButton").show();
    $(".progbar").show();
    $('#renderButton').prop('disabled', true);

    function doneRendering(msg){
        if (rendering) {
            $("#abortButton").hide();
            $(".progbar").hide();
            try {
                msgBox.close();
            }
            catch(err) {
                console.log(err.message);
            }
            if ($("#autozoom:checked").val() && bounds.isValid())
                map.fitBounds(bounds);
            var msg2 = msg + " " + Object.keys(appState.items).length + " activities rendered.";
            $(".data_message").html(msg2);
            rendering = false;
            if (dotFlow) {
                DotLayer = new L.DotLayer(appState.items, {startPaused: appState.paused});
                map.addLayer(DotLayer);
                layerControl.addOverlay(DotLayer, "Dots");

                $("#sepConst").val((Math.log2(DotLayer.C1) - SEP_SCALE.b) / SEP_SCALE.m ).trigger("change");
                $("#speedConst").val(Math.sqrt(DotLayer.C2) / SPEED_SCALE).trigger("change");
                $("#showPaths").prop("checked", DotLayer.options.showPaths)
                                .on("change", function(){
                                     DotLayer.options.showPaths = $(this).prop("checked");
                                     DotLayer._onLayerDidMove();
                                });

                // render the activities table
                atable.rows.add(Object.values(appState.items)).draw(false);
            }
        }
    }

    function stopListening() {
        if (listening){
            listening = false;
            source.close();
            $('#renderButton').prop('disabled', false);

        }
    }


    source.onmessage = function(event) {
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

            if ("error" in A){
                var msg = "<font color='red'>" + A.error +"</font><br>";
                $(".data_message").html(A.msg);
                console.log(`Error activity ${A.id}: ${A.error}`);
                return;
            } else if ("stop_rendering" in A){
                doneRendering("Done rendering.");
            } else if ("msg" in A) {
                $(".data_message").html(A.msg);
                if ("value" in A) {
                    progress_bars.val(A.value);
                }
                return;
            }
            else {
                // atable.row.add(A);
            }



            if (lores && ("summary_polyline" in A) && (A.summary_polyline)) {
                var latlngs = L.PolylineUtil.decode(A.summary_polyline);
                if (heatres == "low") heatpoints = latlngs;
                if (flowres == "low") flowpoints = latlngs;
            }


            if (query.hires && ("polyline" in A) && (A.polyline)){
                var latlngs = L.PolylineUtil.decode(A.polyline);
                if (heatres == "high") heatpoints = latlngs;
                if (flowres == "high") {
                    flowpoints = latlngs;
                    if (dotFlow && ("time" in A)) {
                        A.latlng = latlngs;
                        A.time = streamDecode(A.time);
                    }
                }
            }

            if (heatpoints) {
                latlngs_flat.push.apply(latlngs_flat, heatpoints);
            }

            var points = heatpoints || flowpoints;
            if (points) {
                if (!A.bounds) {
                    A.bounds = L.latLngBounds(points);
                }
                bounds.extend(A.bounds);
                delete A.summary_polyline;
                delete A.polyline;
                if (!dotFlow){
                    delete A.time;
                }
                appState.items[A.id] = A;
            }
        }
    }
}


function updateState(){
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
        if (appState.date2 && (appState.date2 != "now")) {
            params.date2 = appState.date2;
        }
    }

    if (appState.paused){
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
    if (type=="days"){
        $(".date_select").hide();
        $("#id_select").hide();
        $("#num_select").show();
        $('#date1').val(moment().subtract(num, 'days').format(F));
        $('#date2').val("now");
    } else if (type=="activities") {
        $(".date_select").hide();
        $("#id_select").hide();
        $("#num_select").show();
        $('#date1').val("");
        $('#date2').val("now");
    }
    else if (type=="activity_ids") {
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


$(document).ready(function() {
    $("#select_num").keypress(function(event) {
        if (event.which == 13) {
            event.preventDefault();
            renderLayers();
        }
    });

    $("#abortButton").hide();
    $('#abortButton').click(function(){
        stopListening();
        doneRendering("<font color='red'>Aborted:</font>");
    });

    $(".progbar").hide();
    $(".datepick").datepicker({ dateFormat: 'yy-mm-dd',
        changeMonth: true,
        changeYear: true
    });


    map.on('moveend', function(e) {
        if (!appState.autozoom) {
            updateState();
        }
    });


    $("#autozoom").on("change", updateState);
    $("#info").on("change", updateState);


    $("#share").prop("checked", SHARE_PROFILE);
    $("#share").on("change", function() {
        var status = $("#share").is(":checked")? "public":"private";
        updateShareStatus(status);
    });


    $("#zoom-table-selection").prop("checked", true);
    $("#zoom-table-selection").on("change", function(){
        if ( $("#zoom-table-selection").is(':checked')) {
            zoomToSelected();
        }
    });

    $(".datepick").on("change", function(){
        $(".preset").val("");
    });
    $(".preset").on("change", preset_sync);

    $("#renderButton").click(renderLayers);
    $("#render-selection-button").click(openSelected);


    $("#heatres").val(ONLOAD_PARAMS.heatres);
    $("#flowres").val(ONLOAD_PARAMS.flowres)
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

