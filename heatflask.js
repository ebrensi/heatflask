const SPEED_SCALE = 5.0,
      SEP_SCALE = {m: 0.14, b: 15.0};

// Set up Map and base layers
let map_providers = ONLOAD_PARAMS.map_providers,
    baseLayers = {"None": L.tileLayer("")},
    default_baseLayer = baseLayers["None"],
    DotLayer = false,
    appState = {
        paused: ONLOAD_PARAMS.start_paused,
        items: {},
        currentBaseLayer: null
    };

if (!OFFLINE) {
    var online_baseLayers = {
        "Esri.WorldImagery": L.tileLayer.provider("Esri.WorldImagery"),
        "Esri.NatGeoWorldMap": L.tileLayer.provider("Esri.NatGeoWorldMap"),
        "Stamen.Terrain": L.tileLayer.provider("Stamen.Terrain"),
        "Stamen.TonerLite": L.tileLayer.provider("Stamen.TonerLite"),
        "CartoDB.Positron": L.tileLayer.provider("CartoDB.Positron"),
        "CartoDB.DarkMatter": L.tileLayer.provider("CartoDB.DarkMatter"),
        "Google.Roadmap": L.gridLayer.googleMutant({type: 'roadmap'}),
        "Google.Terrain": L.gridLayer.googleMutant({type: 'terrain'}),
        // "Google.Hybrid": L.gridLayer.googleMutant({type: 'hybrid'})
    };

    Object.assign(baseLayers, online_baseLayers);
    if (map_providers.length) {
        for (var i = 0; i < map_providers.length; i++) {
            let provider = map_providers[i];
            if (!baseLayers[provider]) {
                baseLayers[provider] = L.tileLayer.provider(provider);
            }
            if (i==0) default_baseLayer = baseLayers[provider];
        }
    } else {
        default_baseLayer = baseLayers["CartoDB.DarkMatter"];
    }
}

for (name in baseLayers) {
    baseLayers[name].name = name;
}


var map = L.map('map', {
        center: ONLOAD_PARAMS.map_center,
        zoom: ONLOAD_PARAMS.map_zoom,
        layers : [ default_baseLayer ],
        preferCanvas: true,
        zoomAnimation: false
    });

appState.currentBaseLayer = default_baseLayer;
map.on('baselayerchange', function (e) {
    appState.currentBaseLayer = e;
    updateState();
});



var sidebarControl = L.control.sidebar('sidebar').addTo(map),
    zoomControl = map.zoomControl.setPosition('bottomleft'),
    layerControl = L.control.layers(baseLayers, null, {position: 'topleft'}).addTo(map),
    fps_display = ADMIN? L.control.fps().addTo(map) : null,
    areaSelect = null;


// Animation button
var animation_button_states = [
    {
        stateName: 'animation-running',
        icon:      'fa-pause',
        title:     'Pause Animation',
        onClick: function(btn, map) {
            pauseFlow();
            updateState();
            btn.state('animation-paused');
            }
    },

    {
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
    }
],

    animationControl = L.easyButton({
        states: appState.paused? animation_button_states.reverse() : animation_button_states
    }).addTo(map);



function doneSelecting(bounds){
    let pxBounds = bounds.pxBounds;
    DotLayer && DotLayer.setSelectRegion(pxBounds, callback=handle_path_selections);
}

// Select-activities-in-region functionality
var selectControl = new L.AreaSelect2(options={}, doneSelecting=doneSelecting);

var selectButton_states = [
        {
            stateName: 'not-selecting',
            icon: 'fa-object-group',
            title: 'Select Paths',
            onClick: function(btn, map) {
                btn.state('selecting');
                map.dragging.disable();
                selectControl.addTo(map);

            }
        },
        {
            stateName: 'selecting',
            icon: '<span>&cross;</span>',
            title: 'Stop Selecting',
            onClick: function(btn, map) {
                btn.state('not-selecting');
                map.dragging.enable();
                selectControl.remove();
            }
        },
    ],
    selectButton = L.easyButton({
        states: selectButton_states,
        position: "topright"
    }).addTo(map);





