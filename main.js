 <script>
        var map_providers = {{ baselayer|tojson|safe }},
            default_baseLayer,
            baseLayers = {
            "None": L.tileLayer(""),
            "Esri.WorldImagery": L.tileLayer.provider("Esri.WorldImagery"),
            "OpenStreetMap.Mapnik": L.tileLayer.provider("OpenStreetMap.Mapnik"),
            // valid Google types are 'roadmap', 'satellite', 'terrain' and 'hybrid'
            "Google.Roadmap":  L.gridLayer.googleMutant({type: 'roadmap'}),
            "Google.Terrain":  L.gridLayer.googleMutant({type: 'terrain'}),
            "Google.Hybrid": L.gridLayer.googleMutant({type: 'hybrid'})
        };


        const offline = ("{{ config['OFFLINE'] }}" == "True");

        if (offline) {
            default_baseLayer = baseLayers["None"];
        } else if (map_providers.length) {
            for (let i = 0; i < map_providers.length; i++) {
                provider = map_providers[i];
                let tl = L.tileLayer.provider(provider);
                baseLayers[provider] = tl;
                if (i==0) default_baseLayer = tl;
            }
        } else {
            default_baseLayer = baseLayers["Google.Terrain"];
        }

        var map = L.map('map',
                        {center: [{{ lat }}, {{ lng }}],
                         zoom: {{ zoom }},
                         layers : [ default_baseLayer ]
                  });


        var sidebar = L.control.sidebar('sidebar').addTo(map),
            zoomControl = map.zoomControl.setPosition('bottomright'),
            layerControl = L.control.layers(baseLayers, null, {position: 'topleft'}).addTo(map),
            locateControl = L.control.locate({position: "bottomright", icon: "fa fa-anchor"}).addTo(map);

         {% with messages = get_flashed_messages() %}
            {% if messages %}
              let msg = "<ul class=flashes>"

              {% for message in messages %}
                msg += "<li>{{ message }}</li>"
              {% endfor %}
              msg += "</ul>"
              L.control.window(map, {content:msg, visible:true});
            {% endif %}
        {% endwith %}


        var HeatLayer = false,
            FlowLayer = false;

        // This is where we store current state of the app
        var appState = {
            baseLayers: map_providers
        };


        function renderLayers(){
            const heatLayerOptions = {{ config["HEATMAP_DEFAULT_OPTIONS"]|tojson|safe }},
                  flowLayerOptions = {{ config["ANTPATH_DEFAULT_OPTIONS"]|tojson|safe }},
                  flowLayerConsts = {{ config["FLOWPATH_VARIATION_CONSTANTS"]|tojson|safe }};

            const flowres = $("#flowres").val(),
                  heatres = $("#heatres").val(),
                  date1 = $("#date1").val(),
                  date2 = $("#date2").val(),
                  type = $("#select_type").val(),
                  num = $("#select_num").val();

            const lores = (flowres == "low" || heatres == "low"),
                  hires = (flowres == "high" || heatres == "high");

            let heat_data = false,
                flow_data = false,
                query = {};

            let latlngs_flat = [],
                bounds = L.latLngBounds();

            if (type == "activity_ids") query.id = $("#activity_ids").val();
            else if (type=="activities") {
                if (num == 0) query.limit = 1;
                else query.limit = num;
            } else {
                if (date1) query.date1 = date1;
                if (date2 && (date2 != "now")) query.date2 = date2;
            }

            if (hires) query.hires = hires;

            // *** Used for flowpath event listeners
            function hhmmss(secs) {
               return new Date(secs * 1000).toISOString().substr(11, 8);
            }
            // ****


            // Remove HeatLayer from map and control if it's there
            if (HeatLayer){
                map.removeLayer(HeatLayer);
                layerControl.removeLayer(HeatLayer);
                HeatLayer = false;
            }

            // Remove FlowLayer from map and control if it's there
            if (FlowLayer){
                map.removeLayer(FlowLayer);
                layerControl.removeLayer(FlowLayer);
                FlowLayer = false;
            }

            // Add new blank HeatLayer to map if specified
            if (heatres){
                HeatLayer = L.heatLayer(latlngs_flat, heatLayerOptions);
                map.addLayer(HeatLayer);
                layerControl.addOverlay(HeatLayer, "Point Density");
            }

            // Add new blank FlowLayer to map if specified
            if (flowres){
                FlowLayer = new L.layerGroup();
                map.addLayer(FlowLayer);
                layerControl.addOverlay(FlowLayer, "Flow Paths");
            }

            let msgBox = L.control.window(map,
                {position: 'top',
                 content:"<div class='data_message'></div><div><progress class='progbar'></progress></div>",
                visible:true
             });

            $(".data_message").html("Rendering activities...");
            appState.items = [];


            let url = "{{ url_for('getdata', username=user.id) }}"
                       + "?" + jQuery.param(query, true);

            locateControl.stop();

            let source = new EventSource(url);
            let rendering = true,
                listening = true;

            $("#abortButton").show();
            $(".progbar").show();
            var progs = document.getElementsByClassName('progbar');
            $('#renderButton').prop('disabled', true);

            function doneRendering(msg){
                if (rendering) {
                    $("#abortButton").hide();
                    $(".progbar").hide();
                    if ($("#autozoom:checked").val() && bounds.isValid())
                        map.fitBounds(bounds);

                    let msg2 = msg + " " + appState.items.length + " activities rendered.";
                    $(".data_message").html(msg2);
                    rendering = false;
                }
            }



            function stopListening(){
                if (listening){
                    listening = false;
                    source.close();

                    try {
                        msgBox.close();
                    }
                    catch(err) {
                        console.log(err.message);
                    }

                    $('#renderButton').prop('disabled', false);
                }
            }

            $('#abortButton').click(function(){
                stopListening();
                doneRendering("<font color='red'>Aborted:</font>");
            });


            source.onmessage = function(event) {
                if (event.data != 'done'){
                    let A = JSON.parse(event.data),
                            extend_bounds = true,
                            heatpoints = false,
                            flowpoints = false;

                    if ("error" in A){
                        let msg = "<font color='red'>" + A.error +"</font><br>";
                        L.control.window(map, {title: "Oops.", content:msg, visible:true});
                        doneRendering(msg);
                        stopListening();
                        return;
                    } else if ("stop_rendering" in A){
                        doneRendering("Done rendering.");
                    } else if ("msg" in A) {
                        $(".data_message").html(A.msg);
                        if ("value" in A) {
                            for (let i = 0; i < progs.length; i++) {
                                 progs[i].value = parseFloat(A.value)
                             }
                        }
                        return;
                    } // else {
                    //     let msg = "rendering [" + A.id + "] " + A.name;
                    //     $(".data_message").html(msg);
                    // }

                    if (flowres){
                        // add this activity's route to FlowLayer
                        var fopts = Object.assign({}, flowLayerOptions),  // copy of default options
                            v = parseFloat(A.average_speed);
                        if (("path_color" in A) && A.path_color)
                            fopts.color = A.path_color;
                    }

                    if (lores && ("summary_polyline" in A) && (A.summary_polyline)) {
                        let latlngs = L.PolylineUtil.decode(A.summary_polyline);
                        if (heatres == "low") heatpoints = latlngs;
                        if (flowres == "low") flowpoints = latlngs;
                    }


                    if (query.hires && ("polyline" in A) && (A.polyline)){
                        let latlngs = L.PolylineUtil.decode(A.polyline);
                        if (heatres == "high") heatpoints = latlngs;
                        if (flowres == "high") flowpoints = latlngs;
                    }

                    if (heatpoints) latlngs_flat.push.apply(latlngs_flat, heatpoints);
                    if (flowpoints) {
                        fopts.delay = parseInt(flowLayerConsts.K / v);
                        fopts.dashArray = [2, parseInt(flowLayerConsts.T * v)];
                        flow = new L.Polyline.AntPath(flowpoints, fopts);

                        if ($("#info").is(":checked")) {
                            flow.on('mouseover', function(e) {
                               if (this.options.weight == fopts.weight){
                                   this.bringToFront();
                                   this.setStyle({
                                        weight: fopts.weight + 3,
                                        opacity: 1
                                   });
                                 }
                              });


                            flow.on("mouseout", function() {
                                this.setStyle({
                                    weight: fopts.weight,
                                    opacity: fopts.opacity
                                });
                            });

                            flow.on("click", function(e) {
                              let url = "{{ url_for('main',username=user.id) }}",
                                  d = parseFloat(A.total_distance),
                                  elapsed = hhmmss(parseFloat(A.elapsed_time));

                              let dkm = +(d / 1000).toFixed(2),
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


                              let popup = L.popup()
                                .setLatLng(e.latlng)
                                .setContent(
                                    `${A.name}<br>${A.type}: ${A.beginTimestamp}<br>`+
                                    `${dkm} km (${dmi} mi) in ${elapsed}<br>${vkm} (${vmi})<br>` +
                                    `View in <a href='https://www.strava.com/activities/${A.id}' target='_blank'>Strava</a>`+
                                    `, <a href='${url}?id=${A.id}&flowres=high' target='_blank'>Heatflask</a>`
                                    )
                                .openOn(map);
                            });
                        }
                        FlowLayer.addLayer(flow);
                    }

                    points = heatpoints || flowpoints;
                    if (points) {
                        bounds.extend(points);
                        delete A.summary_polyline;
                        delete A.polyline;
                        delete A.time;
                        appState.items.push(A);
                    }

                  } else {
                    doneRendering("Finished. ");
                    stopListening();
                    appState['date1'] = date1;
                    appState["date2"] = date2;
                    if ("limit" in query) appState["limit"] = query.limit;
                    appState["flowres"] = flowres;
                    appState["heatres"] = heatres;
                    updateURL();
                  }
                }
            }


        function updateURL(){
            let params = {},
                type = $("#select_type").val(),
                num = $("#select_num").val();

            if (type == "activities") params.limit = num;
            else if (type == "activity_ids") params.id = $("#activity_ids").val();
            else if (type == "days") params.preset = num;
            else {
                if (appState.date1) params.date1 = appState.date1;
                if (appState.date2 && (appState.date2 != "now")) params.date2 = appState.date2;
            }

            if ($("#info").is(':checked'))
                params.info = "1";

            if($("#autozoom").is(':checked')) {
                params.autozoom = "1";
            } else {
                let zoom = map.getZoom();
                    center = map.getCenter(),
                    precision = Math.max(0, Math.ceil(Math.log(zoom) / Math.LN2));
                params.lat = center.lat.toFixed(precision);
                params.lng = center.lng.toFixed(precision);
                params.zoom = zoom;
            }

            if ($("#heatres").val())
                params.heatres = $("#heatres").val();

            if ($("#flowres").val())
                params.flowres = $("#flowres").val();

            params["baselayer"] = appState.baseLayers;

            let newURL = "{{ user.id }}" + "?" + jQuery.param(params, true);
            window.history.pushState("", "", newURL);

            $(".current-url").val(newURL);
        }


        function preset_sync() {
            let F = "YYYY-MM-DD",
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

        };



        $(document).ready(function() {
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
                updateURL();
            });

            $("#autozoom").on("change",updateURL);

            $(".datepick").on("change", function(){
                $(".preset").val("");
            });
            $(".preset").on("change", preset_sync);

            $("#renderButton").on('click', renderLayers);

            $("#heatres").val("{{ heatres }}")
            $("#flowres").val("{{ flowres }}")

            {% if autozoom  %}
            $("#autozoom").prop('checked', true);
            {% endif %}

            {% if info  %}
            $("#info").prop('checked', true);
            {% endif %}

            {% if ids %}
            $("#activity_ids").val("{{ ids }}");
            $("#select_type").val("activity_ids");
            {% elif limit %}
            $("#select_num").val("{{ limit }}");
            $("#select_type").val("activities");
            {% elif preset %}
            $("#select_num").val("{{ preset }}");
            $("#select_type").val("days");
            preset_sync();
            {% else %}
            $('#date1').val("{{ date1 }}");
            $('#date2').val("{{ date2 }}");
            $("#preset").val("");
            {% endif %}

            renderLayers();
            preset_sync();

        })
    </script>
