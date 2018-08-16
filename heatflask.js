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
    },
    msgBox = null;

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
        "Google.Hybrid": L.gridLayer.googleMutant({type: 'hybrid'})
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

for (let name in baseLayers) {
    let basemap = baseLayers[name];
    basemap.name = name;
}


var map = L.map('map', {
        center: ONLOAD_PARAMS.map_center,
        zoom: ONLOAD_PARAMS.map_zoom,
        layers : [ default_baseLayer ],
        preferCanvas: true,
        zoomAnimation: false
    });

map.getPane('tilePane').style.opacity = 0.9;

appState.currentBaseLayer = default_baseLayer;
map.on('baselayerchange', function (e) {
    appState.currentBaseLayer = e;
    updateState();
});

// Define a watermark control
L.Control.Watermark = L.Control.extend({

    onAdd: function(map) {
        var img = L.DomUtil.create('img');

        img.src = this.options.image;
        img.style.width = this.options.width;
        img.style.opacity = this.options.opacity;
        return img;
    },

    onRemove: function(map) {
        // Nothing to do here
    }
});

L.control.watermark = function(opts) {
    return new L.Control.Watermark(opts);
}


var sidebarControl = L.control.sidebar('sidebar').addTo(map),
    layerControl = L.control.layers(baseLayers, null, {position: 'topleft'}).addTo(map),
    zoomControl = map.zoomControl.setPosition('bottomright'),
    fps_display = ADMIN? L.control.fps().addTo(map) : null,
    stravaLogo = L.control.watermark({ image: "static/pbs4.png", width: '100px', opacity:'0.5', position: 'bottomleft' }).addTo(map),
    heatflaskLogo = L.control.watermark({ image: "static/logo.png", opacity: '0.5', width: '100px', position: 'bottomleft' }).addTo(map),
    areaSelect;


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




// Select-activities-in-region functionality
function doneSelecting(obj){

    DotLayer && DotLayer.setSelectRegion(obj.pxBounds, callback=function(ids){
        if (selectControl && selectControl.canvas) {
            selectControl.remove();
            selectButton.state("not-selecting");
        }
        handle_path_selections(ids);

         if (ids.length == 1) {
            let id = ids[0],
                A = appState.items[id];
            if (!A.selected){
                return;
            }
            let loc = obj.latLngBounds.getCenter();
            setTimeout(function (){
                activityDataPopup(ids, loc);
            }, 100);
        }
    });

}

// set hooks for ctrl-drag
map.on("boxhookend", doneSelecting);