// Capture button
var capture_button_states = [
    {
        stateName: 'idle',
        icon: 'fa-video-camera',
        title: 'Capture GIF',
        onClick: function (btn, map) {
            if (!DotLayer) {
                return;
            }
            let size = map.getSize();
            areaSelect = L.areaSelect({width:200, height:200});
            areaSelect._width = ~~(0.8 * size.x);
            areaSelect._height = ~~(0.8 * size.y);
            areaSelect.addTo(map);
            btn.state('selecting');
        }
    },
    {
        stateName: 'selecting',
        icon: 'fa-expand',
        title: 'Select Capture Region',
        onClick: function (btn, map) {
            let size = map.getSize(),
                w = areaSelect._width,
                h = areaSelect._height,
                topLeft = {
                    x: Math.round((size.x - w) / 2),
                    y: Math.round((size.y - h) / 2)
                },

                selection = {
                    topLeft: topLeft,
                    width: w,
                    height: h
                };

            DotLayer.captureCycle(selection=selection, callback=function(){
                btn.state('idle');
                areaSelect.remove();
            });

            btn.state('capturing');
        }
    },
    {
        stateName: 'capturing',
        icon: 'fa-stop-circle',
        title: 'Cancel Capture',
        onClick: function (btn, map) {
            if (DotLayer && DotLayer._capturing) {
                DotLayer.abortCapture();
                areaSelect.remove();
                btn.state('idle');
            }
        }
    }
];


// Capture control button
var captureControl = L.easyButton({
    states: capture_button_states
});
captureControl.enabled = false;


// set up dial-controls
$(".dotconst-dial").knob({
        min: 0,
        max: 100,
        step: 0.1,
        width: "150",
        height: "150",
        cursor: 20,
        inline: true,
        displayInput: false,
        change: function (val) {
            if (!DotLayer) {
                return;
            }

            let newVal;
            if (this.$[0].id == "sepConst") {
                newVal = Math.pow(2, val * SEP_SCALE.m + SEP_SCALE.b);
                DotLayer.C1 = newVal;
            } else {
                newVal = val * val * SPEED_SCALE;
                DotLayer.C2 = newVal;
            }

            if (DotLayer._paused) {
                DotLayer.drawLayer(DotLayer._timePaused);
            }

            // Enable capture if period is less than CAPTURE_DURATION_MAX
            let cycleDuration = DotLayer.periodInSecs().toFixed(2),
                captureEnabled = captureControl.enabled;

            $("#period-value").html(cycleDuration);
            if (cycleDuration <= CAPTURE_DURATION_MAX) {
                if (!captureEnabled) {
                    captureControl.addTo(map);
                    captureControl.enabled = true;
                }
            } else if (captureEnabled) {
                captureControl.removeFrom(map);
                captureControl.enabled = false;
            }
        },
        release: function() {
            updateState();
        }
});

