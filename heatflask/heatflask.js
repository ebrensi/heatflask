'use strict';

if (window.location.protocol == "https:") {
      WS_SCHEME = "wss://";
    } else {
      WS_SCHEME = "ws://";
    };

heatflask();

function heatflask() {
    const SPEED_SCALE = 5.0,
          SEP_SCALE = {m: 0.15, b: 15.0},
          WEBSOCKET_URL = WS_SCHEME+window.location.host+"/data_socket",
          appState = {
            paused: ONLOAD_PARAMS.start_paused,
            items: new Map(),
            currentBaseLayer: null
          };

    // Set up Map and layers
    const map_providers = ONLOAD_PARAMS.map_providers,
          baseLayers = {"None": L.tileLayer("")};
    let default_baseLayer = baseLayers["None"];
        
    if (!OFFLINE) {
        const online_baseLayers = {
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

    // ?? look into this
    for (const name in baseLayers) {
        let basemap = baseLayers[name];
        basemap.name = name;
    }

    let msgBox = null;

    const map = L.map('map', {
            center: ONLOAD_PARAMS.map_center,
            zoom: ONLOAD_PARAMS.map_zoom,
            layers : [ default_baseLayer ],
            preferCanvas: true,
            zoomAnimation: false
          }),

          dotLayer = L.dotLayer({
            startPaused: appState.paused,
            dotWorkerUrl: DOTLAYER_WORKER_URL,
            gifWorkerUrl: GIFJS_WORKER_URL
          }).addTo(map);

    appState.currentBaseLayer = default_baseLayer;
    map.on('baselayerchange', function (e) {
        appState.currentBaseLayer = e.layer;
        updateState();
    });

    // map.getPane('tilePane').style.opacity = 0.8;

    
    const controls = {
        _sidebarControl: L.control.sidebar('sidebar').addTo(map),
        _layerControl: L.control.layers(baseLayers, null, {position: 'topleft'}).addTo(map),
        _zoomControl: map.zoomControl.setPosition('bottomright'),
        _stravaLogo: L.control.watermark({ image: "static/pbs4.png", width: '20%', opacity:'0.5', position: 'bottomleft' }).addTo(map),
        _heatflaskLogo: L.control.watermark({image: "static/logo.png", opacity: '0.5', width: '20%', position: 'bottomleft' }).addTo(map),
        areaSelect: L.areaSelect({width:200, height:200})
    };

    const button_states = [
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
                if (dotLayer) {
                    dotLayer.animate();
                }
                updateState();
                btn.state('animation-running');
            }
        }
    ];

    // Animation play/pause button
    controls._animationControl =  L.easyButton({
        states: appState.paused? button_states.reverse() : button_states 
    }).addTo(map);    

    // Select-activities-in-region functionality
    function doneSelecting(obj) {
        dotLayer && dotLayer.setSelectRegion(obj.pxBounds, callback=function(ids){
            if (controls.selectControl && controls.selectControl.canvas) {
                controls.selectControl.remove();
                controls.selectButton.state("not-selecting");
            }

            // handle_path_selections returns the id of the single
            // selected activity if only one is selected
            const id = handle_path_selections(ids);

            if (id) {
                const A = appState.items.get(id),
                    loc = A.bounds.getCenter();

                setTimeout(function (){
                    activityDataPopup(id, loc);
                }, 100);
            }
        });

    }

    // set hooks for ctrl-drag
    map.on("boxhookend", doneSelecting);


    controls.selectControl = new L.SwipeSelect({}, doneSelecting);
    
    selectButton_states = [
        {
            stateName: 'not-selecting',
            icon: 'fa-object-group',
            title: 'Toggle Path Selection',
            onClick: function(btn, map) {
                btn.state('selecting');
                controls.selectControl.addTo(map);
            },
        },
        {
            stateName: 'selecting',
            icon: '<span>&cross;</span>',
            title: 'Stop Selecting',
            onClick: function(btn, map) {
                btn.state('not-selecting');
                controls.selectControl.remove();
            }
        },
    ];
    
    controls.selectButton = L.easyButton({
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
                if (!dotLayer) {
                    return;
                }
                let size = map.getSize();
                areaSelect = 
                controls.areaSelect._width = ~~(0.8 * size.x);
                controls.areaSelect._height = ~~(0.8 * size.y);
                controls.areaSelect.addTo(map);
                btn.state('selecting');
            }
        },
        {
            stateName: 'selecting',
            icon: 'fa-expand',
            title: 'Select Capture Region',
            onClick: function (btn, map) {
                let size = map.getSize(),
                    w = controls.areaSelect._width,
                    h = controls.areaSelect._height,
                    topLeft = {
                        x: Math.round((size.x - w) / 2),
                        y: Math.round((size.y - h) / 2)
                    },

                    selection = {
                        topLeft: topLeft,
                        width: w,
                        height: h
                    };

                let center = controls.areaSelect.getBounds().getCenter(),
                    zoom = map.getZoom();
                console.log(`center: `, center);
                console.log(`width = ${w}, height = ${h}, zoom = ${zoom}`);


                dotLayer.captureCycle(selection=selection, callback=function(){
                    btn.state('idle');
                    controls.areaSelect.remove();
                    if (!ADMIN && !OFFLINE) {
                        // Record this to google analytics
                        let cycleDuration = Math.round(dotLayer.periodInSecs() * 1000);
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
                if (dotLayer && dotLayer._capturing) {
                    dotLayer.abortCapture();
                    controls.areaSelect.remove();
                    btn.state('idle');
                }
            }
        }
    ];


    // Capture control button
    controls.captureControl = L.easyButton({
        states: capture_button_states
    });
    controls.captureControl.enabled = false;


    // set up dial-controls
    $(".dotconst-dial").knob({
        min: 0,
        max: 100,
        step: 0.1,
        width: "140",
        height: "140",
        cursor: 20,
        inline: true,
        displayInput: false,
        change: function (val) {
            let newVal;
            if (this.$[0].id == "sepConst") {
                newVal = Math.pow(2, val * SEP_SCALE.m + SEP_SCALE.b);
                dotLayer.updateDotSettings({C1: newVal});
            } else {
                newVal = val * val * SPEED_SCALE;
                dotLayer.updateDotSettings({C2: newVal});;
            }

            // Enable capture if period is less than CAPTURE_DURATION_MAX
            let cycleDuration = dotLayer.periodInSecs().toFixed(2),
                captureEnabled = controls.captureControl.enabled;

            $("#period-value").html(cycleDuration);
            if (cycleDuration <= CAPTURE_DURATION_MAX) {
                if (!captureEnabled) {
                    controls.captureControl.addTo(map);
                    controls.captureControl.enabled = true;
                }
            } else if (captureEnabled) {
                controls.captureControl.removeFrom(map);
                controls.captureControl.enabled = false;
            }
        },
        release: function() {
            updateState();
        }
    });

    $(".dotconst-dial-small").knob({
        min: 0.01,
        max: 10,
        step: 0.01,
        width: "100",
        height: "100",
        cursor: 20,
        inline: true,
        displayInput: false,
        change: function (val) {
            if (this.$[0].id == "dotScale")
                dotLayer.updateDotSettings({dotScale: val});
            else {
                dotLayer.updateDotSettings({alphaScale: val / 10});
                dotLayer.drawPaths();
            }
        },
        release: function() {
            updateState();
        }
    });

    // $(".shadow-dial").knob({
    //         min: 0,
    //         max: 10,
    //         step: 0.01,
    //         width: "60",
    //         height: "60",
    //         cursor: 20,
    //         inline: true,
    //         displayInput: false,
    //         change: function (val) {
    //             if (!dotLayer) return;

    //             if (this.$[0].id == "shadowHeight")
    //                 dotLayer.updateDotSettings(null, {"y": val});
    //             else 
    //                 dotLayer.updateDotSettings(null, {"blur": val+2});
    //         },

    //         release: function() {
    //             dotLayer._redraw(true);
    //         }
    // });


    if (FLASH_MESSAGES.length > 0) {
        let msg = "<ul class=flashes>";
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

    const atable = $('#activitiesList').DataTable({
                    paging: false,
                    deferRender: true,
                    scrollY: "60vh",
                    scrollX: true,
                    scrollCollapse: true,
                    order: [[ 0, "desc" ]],
                    select: isMobileDevice()? "multi" : "os",
                    data: appState.items.values(),
                    rowId: "id",
                    columns: tableColumns
                }).on( 'select', handle_table_selections)
                  .on( 'deselect', handle_table_selections);


    const tableScroller = $('.dataTables_scrollBody');



    function updateShareStatus(status) {
        if (OFFLINE) return;
        const url = `${SHARE_STATUS_UPDATE_URL}?status=${status}`;
        httpGetAsync(url, function(responseText) {
            console.log(`response: ${responseText}`);
        });
    }



    function handle_table_selections( e, dt, type, indexes ) {
        let redraw = false;
        const mapBounds = map.getBounds(),
              selections = {};

        if ( type === 'row' ) {
            const rows = atable.rows( indexes ).data();
             for ( const A of Object.values(rows) ) {
                if (!A.id)
                    break;
                A.selected = !A.selected;
                selections[A.id] = A.selected;
                if (!redraw)
                    redraw |= mapBounds.overlaps(A.bounds);
            }
        }

        if ( domIdProp("zoom-to-selection", 'checked') )
            zoomToSelectedPaths();

        dotLayer.setItemSelect(selections);
    }

    function handle_path_selections(ids) {
        if (!ids) return;

        const toSelect = [],
              toDeSelect = [];

        let count = 0,
            id;

        for (id of ids) {
            const A = appState.items.get(id),
                  tag = `#${A.id}`;
            if (A.selected)
                toDeSelect.push(tag);
            else 
                toSelect.push(tag);

            count++;
        }

        // simulate table (de)selections
        // note that table selection events get triggered
        // either way
        atable.rows(toSelect).select();
        atable.rows(toDeSelect).deselect();

        if (toSelect.length == 1) {
            let row = $(toSelect[0]);
            tableScroller.scrollTop(row.prop('offsetTop') - tableScroller.height()/2);
        }

        if (count === 1)
            return id
    }


    function zoomToSelectedPaths(){
        // Pan-Zoom to fit all selected activities
        let selection_bounds = L.latLngBounds();
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



    function pauseFlow(){
        dotLayer.pause();
        appState.paused = true;
    }

    function resumeFlow(){
        appState.paused = false;
        if (dotLayer) {
            dotLayer.animate();
        }
    }


    function activityDataPopup(id, latlng){
        let A = appState.items.get(id),
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

        const popup = L.popup()
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
        const bounds = L.latLngBounds();
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

        $("#sepConst").val((Math.log2(ds["C1"]) - SEP_SCALE.b) / SEP_SCALE.m ).trigger("change");
        $("#speedConst").val(Math.sqrt(ds["C2"]) / SPEED_SCALE).trigger("change");
        $("#dotScale").val(ds["dotScale"]).trigger("change");
        $("#dotAlpha").val(ds["dotAlpha"]).trigger("change");


        if (ONLOAD_PARAMS.shadows)
            domIdVal("shadows", "checked");
        $("#shadowHeight").val(dotLayer.options.dotShadows.y).trigger("change");
        $("#shadowBlur").val(dotLayer.options.dotShadows.blur).trigger("change");
        $("#shadows").prop("checked", dotLayer.options.dotShadows.enabled);
        
        domIdEvent("shadows", "change", (e) => {
            dotLayer.updateDotSettings(null, {"enabled": e.target.checked})
        });

        $("#showPaths")
            .prop("checked", dotLayer.options.showPaths)
            .on("change", function(){
                 dotLayer.options.showPaths = $(this).prop("checked");
                 dotLayer._redraw();
        });

        dotLayer.updateDotSettings(ds);
    }


    /* Rendering */
    function updateLayers(msg) {
        if (domIdProp("autozoom", "checked")){
            let totalBounds = getBounds(appState.items.keys());

            if (totalBounds.isValid()){
                map.fitBounds(totalBounds);
            }
        }

        const num = appState.items.size;
        $(".data_message").html(` ${msg} ${num} activities rendered.`);       

        // (re-)render the activities table
        atable.clear();
        atable.rows.add(Array.from(appState.items.values())).draw();

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
        const ds = dotLayer.getDotSettings();
        let T = dotLayer.periodInSecs().toFixed(2);
        $("#period-value").html(T).trigger("change");
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
              to_exclude = Array.from(appState.items.keys()).map(Number);

        // create a status box
        msgBox = L.control.window(map, {
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
        } else
            sendQuery();
        
        $(".data_message").html("Retrieving activity data...");

        $('#abortButton').click(function(){
            stopListening();
            doneRendering("<font color='red'>Aborted:</font>");
        });

        $('#abortButton').fadeIn();

        $(".progbar").fadeIn();
        $('#renderButton').prop('disabled', true);


        function doneRendering(msg) {

            if (!rendering)
                return;

            appState['after'] = domIdVal("date1");
            appState["before"] = domIdVal("date2");
            updateState();

            $("#abortButton").fadeOut();
            $(".progbar").fadeOut();

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
            if (navigator.sendBeacon && wskey) {
                navigator.sendBeacon(BEACON_HANDLER_URL, wskey);
            }
            wskey = null;
            $('#renderButton').prop('disabled', false);
            
        }


        function sendQuery() {
            const queryObj = {
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
            // console.log("socket open: ", event);
            if (rendering) sendQuery();
        }

        sock.onclose = function(event) {
            // console.log(`socket ${wskey} closed:`, event);
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
                    for (let id of A.delete)
                        appState.items.delete(id);
                    dotLayer.removeItems(A.delete);
                
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
            if ( !appState.items.has(A._id) ) {
                if (!A.type)
                    return;

                let typeData = ATYPE_MAP[A.type.toLowerCase()] || ATYPE_MAP["workout"];
                Object.assign(A, typeData);
                A.id = A._id;
                delete A._id;

                const tup = A.ts;
                delete A.ts;
                
                A.tsLoc = new Date((tup[0] + tup[1]*3600) * 1000);
                A.UTCtimestamp = tup[0];

                A.bounds = L.latLngBounds(A.bounds.SW, A.bounds.NE);
                
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
                    progress_bars.val(count/numActivities);
                    $(".data_message").html("imported " + count+"/"+numActivities);
                } else {
                     $(".data_message").html("imported " + count+"/?");
                }
            }

        }
    }

    function openActivityListPage() {
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

        if (dotLayer) {
            ds = dotLayer.getDotSettings();

            params["c1"] = Math.round(ds["C1"]);
            params["c2"] = Math.round(ds["C2"]);
            params["sz"] = Math.round(ds["dotScale"]);
        }

        if (appState.currentBaseLayer.name)
            params["baselayer"] = appState.currentBaseLayer.name;

        const newURL = USER_ID + "?" + jQuery.param(params, true);
        window.history.pushState("", "", newURL);

        $(".current-url").val(newURL);
    }


    function preset_sync() {
        const num = domIdVal("select_num"),
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
        const domObj = document.getElementById(id);
        if (domObj) {
            if (val === null) {    
                return (domObj)? domObj.value : null; 
            } else {
                return domObj.value = val;
            }
        }
    }

    function domIdEvent(id, type, func) {
        const obj = document.getElementById(id);
        if (obj) {
            if (obj.addEventListener)
                obj.addEventListener(type, func, false);
            else
                console.log("sorry, I cannot work with this browser");
        }
    }

    function domIdProp(id, prop, val=null) {
        const domObj = document.getElementById(id);
        if (domObj) {
            if (val === null) { 
                return (domObj)? domObj[prop] : null; 
            } else {
                return domObj[prop] = val
            }
        }
    }

    function domIdShow(id, show=null) {
        const domObj = document.getElementById(id);
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
            if (!appState.paused)
                dotLayer.pause();
        } else if (!appState.paused && dotLayer) {
            dotLayer.animate();

        }
    }


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
    
    initializedotLayer();
    renderLayers();
    preset_sync();
};
