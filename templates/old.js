

                if (query.durations)
                    durations = data.durations;


                if (query.lores) {
                    var lores_routes = [];
                    var route;
                    for (var i = 0; i < data.lores.length; i++) {
                        route = L.PolylineUtil.decode(data.lores[i]);
                        lores_routes.push(route);
                    }


                    if (flowres == "low")
                        flow_data = lores_routes;

                    if (heatres == "low"){
                        var flat = [];
                        for (var i = 0; i < lores_routes.length; i++) {
                             flat.push.apply(flat, lores_routes[i]);
                         }

                         heat_data = flat;
                    }
                }

                if (query.hires) {
                    var hires_routes = [];
                    var route;
                    for (var i = 0; i < data.hires.length; i++) {
                        route = L.PolylineUtil.decode(data.hires[i]);
                        hires_routes.push(route);
                    }

                    if (flowres == "high")
                        flow_data = hires_routes;

                    if (heatres == "high"){
                        var flat = [];
                        for (var i = 0; i < hires_routes.length; i++) {
                             flat.push.apply(flat, hires_routes[i]);
                        }

                        heat_data = flat;
                    }
                }

                // Add Heat Map Layer to map
                if (HeatLayer){
                    map.removeLayer(HeatLayer);
                    control.removeLayer(HeatLayer);
                    HeatLayer = false;
                }
                if (heat_data){
                    HeatLayer = L.heatLayer(heat_data, heatLayerOptions);
                    map.addLayer(HeatLayer);
                    control.addOverlay(HeatLayer, "Point Density");
                }


                if (FlowLayer){
                    map.removeLayer(FlowLayer);
                    control.removeLayer(FlowLayer);
                    FlowLayer = false;
                }

                if (flow_data){
                    FlowLayer = new L.layerGroup();
                    var options = {{ config["ANTPATH_DEFAULT_OPTIONS"]|tojson|safe }};
                    var DELAY = options.delay;

                    for (var i=0; i < flow_data.length; i++) {
                        var route = flow_data[i];
                        if (("path_color" in data.summary[i]) && data.summary[i].path_color)
                            options.color = data.summary[i].path_color;

                        if (durations){
                            var durs = durations[i];
                            var subroute = [route[0]];

                            for (var j = 1; j < durs.length; j++) {
                                subroute.push(route[j]);

                                if (durs[j] != durs[j-1]) {

                                    options.delay = DELAY * durs[j-1]
                                    polyseg = new L.Polyline.AntPath(subroute, options);

                                    FlowLayer.addLayer(polyseg);

                                    subroute = [route[j]];
                                }
                            }
                        }

                        else {
                            FlowLayer.addLayer(new L.Polyline.AntPath(route, options));
                        }

                    }
                    map.addLayer(FlowLayer);
                    control.addOverlay(FlowLayer, "Flow Paths");
                }