$(".dotscale-dial").knob({
        min: 0.01,
        max: 10,
        step: 0.01,
        width: "100",
        height: "100",
        cursor: 20,
        inline: true,
        displayInput: false,
        change: function (val) {
            if (!DotLayer) {
                return;
            }
            DotLayer.dotScale = val;
            if (DotLayer._paused) {
                DotLayer.drawLayer(DotLayer._timePaused);
            }
        },
        release: function() {
            updateState();
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


// IInitialize Activity Table in sidebar
var atable = $('#activitiesList').DataTable({
                paging: false,
                scrollY: "60vh",
                scrollX: true,
                scrollCollapse: true,
                order: [[ 0, "desc" ]],
                select: isMobileDevice()? "multi" : "os",
                data: Object.values(appState.items),
                rowId: "id",
                columns: [{
                    title: '<i class="fa fa-calendar" aria-hidden="true"></i>',
                    data: null,
                    render: (A) => href( stravaActivityURL(A.id), A.ts_local.slice(0,10) )
                },
                { title: "Type", data: "type"},
                {
                    title: `<i class="fa fa-arrows-h" aria-hidden="true"></i> (${DIST_LABEL})`,
                    data: "total_distance",
                    render: (data) => +(data / DIST_UNIT).toFixed(2)},
                {
                    title: '<i class="fa fa-clock-o" aria-hidden="true"></i>',
                    data: "elapsed_time",
                    render: hhmmss},

                { title: "Name", data: "name"},

                {
                    title: '<i class="fa fa-users" aria-hidden="true"></i>',
                    data: "group",
                    render:  formatGroup}
                ]
            }).on( 'select', handle_table_selections)
              .on( 'deselect', handle_table_selections);


var tableScroller = $('.dataTables_scrollBody');



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
            zoomToSelectedPaths();
        }

        // If map didn't move then force a redraw
        DotLayer._onLayerDidMove();
    }
}


function handle_path_selections(ids) {
    if (!ids.length) {
        return;
    }
    idStrings = ids.map((id) => "#"+id);
    atable.rows(idStrings).nodes().to$().toggleClass("selected");
}




function zoomToSelectedPaths(){
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

    atable.row("#"+id).select();
    // highlight table row and scroll to it if necessary
    row.addClass('selected');
    // tableScroller.scrollTop(row.prop('offsetTop') - tableScroller.height()/2);

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
                    `${A.name}<br>${A.type}: ${A.ts_local}<br>`+
                    `${dkm} km (${dmi} mi) in ${elapsed}<br>${vkm} (${vmi})<br>` +
                    `View in <a href='https://www.strava.com/activities/${A.id}' target='_blank'>Strava</a>`+
                    `, <a href='${BASE_USER_URL}?id=${A.id}' target='_blank'>Heatflask</a>`
                    )
                .openOn(map);
}


function getBounds(ids=[]) {
    let bounds = L.latLngBounds();
    for (let i=0; i<ids.length; i++){
        bounds.extend( appState.items[ids[i]].bounds );
    }
    return bounds
}

function initializeDotLayer() {
    DotLayer = new L.DotLayer(appState.items, {
        startPaused: appState.paused
    });

    // DotLayer.options.normal.dotColor = $("#normal-dotColor").val();
    // $("#normal-dotColor").on("input", function (){
    //     DotLayer.options.normal.dotColor = $(this).val();
    // });

    if (ONLOAD_PARAMS.C1) {
        DotLayer.C1 = ONLOAD_PARAMS.C1;
    }

    if (ONLOAD_PARAMS.C2) {
        DotLayer.C2 = ONLOAD_PARAMS.C2;
    }

    if (ONLOAD_PARAMS.SZ) {
        DotLayer.dotScale = ONLOAD_PARAMS.SZ;
    }

    map.addLayer(DotLayer);
    layerControl.addOverlay(DotLayer, "Dots");
    $("#sepConst").val((Math.log2(DotLayer.C1) - SEP_SCALE.b) / SEP_SCALE.m ).trigger("change");
    $("#speedConst").val(Math.sqrt(DotLayer.C2) / SPEED_SCALE).trigger("change");
    $("#dotScale").val(DotLayer.dotScale).trigger("change");

    setTimeout(function(){
        $("#period-value").html(DotLayer.periodInSecs().toFixed(2));

        // Enable capture if period is less than CAPTURE_DURATION_MAX
        let cycleDuration = DotLayer.periodInSecs().toFixed(2),
            captureEnabled = captureControl.enabled;


        $("#period-value").html(cycleDuration);
        if (cycleDuration <= CAPTURE_DURATION_MAX) {
            if (!captureEnabled) {
                captureControl.addTo(map);
                captureControl.enabled = true;
            }
        } else if (captureEnabled) {
            captureControl.removeFrom(map);
            captureControl.enabled = false;
        }


    }, 500);

    $("#showPaths").prop("checked", DotLayer.options.showPaths)
                    .on("change", function(){
                         DotLayer.options.showPaths = $(this).prop("checked");
                         DotLayer._onLayerDidMove();
                    });
}


