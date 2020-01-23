'use strict';

if (window.location.protocol == "https:") {
      WS_SCHEME = "wss://";
    } else {
      WS_SCHEME = "ws://";
    };
    
(function() {
    const SPEED_SCALE = 5.0,
          SEP_SCALE = {m: 0.14, b: 15.0},
          WEBSOCKET_URL = WS_SCHEME+window.location.host+"/data_socket";

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
            "MapBox.Dark": L.tileLayer.provider('MapBox', {
                id: 'mapbox.dark',
                accessToken: MAPBOX_ACCESS_TOKEN
            }),
            "MapBox.Streets": L.tileLayer.provider('MapBox', {
                id: 'mapbox.streets',
                accessToken: MAPBOX_ACCESS_TOKEN
            }),
            "MapBox.Streets-Basic": L.tileLayer.provider('MapBox', {
                id: 'mapbox.streets-basic',
                accessToken: MAPBOX_ACCESS_TOKEN
            }),
            "MapBox.Satellite": L.tileLayer.provider('MapBox', {
                id: 'mapbox.satellite',
                accessToken: MAPBOX_ACCESS_TOKEN
            }),

            "Esri.WorldImagery": L.tileLayer.provider("Esri.WorldImagery"),
            "Esri.NatGeoWorldMap": L.tileLayer.provider("Esri.NatGeoWorldMap"),
            "Stamen.Terrain": L.tileLayer.provider("Stamen.Terrain"),
            "Stamen.TonerLite": L.tileLayer.provider("Stamen.TonerLite"),
            "CartoDB.Positron": L.tileLayer.provider("CartoDB.Positron"),
            "CartoDB.DarkMatter": L.tileLayer.provider("CartoDB.DarkMatter")
        };

        Object.assign(baseLayers, online_baseLayers);

        if (map_providers.length) {
            for (var i = 0; i < map_providers.length; i++) {
                let provider = map_providers[i];
                if (!baseLayers[provider]) {
                    try {
                            baseLayers[provider] = L.tileLayer.provider(provider);
                    }
                    catch(err) {
                        // do nothing if the user-supplied baselayer is not valid
                    }
                }
                if (i==0 && baseLayers[provider]) default_baseLayer = baseLayers[provider];
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

    map.getPane('tilePane').style.opacity = 0.8;

    appState.currentBaseLayer = default_baseLayer;
    map.on('baselayerchange', function (e) {
        appState.currentBaseLayer = e.layer;
        updateState();
    });

    // Define a watermark control
    L.Control.Watermark = L.Control.extend({

        onAdd: function(map) {
            let img = L.DomUtil.create('img');

            img.src = this.options.image;
            img.style.width = this.options.width;
            img.style.opacity = this.options.opacity;
            return img;
        }
    });

    L.control.watermark = function(opts) {
        return new L.Control.Watermark(opts);
    }


    let sidebarControl = L.control.sidebar('sidebar').addTo(map),
        layerControl = L.control.layers(baseLayers, null, {position: 'topleft'}).addTo(map),
        zoomControl = map.zoomControl.setPosition('bottomright'),
        fps_display = ADMIN? L.control.fps().addTo(map) : null,
        stravaLogo = L.control.watermark({ image: "static/pbs4.png", width: '20%', opacity:'0.5', position: 'bottomleft' }).addTo(map),
        heatflaskLogo = L.control.watermark({ image: "static/logo.png", opacity: '0.5', width: '20%', position: 'bottomleft' }).addTo(map),
        areaSelect;


    // Animation play/pause button
    let animation_button_states = [
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


    const selectControl = new L.SwipeSelect(options={}, doneSelecting=doneSelecting),
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
    const capture_button_states = [
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

                let center = areaSelect.getBounds().getCenter(),
                    zoom = map.getZoom();
                console.log(`center: `, center);
                console.log(`width = ${w}, height = ${h}, zoom = ${zoom}`);


                DotLayer.captureCycle(selection=selection, callback=function(){
                    btn.state('idle');
                    areaSelect.remove();
                    if (!ADMIN && !OFFLINE) {
                        // Record this to google analytics
                        let cycleDuration = Math.round(DotLayer.periodInSecs() * 1000);
                        try{
                            ga('send', 'event', {
                                eventCategory: USER_ID,
                                eventAction: 'Capture-GIF',
                                eventValue: cycleDuration
                            });
                        }
                        catch(err){
                            //
                        }

                    }
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
    let captureControl = L.easyButton({
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
                    DotLayer.drawDotLayer(DotLayer._timePaused);
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
                    DotLayer.drawDotLayer(DotLayer._timePaused);
                }
            },
            release: function() {
                updateState();
            }
    });

    $(".shadow-dial").knob({
            min: 0,
            max: 10,
            step: 0.01,
            width: "60",
            height: "60",
            cursor: 20,
            inline: true,
            displayInput: false,
            change: function (val) {
                if (!DotLayer) {
                    return;
                }
                if (this.$[0].id == "shadowHeight") {
                    DotLayer.options.dotShadows.y = val;
                } else {
                    DotLayer.options.dotShadows.blur = val + 2;
                }
                DotLayer._redraw(true);
            },

            release: function() {
                DotLayer._redraw(true);
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
                render: (data, type, row) => {
                    if ( type === 'display' || type === 'filter' ) {
                        return href( stravaActivityURL(row.id), row.tsLoc.toLocaleString());
                    } else 
                        return row.UTCtimestamp;
                }
            },

            { 
                title: "Type", 
                data: null,
                render: (A) => `<p style="color:${A.pathColor}">${A.type}</p>`
            },

            {
                title: `<i class="fa fa-arrows-h" aria-hidden="true"></i> (${DIST_LABEL})`,
                data: "total_distance",
                render: (A) => +(A / DIST_UNIT).toFixed(2)},
            {
                title: '<i class="fa fa-clock-o" aria-hidden="true"></i>',
                data: "elapsed_time",
                render: hhmmss
            },

            { 
                title: "Name", 
                data: null,
                render: (A) => `<p style="background-color:${A.dotColor}"> ${A.name}</p>`
            },
        
        ],

        imgColumn = {
            title: "<i class='fa fa-user' aria-hidden='true'></i>",
            data: "owner",
            render: formatUserId
        };

    let atable = $('#activitiesList').DataTable({
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


    let tableScroller = $('.dataTables_scrollBody');



    function updateShareStatus(status) {
        if (OFFLINE) return;

        console.log("updating share status.");
        const url = `${SHARE_STATUS_UPDATE_URL}?status=${status}`;
        httpGetAsync(url, function(responseText) {
            console.log(`response: ${responseText}`);
        });
    }



    function handle_table_selections( e, dt, type, indexes ) {
        let redraw = false,
            mapBounds = map.getBounds();

        if ( type === 'row' ) {
            let rows = atable.rows( indexes ).data();
             for ( let A of Object.values(rows) ) {
                A.selected = !A.selected;
                A.highlighted = !A.highlighted;
                redraw |= mapBounds.overlaps(A.bounds);
            }
        }

        redraw && DotLayer && DotLayer._redraw();

        if ( domIdProp("zoom-to-selection", 'checked') ) {
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
        let selection_bounds = L.latLngBounds();
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
                        `<b>${A.name}</b><br>${A.type}:&nbsp;${A.tsLoc}<br>`+
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
        DotLayer = new L.DotLayer(null, {
            startPaused: appState.paused
        });

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


        if (ONLOAD_PARAMS.shadows)
            domIdVal("shadows", "checked");
        $("#shadowHeight").val(DotLayer.options.dotShadows.y).trigger("change");
        $("#shadowBlur").val(DotLayer.options.dotShadows.blur).trigger("change");
        $("#shadows").prop("checked", DotLayer.options.dotShadows.enabled);
        domIdEvent("shadows", "change", (e) => {
            if (!DotLayer)
                return;
            DotLayer.options.dotShadows.enabled = e.target.checked;
            DotLayer._redraw();
        });

        setTimeout(function(){
            let T = DotLayer.periodInSecs().toFixed(2);
            $("#period-value").html(T);

            // Enable capture if period is less than CAPTURE_DURATION_MAX
            let cycleDuration = T,
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
                             DotLayer._redraw();
                        });
    }


    /* Rendering */
    function updateLayers(msg) {
        // optional auto-zoom
        if (domIdProp("autozoom", "checked")){
            let totalBounds = getBounds(Object.keys(appState.items));

            if (totalBounds.isValid()){
                map.fitBounds(totalBounds);
            }
        }

        let num =  Object.keys(appState.items).length,
            msg2 = " " + msg + " " + num  + " activities rendered.";
        $(".data_message").html(msg2);
        DotLayer.reset();
        // appState.paused || DotLayer.animate();
       

        // (re-)render the activities table
        atable.clear();
        atable.rows.add(Object.values(appState.items)).draw();

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
    }

    let sock, wskey;

    window.addEventListener('beforeunload', function (event) {
        if (navigator.sendBeacon) {
            if (wskey) {
                navigator.sendBeacon(BEACON_HANDLER_URL, wskey);
            }
            navigator.sendBeacon(BEACON_HANDLER_URL, ONLOAD_PARAMS.client_id);
        }
        if (sock && sock.readyState == 1) {
            sock.send(JSON.stringify({close: 1}));
            sock.close()
        }
    });

    function renderLayers(query={}) {
        const date1 = domIdVal("date1"),
              date2 = domIdVal("date2"),
              type = domIdVal("select_type"),
              num = domIdVal("select_num"),
              idString = domIdVal("activity_ids"),
              to_exclude = Object.keys(appState.items).map(Number);

        // console.log(`exclude ${to_exclude.length} activities`, to_exclude);

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

        let progress_bars = $('.progbar'),
            rendering = true,
            listening = true,
            numActivities = 0,
            count = 0;

        if (!sock || sock.readyState > 1) {
            sock = new PersistentWebSocket(WEBSOCKET_URL);
            sock.binaryType = 'arraybuffer';
        } else {
            sendQuery();
        }
        
        $(".data_message").html("Retrieving activity data...");

        $('#abortButton').click(function(){
            stopListening();
            doneRendering("<font color='red'>Aborted:</font>");
        });

        $('#abortButton').fadeIn();

        $(".progbar").fadeIn();
        $('#renderButton').prop('disabled', true);


        function doneRendering(msg){
            if (rendering) {
                appState['after'] = domIdVal("date1");
                appState["before"] = domIdVal("date2");
                updateState();

                // domIdShow("abortButton", false);
                $("#abortButton").fadeOut();
                $(".progbar").fadeOut();

                if (msgBox) {
                    msgBox.close();
                    msgBox = null;
                }

                rendering = false;
                updateLayers(msg);
            }
        }


        function stopListening() {
            console.log("stopListening called")
            if (listening){
                listening = false;
                sock.send(JSON.stringify({close: 1}));
                sock.close();
                if (navigator.sendBeacon && wskey) {
                    navigator.sendBeacon(BEACON_HANDLER_URL, wskey);
                }
                wskey = null;
                $('#renderButton').prop('disabled', false);
            }
        }


        function sendQuery() {
            queryObj = {
                client_id: ONLOAD_PARAMS.client_id
            };

            queryObj[USER_ID] = {
                    limit: (type == "activities")? Math.max(1, +num) : undefined,
                    after: date1? date1 : undefined,
                    before: (date2 && date2 != "now")? date2 : undefined,
                    activity_ids: idString?  Array.from(new Set(idString.split(/\D/).map(Number))): undefined,
                    exclude_ids: to_exclude.length?  to_exclude: undefined,
                    streams: true
            };

            let msg = JSON.stringify({query: queryObj});
            sock.send(msg);
        }

        sock.onopen = function(event) {
            console.log("socket open: ", event);
            if (rendering) sendQuery();
        }

        sock.onclose = function(event) {
            console.log(`socket ${wskey} closed:`, event);
        }

        // handle one incoming chunk from websocket stream
        sock.onmessage = function(event) {
            
            let A;

            try {
                A = msgpack.decode(new Uint8Array(event.data));
            } 
            catch(e) {
                console.log(event);
                console.log(event.data);
                console.log(e);
                return;
            }


            if (!A) {
                $('#renderButton').prop('disabled', false);
                doneRendering("Finished.");
                return;
            } else 

            if (!("_id" in A)) {

                if ("idx" in A)
                    $(".data_message").html(`indexing...${A.idx}`);
                
                else if ("count" in A)
                    numActivities += A.count;
                
                else if ("wskey" in A) 
                    wskey = A.wskey;
                
                else if ("delete" in A && A.delete.length) {
                    // delete all ids in A.delete
                    for (let id of A.delete) {
                        delete appState.items[id];
                    }
                    DotLayer.removeItems(A.delete);
                
                } else if ("done" in A) {
                    console.log("received done");
                    doneRendering("Done rendering.");
                    return;
                
                } else if ("error" in A) {
                    let msg = `<font color='red'>${A.error}</font><br>`;
                    $(".data_message").html(msg);
                    console.log(`Error: ${A.error}`);
                    return;
                } else if ("msg" in A) {
                    $(".data_message").html(A.msg);

                }
                
                return;
            }

            // only add A to appState.items if it isn't already there
            if (!(A._id in appState.items)) {
                if (!A.type)
                    return;

                let typeData = ATYPE_MAP[A.type.toLowerCase()];
                if  (!typeData) {
                    typeData = ATYPE_MAP["workout"];
                }
                appState.items[A.id] = Object.assign(A, typeData);

                let tup = A.ts;
                A.id = A._id;

                A.tsLoc = new Date((tup[0] + tup[1]*3600) * 1000);
                A.UTCtimestamp = tup[0];  
                A.bounds = L.latLngBounds(A.bounds.SW, A.bounds.NE);

                DotLayer.addItem(A.id, A.polyline, A.time, A.bounds, A.n);
                delete A._id;
                delete A.summary_polyline;
                delete A.ts;
            }

            count++;
            if (!(count % 5)) {
                if (numActivities) {
                    progress_bars.val(count/numActivities);
                    $(".data_message").html("imported " + count+"/"+numActivities);
                } else {
                     $(".data_message").html("imported " + count+"/?");
                }
            }

        }
    }

    function openActivityListPage(rebuild) {
        window.open(ACTIVITY_LIST_URL, "_blank")
    }

    function updateState(){
        let  params = {},
             type = domIdVal("select_type"),
             num = domIdVal("select_num"),
             ids = domIdVal("activity_ids");

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

        if (domIdProp("autozoom", 'checked')) {
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

        if (DotLayer["C1"]) params["c1"] = Math.round(DotLayer["C1"]);
        if (DotLayer["C2"]) params["c2"] = Math.round(DotLayer["C2"]);
        if (DotLayer["dotScale"]) params["sz"] = Math.round(DotLayer["dotScale"]);

        if (appState.currentBaseLayer.name)
            params["baselayer"] = appState.currentBaseLayer.name;

        var newURL = USER_ID + "?" + jQuery.param(params, true);
        window.history.pushState("", "", newURL);

        $(".current-url").val(newURL);
    }


    function preset_sync() {
        num = domIdVal("select_num"),
        type = domIdVal("select_type");

        if (type=="days"){
            $(".date_select").hide();
            domIdShow("id_select", false);
            domIdShow("num_select", true);
            domIdVal('date2', "now");
            let d = new Date();
            d.setDate(d.getDate()-num);
            dstr = d.toISOString().split('T')[0];
            domIdVal('date1', dstr);
        } else if (type=="activities") {
            $(".date_select").hide();
            domIdShow("id_select", false);
            domIdShow("num_select", true);
            domIdVal('date1', "");
            domIdVal('date2', "now");
        }
        else if (type=="activity_ids") {
            $(".date_select").hide();
            domIdShow("num_select", false);
            domIdShow("id_select", true);
        } else {
            $(".date_select").show();
            domIdVal("select_num", "");
            domIdShow("num_select", false);
            domIdShow("id_select", false);
        }

    }


    function domIdVal(id, val=null) {
        let domObj = document.getElementById(id);
        if (domObj) {
            if (val === null) {    
                return (domObj)? domObj.value : null; 
            } else {
                return domObj.value = val;
            }
        }
    }

    function domIdEvent(id, type, func) {
        let obj = document.getElementById(id);
        if (obj) {
            if (obj.addEventListener)
                obj.addEventListener(type, func, false);
            else
                console.log("sorry, I cannot work with this browser");
        }
    }

    function domIdProp(id, prop, val=null) {
        let domObj = document.getElementById(id);
        if (domObj) {
            if (val === null) { 
                return (domObj)? domObj[prop] : null; 
            } else {
                return domObj[prop] = val
            }
        }
    }

    function domIdShow(id, show=null) {
        let domObj = document.getElementById(id);
        if (domObj) {
            if (show === null) {
                return (domObj.style.display == "block");
            } else if (show)
                domObj.style.display = 'block';
            else
                domObj.style.display = 'none';
        }
    }

    // What to do when user changes to a different tab or window
    function handleVisibilityChange() {
        if (document.hidden) {
            let title = document.title;
            handleVisibilityChange.title = title;
            document.title = `${title} (paused)`;
            if (!appState.paused)
                DotLayer.pause();
        } else if (!appState.paused && DotLayer) {
            DotLayer.animate();
            document.title = handleVisibilityChange.title;

        }
    }


    $(document).ready(function() {
        document.onvisibilitychange = handleVisibilityChange;

        // activities table set-up
        domIdProp("zoom-to-selection", "checked", false);

        domIdEvent("zoom-to-selection", "change", function(){
            if ( domIdProp("zoom-to-selection", 'checked') ) {
                zoomToSelectedPaths();
            }
        });

        domIdEvent("render-selection-button", "click", openSelected);
        domIdEvent("clear-selection-button", "click", deselectAll);

        domIdEvent("select_num", "keypress", function(event) {
            if (event.which == 13) {
                event.preventDefault();
                renderLayers();
            }
        });

        domIdShow("abortButton", false);

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


        domIdEvent("autozoom", "change", updateState);

        domIdProp("share", "checked", SHARE_PROFILE);
        domIdEvent("share", "change", function() {
            let status = domIdProp("share", "checked")? "public":"private";
            updateShareStatus(status);
        });

        $(".datepick").on("change", function(){
            $(".preset").val("");
        });
        $(".preset").on("change", preset_sync);

        domIdEvent("renderButton", "click", renderLayers);

        domIdEvent("activity-list-buton", "click", () => openActivityListPage(false));

        domIdProp("autozoom", 'checked', ONLOAD_PARAMS.autozoom);

        if (ONLOAD_PARAMS.activity_ids) {
            domIdVal("activity_ids", ONLOAD_PARAMS.activity_ids);
            domIdVal("select_type", "activity_ids");
        } else if (ONLOAD_PARAMS.limit) {
            domIdVal("select_num", ONLOAD_PARAMS.limit);
            domIdVal("select_type", "activities");
        } else if (ONLOAD_PARAMS.preset) {
            domIdVal("select_num", ONLOAD_PARAMS.preset);
            domIdVal("select_type", "days");
            preset_sync();
        } else {
            domIdVal('date1', ONLOAD_PARAMS.date1);
            domIdVal('date2', ONLOAD_PARAMS.date2);
            domIdVal('preset', "");
        }
        
        initializeDotLayer();
        renderLayers();
        preset_sync();
    });

});