var selectControl = new L.SwipeSelect(options={}, doneSelecting=doneSelecting),
    selectButton_states = [
        {
            stateName: 'not-selecting',
            icon: 'fa-object-group',
            title: 'Toggle Path Selection',
            onClick: function(btn, map) {
                btn.state('selecting');
                selectControl.addTo(map);
            },
        },
        {
            stateName: 'selecting',
            icon: '<span>&cross;</span>',
            title: 'Stop Selecting',
            onClick: function(btn, map) {
                btn.state('not-selecting');
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
let tableColumns = [
    {
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
        render: hhmmss
    },

    // { title: "Name", data: "name"},
    { 
        title: "Name", 
        data: null,
        render: (data) => `<p style="background-color:${data.dotColor}"> ${data.name}</p>`
    },

    {
        title: '<i class="fa fa-users" aria-hidden="true"></i>',
        data: "group",
        render:  formatGroup
    }],

    imgColumn = {
        title: "<i class='fa fa-user' aria-hidden='true'></i>",
        data: "owner",
        render: formatUserId
    };

if (ONLOAD_PARAMS.group) {
    tableColumns = [imgColumn].concat(tableColumns);
}

var atable = $('#activitiesList').DataTable({
                paging: false,
                deferRender: true,
                scrollY: "60vh",
                scrollX: true,
                scrollCollapse: true,
                order: [[ 0, "desc" ]],
                select: isMobileDevice()? "multi" : "os",
                data: Object.values(appState.items),
                rowId: "id",
                columns: tableColumns
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
        let items = atable.rows( indexes ).data();
         for (let i=0; i<items.length; i++) {
            let A = items[i];
            A.selected = !A.selected;
            A.highlighted = !A.highlighted;
        }
    }

    DotLayer && DotLayer._onLayerDidMove();

    if ( $("#zoom-to-selection").is(':checked') ) {
        zoomToSelectedPaths();
    }
}

function handle_path_selections(ids) {
    if (!ids.length) {
        return;
    }

    let toSelect = [],
        toDeSelect = [];

    for (let i=0; i<ids.length; i++) {
        let A = appState.items[ids[i]],
            tag = "#"+A.id;
        if (A.selected) {
            toDeSelect.push(tag);
        } else {
            toSelect.push(tag);
        }
    }

    // simulate table (de)selections
    atable.rows(toSelect).select();
    atable.rows(toDeSelect).deselect();

    if (toSelect.length == 1) {
        let row = $(toSelect[0]);
        tableScroller.scrollTop(row.prop('offsetTop') - tableScroller.height()/2);
    }
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

function deselectAll(){
    handle_path_selections(selectedIDs());
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


function activityDataPopup(id, latlng){
    let A = appState.items[id],
        d = A.total_distance,
        elapsed = hhmmss(A.elapsed_time),
        v = A.average_speed,
        dkm = +(d / 1000).toFixed(2),
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
                    `<b>${A.name}</b><br>${A.type}:&nbsp;${A.ts_local}<br>`+
                    `${dkm}&nbsp;km&nbsp;(${dmi}&nbsp;mi)&nbsp;in&nbsp;${elapsed}<br>${vkm}&nbsp;(${vmi})<br>` +
                    `View&nbsp;in&nbsp;<a href='https://www.strava.com/activities/${A.id}' target='_blank'>Strava</a>`+
                    `,&nbsp;<a href='${BASE_USER_URL}?id=${A.id}'&nbsp;target='_blank'>Heatflask</a>`
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

    let itemsList = Object.values( appState.items ),
        numItems = itemsList.length;

    DotLayer._colorPalette = colorPalette(numItems, DotLayer.options.dotAlpha);
    for ( let i = 0; i < numItems; i++ ) {
        itemsList[ i ].dotColor = DotLayer._colorPalette[ i ];
    }


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
        DotLayer._mapMoving = true;
    }

    // create a status box
    msgBox = L.control.window(map,{
            position: 'top',
            content:"<div class='data_message'></div><div><progress class='progbar' id='box'></progress></div>",
            visible:true
    });

    $(".data_message").html("Retrieving activity data...");

    // Handle explicitly given query-key
    if (ONLOAD_PARAMS.key){
        streamURL = `${KEY_QUERY_URL}${ONLOAD_PARAMS.key}`;
        readStream(streamURL, null, updateLayers);
        return;
    }

    // Handle group-activity case
    if (type=="grouped_with") {
        // window.open(GROUP_ACTIVITY_SSE, target="_blank");
        let group = $("#activity_ids").val();
        readStream(GROUP_ACTIVITY_SSE + group, null, updateLayers);
        return;
    }


    // We will load in new items that aren't already in appState.items,
    //  and delete whatever is left.
    let inClient = new Set(Object.keys(appState.items).map(Number));

    // Handle given activity_ids case
    if (idString) {
        let streamQuery = {},
            activityIds = idString.split(/\D/).map(Number);

        let activityIdSet = new Set(activityIds);

        // delete all items that aren't in activityIds from appState.items
        for (let item of inClient) {
            if (!activityIdSet.has(item))
            delete appState.items[item];
        }

        // filter activityIds to get only ones we don't already have
        activityIds = activityIds.filter((id) => !inClient.has(id));

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

    // First we request only ids of activities for a given query
    activityQuery = {
        limit: (type == "activities")? Math.max(1, +num) : undefined,
        after: date1? date1 : undefined,
        before: (date2 && date2 != "now")? date2 : undefined,
        only_ids: true
    }

    let url = QUERY_URL_JSON + "?" + jQuery.param(activityQuery);
    httpGetAsync(url, function(data) {
        let queryResult = JSON.parse(data)[0];

        // TODO: Handle the case where the index is currently being built
        //   by another client

        // handle the case where there is no index for this user
        if (queryResult == "build") {
            activityQuery["only_ids"] = false;
            activityQuery["summaries"] = true;
            activityQuery["streams"] = true;

            // TODO: handle the unlikely case where there are items already in
            //  appState.items and the user's index doesn't exist because
            //  it got deleted.

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

        // filter activityIds to get only ones we don't already have
        activityIds = queryResult.filter((id) => !inClient.has(id));


        // If we already have all the activities we wanted then we're done
        if (!activityIds.length){
            updateLayers("Done. ");

            appState['after'] = $("#date1").val();
            appState["before"] = $("#date2").val();
            updateState();

            if (msgBox) {
                msgBox.close();
                msgBox = null;
            }
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
        // !appState.paused && DotLayer.animate();
    } else {
        initializeDotLayer();
    }

    // (re-)render the activities table
    atable.clear();
    atable.rows.add(Object.values(appState.items)).draw();
}



function readStream(streamURL, numActivities=null, callback=null) {
    let progress_bars = $('.progbar'),
        rendering = true,
        listening = true,
        source = new EventSource(streamURL),
        count = 0;

    $(".data_message").html("Retrieving activity data...");

    $('#abortButton').click(function(){
        stopListening();
        doneRendering("<font color='red'>Aborted:</font>");
    }).show();

    $(".progbar").show();
    $('#renderButton').prop('disabled', true);

    function doneRendering(msg){
        if (rendering) {
            appState['after'] = $("#date1").val();
            appState["before"] = $("#date2").val();
            updateState();


            $("#abortButton").hide();
            $(".progbar").hide();

            if (msgBox) {
                msgBox.close();
                msgBox = null;
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
    if (ONLOAD_PARAMS.key){
        return;
    }

    let  params = {},
         type = $("#select_type").val(),
         num = $("#select_num").val();

    if (type == "grouped_with") {
        params.group = +$("#activity_ids").val();;
    } else if(type == "activities") {
        params.limit = num;
    } else if (type == "activity_ids") {
        params.id = $("#activity_ids").val();
    } else if (type == "days") {
        params.preset = num;
    } else {
        if (appState.after) {
            params.after = appState.after;
        }
        if (appState.before && (appState.before != "now")) {
            params.before = appState.before;
        }
    }

    if (appState.paused){
        params.paused = "1";
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

    if (type=="grouped_with") {
        $(".date_select").hide();
        $("#num_select").hide();
        $("#id_select").show();

    } else if (type=="days"){
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

    // activities table set-up
    $("#zoom-to-selection").prop("checked", false);
    $("#zoom-to-selection").on("change", function(){
        if ( $("#zoom-to-selection").is(':checked')) {
            zoomToSelectedPaths();
        }
    });
    $("#render-selection-button").click(openSelected);
    $("#clear-selection-button").click(deselectAll);

    if (!ONLOAD_PARAMS.key) {
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

        $("#share").prop("checked", SHARE_PROFILE);
        $("#share").on("change", function() {
            let status = $("#share").is(":checked")? "public":"private";
            updateShareStatus(status);
        });

        $(".datepick").on("change", function(){
            $(".preset").val("");
        });
        $(".preset").on("change", preset_sync);

        $("#renderButton").click(renderLayers);


        $("#autozoom").prop('checked', ONLOAD_PARAMS.autozoom);

        if (ONLOAD_PARAMS.group) {
            $("#select_type").val("grouped_with");
            $("#activity_ids").val(ONLOAD_PARAMS.group);
            $("#activity_ids").prop("readonly", true);
        } else if (ONLOAD_PARAMS.activity_ids) {
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
    }

    renderLayers();
    preset_sync();
});