/* Rendering */
function renderLayers() {
    const date1 = $("#date1").val(),
          date2 = $("#date2").val(),
          type = $("#select_type").val(),
          num = $("#select_num").val(),
          idString = (type == "activity_ids")? $("#activity_ids").val():null;

    if (DotLayer) {
        DotLayer.pause();
    }

    // Handle given activity_ids case first
    if (idString) {
        let streamQuery = {},
            activityIds = idString.split(/\D/).map(Number);

        // TODO: remove any activities from appState.items that aren't in
        //  activityIds
        streamQuery[USER_ID] = {
            activity_ids: activityIds,
            summaries: true,
            streams: true
        };

        httpPostAsync(POST_QUERY_URL, streamQuery, function(data) {
            // console.log(data);
            let key = JSON.parse(data),
                streamURL = `${KEY_QUERY_URL}${key}`;
            // window.open(streamURL, target="_blank");
            readStream(streamURL, activityIds.length, updateLayers);
        });

        return;
    }


    // We will load in new items that aren't already in appState.items,
    //  and delete whatever is left.
    let inClient = new Set(Object.keys(appState.items).map(Number));

    activityQuery = {
        limit: (type == "activities")? Math.max(1, +num) : undefined,
        after: date1? date1 : undefined,
        before: (date2 && date2 != "now")? date2 : undefined,
        only_ids: true
    }

    let url = QUERY_URL_JSON + "?" + jQuery.param(activityQuery);
    httpGetAsync(url, function(data) {
        let queryResult = JSON.parse(data)[0];

        // handle the case where there is no index for this user
        if (queryResult == "build") {
            activityQuery["only_ids"] = false;
            activityQuery["summaries"] = true;
            activityQuery["streams"] = true;
            // TODO: handle the unlikely case where there are items already in
            //  appState.items
            let streamURL = QUERY_URL_SSE + "?" + jQuery.param(activityQuery);
            // window.open(streamURL, target="_blank");
            readStream(streamURL, null, updateLayers);
            return;
        }


        let resultSet = new Set(queryResult);

        // delete all items that aren't in queryResult from appState.items
        for (let item of inClient) {
            if (!resultSet.has(item))
            delete appState.items[item];
        }

        // filter activitys to get by ones we don't already have
        activityIds = queryResult.filter((id) => !inClient.has(id));

        // console.log(activityIds);
        if (!activityIds.length){
            updateLayers();
            return;
        }

        let streamQuery = {};
        streamQuery[USER_ID] = {
            activity_ids: activityIds,
            summaries: true,
            streams: true
        };

        httpPostAsync(POST_QUERY_URL, streamQuery, function(data) {
            // console.log(data);
            let key = JSON.parse(data),
                streamURL = `${KEY_QUERY_URL}${key}`;

            // window.open(streamURL, target="_blank");
            readStream(streamURL, activityIds.length, updateLayers);
        });

    });
}


    function updateLayers(msg) {
        // optional auto-zoom
        if ($("#autozoom:checked").val()){
            let totalBounds = getBounds(Object.keys(appState.items));

            if (totalBounds.isValid()){
                map.fitBounds(totalBounds);
            }
        }

        let num =  Object.keys(appState.items).length,
            msg2 = " " + msg + " " + num  + " activities rendered.";
        $(".data_message").html(msg2);


        // initialize or update DotLayer
        if (DotLayer) {
            DotLayer.reset();
            !appState.paused && DotLayer.animate();
        } else {
            initializeDotLayer();
        }

        // render the activities table
        atable.clear();
        atable.rows.add(Object.values(appState.items)).draw();
    }



function readStream(streamURL, numActivities=null, callback=null) {
    let msgBox = L.control.window(map,
            {
                position: 'top',
                content:"<div class='data_message'></div><div><progress class='progbar' id='box'></progress></div>",
                visible:true
        }),
        progress_bars = $('.progbar'),
        rendering = true,
        listening = true,
        source = new EventSource(streamURL),
        count = 0;

    $(".data_message").html("Rendering activities...");

    $('#abortButton').click(function(){
        stopListening();
        doneRendering("<font color='red'>Aborted:</font>");
    }).show();

    $(".progbar").show();
    $('#renderButton').prop('disabled', true);

    function doneRendering(msg){
        if (rendering) {
            appState['date1'] = $("#date1").val();
            appState["date2"] = $("#date2").val();
            updateState();


            $("#abortButton").hide();
            $(".progbar").hide();
            try {
                msgBox.close();
            }
            catch(err) {
                console.log(err.message);
            }
            rendering = false;

            callback && callback(msg);
        }
    }


    function stopListening() {
        if (listening){
            listening = false;
            source.close();
            $('#renderButton').prop('disabled', false);
        }
    }


    // TODO: don't forget to deal with the case where
    //      limit > number of available activities

    // handle one incoming chunk from SSE stream
    source.onmessage = function(event) {
        if (event.data == 'done') {
            stopListening();
            doneRendering("Finished.");
            return;
        }

        let A = JSON.parse(event.data);

        if (A.error){
            let msg = `<font color='red'>${A.error}</font><br>`;
            $(".data_message").html(msg);
            console.log(`Error activity ${A.id}: ${A.error}`);
            return;

        } else if (A.msg) {
            $(".data_message").html(A.msg);
            return;

        } else if (A.stop_rendering){
            doneRendering("Done rendering.");
            return;
        }

        // At this point we know A is an activity object, not a message
        let hasBounds = A.bounds,
            bounds = hasBounds?
                L.latLngBounds(A.bounds.SW, A.bounds.NE) : L.latLngBounds();

        if (A.polyline){
            let latLngArray = L.PolylineUtil.decode(A.polyline);

            if (A.time) {
                let len = latLngArray.length,
                    latLngTime = new Float32Array(3*len),
                    timeArray = streamDecode(A.time);

                for (let i=0, ll; i<len; i++) {
                    ll = latLngArray[i];

                    if (!hasBounds){
                        bounds.extend(ll);
                    }

                    idx = i*3;
                    latLngTime[idx] = ll[0];
                    latLngTime[idx+1] = ll[1];
                    latLngTime[idx+2] = timeArray[i];
                }

                A.latLngTime = latLngTime;
            }
        }



        A.startTime = moment(A.ts_UTC || A.ts_local ).valueOf()
        A.bounds = bounds;

        delete A.summary_polyline;
        delete A.polyline;
        delete A.time;

        // only add A to appState.items if it isn't already there
        if (!(A.id in appState.items)) {
            appState.items[A.id] = A;
        }

        count++;
        if (numActivities) {
            progress_bars.val(count/numActivities);
            $(".data_message").html("imported " + count+"/"+numActivities);
        } else {
             $(".data_message").html("imported " + count+"/?");
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


    params["c1"] = Math.round(DotLayer.C1);
    params["c2"] = Math.round(DotLayer.C2);
    params["sz"] = Math.round(DotLayer.dotScale);

    params["baselayer"] = appState.currentBaseLayer.name;

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
    // $("#normal-dotColor").val(DEFAULT_DOTCOLOR);

    $("#select_num").keypress(function(event) {
        if (event.which == 13) {
            event.preventDefault();
            renderLayers();
        }
    });

    $("#abortButton").hide();

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
            zoomToSelectedPaths();
        }
    });

    $(".datepick").on("change", function(){
        $(".preset").val("");
    });
    $(".preset").on("change", preset_sync);

    $("#renderButton").click(renderLayers);
    $("#render-selection-button").click(openSelected);

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

