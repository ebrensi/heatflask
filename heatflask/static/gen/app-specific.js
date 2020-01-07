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

    update: function(now=Date.now(), msg="") {
        let fps = ~~(1000 / (now - this.lastCalledTime) + 0.5);
        this._container.innerHTML = `${fps} f/s, ${msg}`;
        this.lastCalledTime = now;
        return fps;
    }
});

//constructor registration
L.control.fps = function(options) {
  return new L.Control.fps();
};

let WS_SCHEME;

if (window.location.protocol == "https:") {
      WS_SCHEME = "wss://";
    } else {
      WS_SCHEME = "ws://";
    };
    

// Courtesy of TwoFuckingDevelopers (@2fdevs, @elecash and @qmarcos)
function isMobileDevice() {
    return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);
};


//--------------------------------
Number.prototype.pad = function(size) {
  var s = String(this);
  while (s.length < (size || 2)) {s = "0" + s;}
  return s;
}

// ------------------------------
function hhmmss( secs ) {
    let totalSeconds = secs;

    let hours = Math.floor(totalSeconds / 3600).pad(2);
    totalSeconds %= 3600;
    let minutes = Math.floor(totalSeconds / 60).pad(2);
    seconds = Math.round((totalSeconds % 60)).pad(2);

    return `${hours}:${minutes}:${seconds}`;
    // return new Date( secs * 1000 ).toISOString().substr( 11, 8 );
}

function img( url, w=20, h=20, alt="" ) {
  return `<img src='${url}' width=${w}px height=${h}px class="img-fluid" alt="${alt}">`;
}


// return an HTML href tag from a url and text
function href( url, text ) {
    return `<a href='${url}' target='_blank'>${text}</a>`;
}

// Strava specific stuff
function stravaActivityURL( id ) {
    return "https://www.strava.com/activities/"+id;
}

function stravaAthleteURL( id ) {
    return "https://www.strava.com/athletes/"+id;
}


// For DataTables
function formatDate( data, type, row, meta ) {
    date = new Date( data );
    return ( type === "display" || type === "filter" ) ?
        date.toLocaleString( "en-US", { hour12: false } ) : date;
}

function formatIP( data, type, row, meta ) {
    if ( data ) {
        let ip = data;
        return ( type === "display" ) ? href( ip_lookup_url( ip ), ip ) : ip;
    } else {
        return "";
    }
}

function formatUserId ( data, type, row ) {
    if ( data ) {
        if ( type == "display" ) {
            let link = "/" + data;
            if (row.profile) {
                avatar = img( row.profile, w = 40, h = 40, alt = data );
                return href( link, avatar );
            }
            else {
                return href( link, data );

            }
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
    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200)
            callback(xmlHttp.responseText);
    }
    xmlHttp.open("GET", theUrl, true); // true for asynchronous
    xmlHttp.send(null);
}


function httpPostAsync(theUrl, payload, callback) {
    let xmlHttp = new XMLHttpRequest();
    xmlHttp.onreadystatechange = function() {
        if (xmlHttp.readyState == 4 && xmlHttp.status == 200)
            callback(xmlHttp.responseText);
    }
    xmlHttp.open("POST", theUrl, true); // true for asynchronous
    xmlHttp.setRequestHeader("Content-type", "application/json");
    dataToSend = JSON.stringify(payload);
    xmlHttp.send(dataToSend);
}




// decode a (possibly RLE-encoded) array of successive differences into
//  an array of the original values
//  This will decode both [1, 2,2,2,2,2,2, 5] and [1, [2,6], 5] into
//    [0, 1, 3, 5, 7, 9, 11, 13, 18]
function streamDecode(rle_list, first_value=0) {
    let running_sum = first_value,
    outArray = [first_value],
    len = rle_list.length;
    for (let i=0; i<len; i++) {
        el = rle_list[i];
        if (el instanceof Array) {
            for (let j=0; j<el[1]; j++) {
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




// ---------------------------------------
function touchHandler(event) {
    // Add touch support by converting touch events to mouse events
    // Source: http://stackoverflow.com/a/6362527/725573

    var touches = event.changedTouches,
        first = touches[0],
        type = "";

    switch(event.type) {
        case "touchstart": type = "mousedown"; break;
        case "touchmove":  type = "mousemove"; break;
        case "touchend":   type = "mouseup";   break;
        default: return;
    }

    //Convert the touch event into it's corresponding mouse event
    var simulatedEvent = document.createEvent("MouseEvent");
    simulatedEvent.initMouseEvent(type, true, true, window, 1,
                              first.screenX, first.screenY,
                              first.clientX, first.clientY, false,
                              false, false, false, 0/*left*/, null);

    first.target.dispatchEvent(simulatedEvent);
    event.preventDefault();
}

// // make touch events simulate mouse events via _touchHandler
// document.addEventListener("touchstart", touchHandler, true);
// document.addEventListener("touchmove", touchHandler, true);
// document.addEventListener("touchend", touchHandler, true);
// document.addEventListener("touchcancel", touchHandler, true);

function fadeIn(el){
  el.classList.add('show');
  el.classList.remove('hide');  
}

function fadeOut(el){
  el.classList.add('hide');
  el.classList.remove('show');
}


// This is a list of tuples specifying properties of the rendered objects,
//  such as path color, speed/pace in description.  others can be added
ATYPE_SPECS = [
        ["Ride", "speed", "#2B60DE"],  // Ocean Blue
        ["Run", "pace", "#FF0000"],    // Red
        ["Swim", "speed", "#00FF7F"],  // SpringGreen
        ["Hike", "pace", "#FF1493"],   // DeepPink
        ["Walk", "pace", "#FF00FF"],   // Fuchsia
        ["AlpineSki", null, "#800080"],// Purple
        ["BackcountrySki", null, "#800080"],  // Purple
        ["Canoeing", null, "#FFA500"],  // Orange
        ["Crossfit", null, null],
        ["EBikeRide", "speed", "#0000CD"], // MediumBlue
        ["Elliptical", null, null],
        ["IceSkate", "speed", "#663399"],  // RebeccaPurple
        ["InlineSkate", null, "#8A2BE2"],  // BlueViolet
        ["Kayaking", null, "#FFA500"],  // Orange
        ["Kitesurf", "speed", null],
        ["NordicSki", null, "#800080"], // purple
        ["RockClimbing", null, "#4B0082"],  // Indigo
        ["RollerSki", "speed", "#800080"],  // Purple
        ["Rowing", "speed", "#FA8072"],  // Salmon
        ["Snowboard", null, "#00FF00"],  // Lime
        ["Snowshoe", "pace", "#800080"], // Purple
        ["StairStepper", null, null],
        ["StandUpPaddling", null, null],
        ["Surfing", null, "#006400"],  // DarkGreen
        ["VirtualRide", "speed", "#1E90FF"],  // DodgerBlue
        ["WeightTraining", null, null],
        ["Windsurf", "speed", null],
        ["Workout", null, null],
        ["Yoga", null, null]
];


let ATYPE_MAP = {};
for (let i=0; i < ATYPE_SPECS.length; i++) {
    let atype = ATYPE_SPECS[i];

    ATYPE_MAP[atype[0].toLowerCase()] = {"vtype": atype[1], "pathColor": atype[2]};
}

L.SwipeSelect = L.Class.extend({
    includes: L.Evented.prototype,

    options: {

    },

    initialize: function(options, doneSelecting=null, whileSelecting=null) {
        L.Util.setOptions(this, options);
        this.onmousemove = whileSelecting;
        this.onmouseup = doneSelecting;
    },

    addTo: function(map) {
        this.map = map;

        let size = map.getSize();

        this.drag = false;

        this.canvas = L.DomUtil.create( "canvas", "leaflet-layer" );
        canvas = this.canvas;
        map._panes.markerPane.appendChild( canvas );

        canvas.width = size.x;
        canvas.height = size.y;

        this.ctx = canvas.getContext('2d');
        this.ctx.globalAlpha = 0.3;
        this.ctx.fillStyle = "red";

        this.map.dragging.disable();

        canvas.onmousedown = function(event){
            this.mapManipulation(false);

            let topLeft = this.map.containerPointToLayerPoint( [ 0, 0 ] );
            L.DomUtil.setPosition( this.canvas, topLeft );

            this.mapPanePos = this.map._getMapPanePos();

            this.rect = {corner: new L.Point(event.pageX, event.pageY)};
            this.dragging = true;
        }.bind(this);


        canvas.onmousemove = function(event){
            if (this.dragging) {
                let r = this.rect,
                    currentPoint = new L.Point(event.pageX, event.pageY);

                r.size = currentPoint.subtract(r.corner);
                this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
                this.ctx.fillRect(r.corner.x, r.corner.y, r.size.x, r.size.y);

                this.onmousemove && this.onmousemove(this.getBounds());
            }
        }.bind(this);


        canvas.onmouseup = function(event){
            this.dragging = false;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.mapManipulation(true);

            this.onmouseup & this.onmouseup(this.getBounds());
        }.bind(this);


        if (touchHandler) {
            // make touch events simulate mouse events via touchHandler
            canvas.addEventListener("touchstart", touchHandler, true);
            canvas.addEventListener("touchmove", touchHandler, true);
            canvas.addEventListener("touchend", touchHandler, true);
            canvas.addEventListener("touchcancel", touchHandler, true);
        }

    },

    getBounds: function() {
        let r = this.rect,
            corner1 = r.corner,
            corner2 = r.corner.add(r.size),
            pxBounds = new L.Bounds(corner1, corner2),

            ll1 = this.map.containerPointToLatLng(corner1),
            ll2 = this.map.containerPointToLatLng(corner2),
            llBounds = new L.LatLngBounds(ll1, ll2);

        return {pxBounds: pxBounds, latLngBounds: llBounds};
    },

    remove: function() {
        if (!this.canvas) {
            return;
        }
        map._panes.markerPane.removeChild( this.canvas );
        this.canvas = null;
    },

    // enable or disable pan/zoom
    mapManipulation: function (state=false){
        if (state) {
            map.dragging.enable();
            map.touchZoom.enable();
            map.doubleClickZoom.enable();
            map.scrollWheelZoom.enable();
        } else {
            map.dragging.disable();
            map.touchZoom.disable();
            map.doubleClickZoom.disable();
            map.scrollWheelZoom.disable();
        }
    }
});

L.swipeselect = function(options, doneSelecting=null, whileSelecting=null) {
    return new L.SwipeSelect(options, doneSelecting=null, whileSelecting=null);
};


/*
 * L.Handler.BoxHook is used to add kepress-drag-box interaction to the map
 * (call a callback with selected bounding box)
 *  Based on Leaflet's native BoxZoom
 *
 * enable by adding it to your map's handler:
 *
 *      map.addInitHook('addHandler', 'BoxHook', BoxHook);
 */


var BoxHook = L.Handler.extend({
    initialize: function (map) {
        this._map = map;
        this._container = map._container;
        this._pane = map._panes.overlayPane;
        this._resetStateTimeout = 0;
        map.on('unload', this._destroy, this);
    },

    addHooks: function () {
        L.DomEvent.on(this._container, 'mousedown', this._onMouseDown, this);
    },

    removeHooks: function () {
        L.DomEvent.off(this._container, 'mousedown', this._onMouseDown, this);
    },

    moved: function () {
        return this._moved;
    },

    _destroy: function () {
        L.DomUtil.remove(this._pane);
        delete this._pane;
    },

    _resetState: function () {
        this._resetStateTimeout = 0;
        this._moved = false;
    },

    _clearDeferredResetState: function () {
        if (this._resetStateTimeout !== 0) {
            clearTimeout(this._resetStateTimeout);
            this._resetStateTimeout = 0;
        }
    },

    _onMouseDown: function (e) {
        if (!e.ctrlKey || ((e.which !== 1) && (e.button !== 1))) { return false; }

        // Clear the deferred resetState if it hasn't executed yet, otherwise it
        // will interrupt the interaction and orphan a box element in the container.
        this._clearDeferredResetState();
        this._resetState();

        L.DomUtil.disableTextSelection();
        L.DomUtil.disableImageDrag();

        this._map.dragging.disable();
        this._map.touchZoom.disable();
        this._map.doubleClickZoom.disable();
        this._map.scrollWheelZoom.disable();

        this._startPoint = this._map.mouseEventToContainerPoint(e);

        L.DomEvent.on(document, {
            contextmenu: L.DomEvent.stop,
            mousemove: this._onMouseMove,
            mouseup: this._onMouseUp,
            keydown: this._onKeyDown
        }, this);
    },

    _onMouseMove: function (e) {
        if (!this._moved) {
            this._moved = true;

            this._box = L.DomUtil.create('div', 'leaflet-zoom-box', this._container);
            L.DomUtil.addClass(this._container, 'leaflet-crosshair');

            this._map.fire('boxhookstart');
        }

        this._point = this._map.mouseEventToContainerPoint(e);

        var bounds = new L.Bounds(this._point, this._startPoint),
            size = bounds.getSize();

        L.DomUtil.setPosition(this._box, bounds.min);

        this._box.style.width  = size.x + 'px';
        this._box.style.height = size.y + 'px';
    },

    _finish: function () {
        if (this._moved) {
            L.DomUtil.remove(this._box);
            L.DomUtil.removeClass(this._container, 'leaflet-crosshair');
        }

        L.DomUtil.enableTextSelection();
        L.DomUtil.enableImageDrag();

        this._map.dragging.enable();
        this._map.touchZoom.enable();
        this._map.doubleClickZoom.enable();
        this._map.scrollWheelZoom.enable();

        L.DomEvent.off(document, {
            contextmenu: L.DomEvent.stop,
            mousemove: this._onMouseMove,
            mouseup: this._onMouseUp,
            keydown: this._onKeyDown
        }, this);
    },

    _onMouseUp: function (e) {
        if ((e.which !== 1) && (e.button !== 1)) { return; }

        this._finish();

        if (!this._moved) { return; }
        // Postpone to next JS tick so internal click event handling
        // still see it as "moved".
        this._clearDeferredResetState();
        this._resetStateTimeout = setTimeout(L.Util.bind(this._resetState, this), 0);

        var llBounds = new L.LatLngBounds(
                this._map.containerPointToLatLng(this._startPoint),
                this._map.containerPointToLatLng(this._point)),
            pxBounds = new L.Bounds(this._startPoint, this._point);


        this._map
            // .fitBounds(bounds)
            .fire('boxhookend', {latLngBounds: llBounds, pxBounds: pxBounds});
    },

    _onKeyDown: function (e) {
        if (e.keyCode === 27) {
            this._finish();
        }
    }
});



L.Map.mergeOptions({
    // @option boxHook: Boolean = true
    // Whether a custom function can be called with rectangular area specified by
    // dragging the mouse while pressing the shift key.
    boxHook: true
});

// @section Handlers
// @property boxHook: Handler
// Box (ctrl-drag with mouse) select handler.
L.Map.addInitHook('addHandler', 'boxHook', BoxHook);

if (window.location.protocol == "https:") {
      WS_SCHEME = "wss://";
    } else {
      WS_SCHEME = "ws://";
    };
    
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
let capture_button_states = [
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
            render: (data, type, row) => {
                if ( type === 'display' || type === 'filter' ) {
                    return href( stravaActivityURL(row.id), row.tsLoc.toLocaleString());
                } else 
                    return row.startTime;
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
         for (let A of rows.values()) {
            A.selected = !A.selected;
            A.highlighted = !A.highlighted;
            redraw |= mapBounds.overlaps(A.bounds);
        }
    }

    redraw && DotLayer && DotLayer._onLayerDidMove();

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
    DotLayer = new L.DotLayer(appState.items, {
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


    // initialize or update DotLayer
    if (DotLayer) {
        DotLayer.setDotColors();
        DotLayer.reset();
        // !appState.paused && DotLayer.animate();
    } else {
        initializeDotLayer();
    }

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
            
            else if ("delete" in A) {
                // delete all ids in A.delete
                for (let id of A.delete) {
                    delete appState.items[id];
                }
            
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

        // At this point we know A is an activity object, not a message
        let latLngArray = L.PolylineUtil.decode(A.polyline),
            timeArray = streamDecode(A.time),
            len = latLngArray.length,
            latLngTime = new Float32Array(3*len),
            tup = A.ts;

        A.tsLoc = new Date((tup[0] + tup[1]*3600) * 1000);
        A.startTime = new Date(tup[0]* 1000);  
        A.bounds = L.latLngBounds(A.bounds.SW, A.bounds.NE);

        // create LatLngTime array 
        for (let i=0, ll; i<len; i++) {
            ll = latLngArray[i];
            idx = i*3;
            latLngTime[idx] = ll[0];
            latLngTime[idx+1] = ll[1];
            latLngTime[idx+2] = timeArray[i];
        }

        A.latLngTime = latLngTime;
        A.id = A._id;

        delete A.summary_polyline;
        delete A.polyline;
        delete A.time;
        delete A._id;
        delete A.ts;

        // only add A to appState.items if it isn't already there
        if (!(A.id in appState.items)) {
            if (!A.type) {
                return;
            }

            let typeData = ATYPE_MAP[A.type.toLowerCase()];
            if  (!typeData) {
                typeData = ATYPE_MAP["workout"];
            }
            appState.items[A.id] = Object.assign(A, typeData);
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
    var F = "YYYY-MM-DD",
    num = domIdVal("select_num"),
    type = domIdVal("select_type");

    if (type=="days"){
        $(".date_select").hide();
        domIdShow("id_select", false);
        domIdShow("num_select", true);
        domIdVal('date1', moment().subtract(num, 'days').format(F));
        domIdVal('date2', "now");
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


$(document).ready(function() {

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
    
    renderLayers();
    preset_sync();
});


/*
  DotLayer Efrem Rensi, 2020,
  inspired by L.CanvasLayer by Stanislav Sumbera,  2016 , sumbera.com
  license MIT
*/
'use strict';

L.DotLayer = L.Layer.extend( {

    _pane: "shadowPane",
    two_pi: 2 * Math.PI,
    target_fps: 25,
    smoothFactor: 1.0,
    _tThresh: 100000000.0,
    C1: 1000000.0,
    C2: 200.0,
    dotScale: 1,

    options: {
        startPaused: false,
        showPaths: true,
        colorAll: true,
        normal: {
            dotColor: "#000000",
            dotOpacity: 0.8,

            pathColor: "#000000",
            pathOpacity: 0.7,
            pathWidth: 1
        },
        selected: {
            dotColor: "#FFFFFF",
            dotOpacity: 0.9,
            dotStrokeColor: "#FFFFFF",
            dotStrokeWidth: 0.5,

            pathColor: "#000000",
            pathOpacity: 0.8,
            pathWidth: 1
        }
    },

    // -- initialized is called on prototype
    initialize: function( items, options ) {
        this._map    = null;
        this._dotCanvas = null;
        this._lineCanvas = null;
        this._capturing = null;
        this._dotCtx = null;
        this._lineCtx = null;
        this._frame  = null;
        this._items = items || null;
        this._timeOffset = 0;
        this._colorPalette = [];
        this._overlapsArray = null;
        L.setOptions( this, options );
        this._paused = this.options.startPaused;
        this._timePaused = Date.now();

        this.heatflask_icon = new Image();
        this.heatflask_icon.src = "static/logo.png";

        this.strava_icon = new Image();
        this.strava_icon.src = "static/pbs4.png";
    },

    //-------------------------------------------------------------
    onAdd: function( map ) {
        this._map = map;

        let size = this._map.getSize(),
            zoomAnimated = this._map.options.zoomAnimation && L.Browser.any3d;

        // dotlayer canvas
        this._dotCanvas = L.DomUtil.create( "canvas", "leaflet-layer" );
        this._dotCanvas.width = size.x;
        this._dotCanvas.height = size.y;
        this._dotCtx = this._dotCanvas.getContext( "2d" );
        L.DomUtil.addClass( this._dotCanvas, "leaflet-zoom-" + ( zoomAnimated ? "animated" : "hide" ) );
        map._panes.shadowPane.style.pointerEvents = "none";
        map._panes.shadowPane.appendChild( this._dotCanvas );

        // create Canvas for polyline-ish things
        this._lineCanvas = L.DomUtil.create( "canvas", "leaflet-layer" );
        this._lineCanvas.width = size.x;
        this._lineCanvas.height = size.y;
        this._lineCtx = this._lineCanvas.getContext( "2d" );
        this._lineCtx.lineCap = "round";
        this._lineCtx.lineJoin = "round";
        L.DomUtil.addClass( this._lineCanvas, "leaflet-zoom-" + ( zoomAnimated ? "animated" : "hide" ) );
        map._panes.overlayPane.appendChild( this._lineCanvas );

        map.on( this.getEvents(), this );

        if ( this._items ) {
            this.reset();
        }
    },

    //-------------------------------------------------------------
    _onLayerDidResize: function( resizeEvent ) {
        let newWidth = resizeEvent.newSize.x,
            newHeight = resizeEvent.newSize.y;

        this._dotCanvas.width = newWidth;
        this._dotCanvas.height = newHeight;

        this._lineCanvas.width = newWidth;
        this._lineCanvas.height = newHeight;

        this._onLayerDidMove();
    },

    //-------------------------------------------------------------
    _onLayerDidMove: function() {
        this._mapMoving = false;

        this._setupWindow();

        if (this._paused) {
            this.drawLayer(this._timePaused);
        } else {
            this.animate();
        }

    },

    //-------------------------------------------------------------
    getEvents: function() {
        var events = {
            movestart: function() {
                // this._mapMoving = true;
            },
            moveend: this._onLayerDidMove,
            resize: this._onLayerDidResize
        };

        if ( this._map.options.zoomAnimation && L.Browser.any3d ) {
            events.zoomanim =  this._animateZoom;
        }

        return events;
    },

    //-------------------------------------------------------------
    // Call this function when items are added or reomved
    reset: function() {
        this.setDotColors();
        this._onLayerDidMove();
    },


    //-------------------------------------------------------------
    onRemove: function( map ) {
        this.onLayerWillUnmount && this.onLayerWillUnmount(); // -- callback

        map._panes.shadowPane.removeChild( this._dotCanvas );
        this._dotCanvas = null;

        map._panes.overlayPane.removeChild( this._lineCanvas );
        this._lineCanvas = null;

        map.off( this.getEvents(), this );
    },


    // --------------------------------------------------------------------
    addTo: function( map ) {
        map.addLayer( this );
        return this;
    },

    // -------------------------------------------------------------------
    setSelectRegion: function(pxBounds, callback) {
        let paused = this._paused;
        this.pause();
        let selectedIds = this.getSelected(pxBounds);
        if (paused){
            this.drawLayer();
        } else {
            this.animate();
        }
        callback(selectedIds);
    },

    // -------------------------------------------------------------------

    Simplifier: {
        // square distance between 2 points
        getSqDist: function(p1, p2) {

            const dx = p1[0] - p2[0],
                  dy = p1[1] - p2[1];

            return dx * dx + dy * dy;
        },

        // square distance from a point to a segment
        getSqSegDist: function(p, p1, p2) {

            let x = p1[0],
                y = p1[1],
                dx = p2[0] - x,
                dy = p2[1] - y;

            if (dx !== 0 || dy !== 0) {

                const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);

                if (t > 1) {
                    x = p2[0];
                    y = p2[1];

                } else if (t > 0) {
                    x += dx * t;
                    y += dy * t;
                }
            }

            dx = p[0] - x;
            dy = p[1] - y;

            return dx * dx + dy * dy;
        },
        // rest of the code doesn't care about point format

        // basic distance-based simplification
        simplifyRadialDist: function(points, sqTolerance) {

            let prevPoint = points[0],
                newPoints = [prevPoint],
                point;

            for (let i = 1, len = points.length; i < len; i++) {
                point = points[i];

                if (this.getSqDist(point, prevPoint) > sqTolerance) {
                    newPoints.push(point);
                    prevPoint = point;
                }
            }

            if (prevPoint !== point) newPoints.push(point);

            return newPoints;
        },

        simplifyDPStep: function(points, first, last, sqTolerance, simplified) {
            let maxSqDist = sqTolerance,
                index;

            for (let i = first + 1; i < last; i++) {
                const sqDist = this.getSqSegDist(points[i], points[first], points[last]);

                if (sqDist > maxSqDist) {
                    index = i;
                    maxSqDist = sqDist;
                }
            }

            if (maxSqDist > sqTolerance) {
                if (index - first > 1)
                    this.simplifyDPStep(points, first, index, sqTolerance, simplified);
                
                simplified.push(points[index]);
                
                if (last - index > 1) 
                    this.simplifyDPStep(points, index, last, sqTolerance, simplified);
            }
        },

        // simplification using Ramer-Douglas-Peucker algorithm
        simplifyDouglasPeucker: function(points, sqTolerance) {
            const last = points.length - 1;

            let simplified = [points[0]];
            this.simplifyDPStep(points, 0, last, sqTolerance, simplified);
            simplified.push(points[last]);

            return simplified;
        },

        simplify: function(points, tolerance, highestQuality) {

            if (points.length <= 2) return points;

            const sqTolerance = tolerance !== undefined ? tolerance * tolerance : 1;

            // console.time("RDsimp");
            points = highestQuality ? points : this.simplifyRadialDist(points, sqTolerance);
            // console.timeEnd("RDsimp");
            // console.log(`n = ${points.length}`)
            // console.time("DPsimp")
            points = this.simplifyDouglasPeucker(points, sqTolerance);
            // console.timeEnd("DPsimp");
            return points;
        }
    },

    CRS: {
        // This is a streamlined version of Leaflet's EPSG:3857 crs,
        // which can run independently of Leaflet.js (i.e. in a worker thread)
        //  latlngpt is a a 2d-array [lat,lng] rather than a latlng object
        code: 'EPSG:3857',
        MAX_LATITUDE: 85.0511287798,
        EARTH_RADIUS: 6378137,
        RAD: Math.PI / 180,
        T: null,

        makeTransformation: function() {
            const S = 0.5 / (Math.PI * this.EARTH_RADIUS),
                  T = {A: S, B: 0.5, C: -S, D: 0.5};
            this.T = T;
            return T;
        },
     
        project: function(latlngpt, zoom) {
            const max = this.MAX_LATITUDE,
                R = this.EARTH_RADIUS,
                rad = this.RAD,
                lat = Math.max(Math.min(max, latlngpt[0]), -max),
                sin = Math.sin(lat * rad),
                scale = 256 * Math.pow(2, zoom);
            
            let x = R * latlngpt[1] * rad,
                y = R * Math.log((1 + sin) / (1 - sin)) / 2;

            // Transformation
            T = this.T || this.makeTransformation();
            x = scale * (T.A * x + T.B);
            y = scale * (T.C * y + T.D);
            return [x,y]
        }
    },

    _overlaps: function(mapBounds, activityBounds) {
        let sw = mapBounds._southWest,
            ne = mapBounds._northEast,
            sw2 = activityBounds._southWest,
            ne2 = activityBounds._northEast,

            latOverlaps = (ne2.lat > sw.lat) && (sw2.lat < ne.lat),
            lngOverlaps = (ne2.lng > sw.lng) && (sw2.lng < ne.lng);

        return latOverlaps && lngOverlaps;
    },

    itemMask: function(mapBounds, bitArray=null) {
        const items = this._items,
              itemKeys = Object.keys(items),
              L = itemKeys.length;

        if (bitarray === null)
            bitarray = new FastBitArray(L);


        for (i = 0; i < L; i++) {
            let itemBounds = items[itemKeys[i]];
            bitarray.set(i, this._overlaps(mapBounds, itemBounds));
        }
        return bitarray
    },

    _contains: function (pxBounds, point) {
        let x = point[0],
            y = point[1];

        return (pxBounds.min.x <= x) && (x <= pxBounds.max.x) &&
               (pxBounds.min.y <= y) && (y <= pxBounds.max.y);
    },

    _segMask: function(pxBounds, projected, bitarray=null) {
        const L = (projected.length / 3) - 1;
        if (bitarray === null)
            bitarray = new FastBitArray(L);

        for (let idx=0; idx<L; idx++) {
            let i = 3*idx,
                p = [projected[i], projected[i+1]];
            bitarray.set(idx, this._contains(pxBounds, p));
        }
        return bitarray
    },

    _project: function(llt, zoom, smoothFactor, hq=false, ttol=60) {
        let numPoints = llt.length / 3,
            points = new Array(numPoints);

        // console.time("project");
        for (let i=0; i<numPoints; i++) {
            let idx = 3*i,
                p = this.CRS.project( [llt[idx], llt[idx+1]], zoom );
            points[i] = [ p[0], p[1], llt[idx+2] ];
        };
        // console.timeEnd("project");
        // console.log(`n = ${points.length}`);

        // console.time("simplify");
        points = this.Simplifier.simplify(points, smoothFactor, hq);
        // console.timeEnd("simplify");
        // console.log(`n = ${points.length}`);

        // now points is an Array of points, so we put it
        // into a Float32Array buffer
        // TODO: modify Simplify to work directly with TypedArray 
        numPoints = points.length;

        let P = new Float32Array(numPoints * 3);
        for (let idx=0; idx<numPoints; idx++) {
            let point = points[idx],
                i = 3 * idx;
            P[i] = point[0];
            P[i+1] = point[1];
            P[i+2] = point[2];
        }

        // Compute speed for each valid segment
        // A segment is valid if it doesn't have too large time gap
        let numSegs = numPoints - 1,
            dP = new Float32Array(numSegs * 2);

        for ( let idx = 0; idx < numSegs; idx++ ) {
            let i = 3 * idx,
                j = 2 * idx,
                dt = P[i+5] - P[i+2];

            dP[j] = (P[i+3] - P[i]) / dt;
            dP[j+1] = (P[i+4] - P[i+1]) / dt;
        }

        return {P: P, dP: dP}
    },

    _setupWindow: function() {
        if ( !this._map || !this._items ) {
            return;
        }
        const perf_t0 = performance.now();

        // reset map orientation
        this._drawRect = null;
        this.clearCanvas();

        let topLeft = this._map.containerPointToLayerPoint( [ 0, 0 ] );
        L.DomUtil.setPosition( this._dotCanvas, topLeft );
        L.DomUtil.setPosition( this._lineCanvas, topLeft );

        // Get new map orientation
        this._zoom = this._map.getZoom();
        this._center = this._map.getCenter;
        this._size = this._map.getSize();

        this._latLngBounds = this._map.getBounds();
        this._mapPanePos = this._map._getMapPanePos();
        this._pxOrigin = this._map.getPixelOrigin();
        this._pxOffset = this._mapPanePos.subtract( this._pxOrigin );
        this._pxBounds = this._map.getPixelBounds();

        let ppos = this._mapPanePos,
            pxOrigin = this._pxOrigin,
            pxBounds = this._pxBounds,
            z = this._zoom;

        this._dotCtx.strokeStyle = this.options.selected.dotStrokeColor;
        this._dotCtx.lineWidth = this.options.selected.dotStrokeWidth;

        // console.log( `zoom=${z}\nmapPanePos=${ppos}\nsize=${this._size}\n` +
        //             `pxOrigin=${pxOrigin}\npxBounds=[${pxBounds.min}, ${pxBounds.max}]\n`+
        //              `pxOffset=${this._pxOffset}`);

        const mapBounds = this._latLngBounds,
              smoothFactor = this.smoothFactor;

        let count = {projected: 0, in:0, out:0};
        console.time("all items")
        for (let [id, A] of Object.entries(this._items)) {
            // console.log("Activity: "+id, A);
            // console.time("activity");
            A.inView = this._overlaps(mapBounds, A.bounds);

            if ( !A.inView ) {
                count.out++
                continue;
            }

            count.in++
            if ( !A.projected )
                A.projected = {};

            // project activity latLngs to pane coords
            if (!A.projected[ z ]){
                // console.time("projectSimplify");
                A.projected[z] = this._project(A.latLngTime, z, this.smoothFactor, hq=false);
                // console.timeEnd("projectSimplify");
                count.projected++;
            }

            let projectedPoints = A.projected[z].P,
                segMask = A.segMask = this._segMask(this._pxBounds, projectedPoints, A.segMask);

            if (this.options.showPaths) {
                // console.time("drawPath");

                const lineType = A.highlighted? "selected":"normal",
                      lineWidth = this.options[lineType].pathWidth,
                      strokeStyle = A.pathColor || this.options[lineType].pathColor,
                      opacity = this.options[lineType].pathOpacity;

                this._drawPath(
                    this._lineCtx,
                    projectedPoints,
                    segMask,
                    this._pxOffset,
                    lineWidth,
                    strokeStyle,
                    opacity
                );
                // console.timeEnd("drawPath");
            }
            
            // console.timeEnd("activity");
            // this._processedItems[ id ] = {
            //     dP: dP,
            //     P: P,
            //     dotColor: A.dotColor,
            //     startTime: A.startTime,
            //     totSec: P.slice( -1 )[ 0 ]
            // };
        };

        // if (this.options.showPaths)
        //     this.drawPaths();

        console.timeEnd("all items");
        console.log(count);

        d = this.setDrawRect();
        this._lineCtx.strokeStyle = "rgba(0,255,0,0.5)";
        this._lineCtx.strokeRect(d.x, d.y, d.w, d.h);
        // console.log("drawRect", this._drawRect);
    },

    _drawPath: function(ctx, points, segMask, pxOffset, lineWidth, strokeStyle, opacity, isolated=true) {
        const P = points,
              ox = pxOffset.x,
              oy = pxOffset.y;

        if (isolated)
            ctx.beginPath();

        segMask.forEach(idx => {
            const i = 3 * idx,
                  p1x = P[i]   + ox, p1y = P[i+1] + oy,
                  p2x = P[i+3] + ox, p2y = P[i+4] + oy;

                ctx.moveTo(p1x, p1y);
                ctx.lineTo(p2x, p2y);
        });

        if (isolated) {
            ctx.globalAlpha = opacity;
            ctx.lineWidth = lineWidth;
            ctx.strokeStyle = strokeStyle;
            ctx.stroke();
        }

    },

    // Draw all paths for the current items
    //  This is more efficient than calling drawPath repeatedly
    //   for each activity, since we group strokes together.
    drawPaths: function() {
        const zoom = this._zoom,
              ctx = this._lineCtx,
              pxOffset = this._pxOffset;

        // TODO: finish writing this

    },

    setDrawRect: function() {
        let llb = L.latLngBounds();

        for (const A of Object.values(this._items))
            llb.extend(A.bounds);

        const dotSize = this._dotSize || 10,
              pxOffset = this._pxOffset,
              canvas = this._lineCanvas,
              z = this._zoom,
              sw = llb._southWest,
              ne = llb._northEast,
              pSW = this.CRS.project( [sw.lat, sw.lng], z ),
              pNE = this.CRS.project( [ne.lat, ne.lng], z ),

              xmin = Math.max(pSW[0] + pxOffset.x - dotSize, 0),
              xmax = Math.min(pNE[0] + pxOffset.x + dotSize, canvas.width)
              ymin = Math.max(pNE[1] + pxOffset.y - dotSize, 0),
              ymax = Math.min(pSW[1] + pxOffset.y + dotSize, canvas.height);
        
        this._drawRect = {
            x: xmin,
            y: ymin,
            w: xmax - xmin,
            h: ymax - ymin
        };
        return this._drawRect
    },

    clearCanvas: function(ctx) {
        const canvas = this._lineCanvas;
              defaultRect = {x:0, y:0, w: canvas.width, h: canvas.height};
        
        let rect;
        
        if (ctx){
            rect = this._drawRect || defaultRect;
            ctx.clearRect( rect.x, rect.y, rect.w, rect.h );
        }
        else {
            rect = defaultRect;
            this._lineCtx.clearRect( rect.x, rect.y, rect.w, rect.h );
            this._dotCtx.clearRect( rect.x, rect.y, rect.w, rect.h );
        }
    },

    // --------------------------------------------------------------------
    drawDots: function( obj, now, highlighted ) {
        let P = obj.P,
            dP = obj.dP,
            len_dP = dP.length,
            totSec = obj.totSec,
            period = this._period,
            s = this._timeScale * ( now - obj.startTime ),
            xmax = this._size.x,
            ymax = this._size.y,
            ctx = this._dotCtx,
            dotSize = this._dotSize,
            dotOffset = dotSize / 2.0,
            two_pi = this.two_pi,
            xOffset = this._pxOffset.x,
            yOffset = this._pxOffset.y,
            g = this._gifPatch,
            dotType = highlighted? "selected":"normal";

        let timeOffset = s % period,
            count = 0,
            idx = dP[0],
            dx = dP[1],
            dy = dP[2],
            px = P[idx], 
            py = P[idx+1],
            pt = P[idx+2];

        if (this.options.colorAll || highlighted) {
            ctx.fillStyle = obj.dotColor || this.options[dotType].dotColor;
        }


        if ( timeOffset < 0 ) {
            timeOffset += period;
        }

        for (let t=timeOffset, i=0, dt; t < totSec; t += period) {
            if (t >= P[idx+5]) {
                while ( t >= P[idx+5] ) {
                    i += 3;
                    idx = dP[i];
                    if ( i >= len_dP ) {
                        return count;
                    }
                }
                px = P[idx];
                py = P[idx+1];
                pt = P[idx+2];
                dx = dP[i+1];
                dy = dP[i+2];
            }

            dt = t - pt;

            if ( dt > 0 ) {
                let lx = px + dx * dt + xOffset,
                    ly = py + dy * dt + yOffset;

                if ( highlighted & !g) {
                    ctx.beginPath();
                    ctx.arc( lx, ly, dotSize, 0, two_pi );
                    ctx.fill();
                    ctx.closePath();
                    ctx.stroke();
                } else {
                    ctx.fillRect( lx - dotOffset, ly - dotOffset, dotSize, dotSize );
                }
                count++;
            }
        }
        return count;
    },

    drawLayer: function(now) {
        if ( !this._map ) {
            return;
        }

        let ctx = this._dotCtx,
            zoom = this._zoom,
            canvas = this._dotCanvas,
            count = 0,
            t0 = performance.now(),
            highlighted_items = [],
            zf = this._zoomFactor = 1 / Math.pow( 2, zoom );

        ctx.fillStyle = this.options.normal.dotColor;

        this._timeScale = this.C2 * zf;
        this._period = this.C1 * zf;
        this._dotSize = Math.max(1, ~~(this.dotScale * Math.log( zoom ) + 0.5));

        this.clearCanvas(ctx);

        for ( let A of this._items.values() ) {
            item = pItems[ id ];
            if ( A.highlighted ) {
                highlighted_items.push( item );
            } else {
                count += this.drawDots( item, now, false );
            }
        }

        // Now plot highlighted paths
        let hlen = highlighted_items.length;
        if ( hlen ) {
            ctx.globalAlpha = this.options.selected.dotOpacity
            for (let i = 0; i < hlen; i++ ) {
                item = highlighted_items[ i ];
                count += this.drawDots( item, now, true );
            }
            ctx.globalAlpha = this.options.normal.dotOpacity
        }


        if (fps_display) {
            let periodInSecs = this.periodInSecs(),
                progress = (((now/1000) % periodInSecs) / periodInSecs).toFixed(1),
                elapsed = ( performance.now() - t0 ).toFixed( 1 );

            fps_display.update( now, `z=${this._zoom}, dt=${elapsed} ms/f, n=${count}` );
        }
    },

    getSelected: function(selectPxBounds) {
        const z = this._zoom,
              pxOffset = this._pxOffset,
              ox = pxOffset.x,
              oy = pxOffset.y;

        let selectedIds = [];

        for (A of this._items.values()) {
            if (!A.inView)
                continue;

            P = A.projected[z].P;

            for (let j=0, len=P.length; j<len; j++){
                let i = 3 * j,
                    x = P[i]   + ox,
                    y = P[i+1] + oy;

                if ( this._contains(selectPxBounds, [x, y]) ) {
                    selectedIds.push(A.id);
                }
            }
        }

        return selectedIds
    },  

    // --------------------------------------------------------------------
    animate: function() {
        this._paused = false;
        if ( this._timePaused ) {
            this._timeOffset = Date.now() - this._timePaused;
            this._timePaused = null;
        }
        this.lastCalledTime = 0;
        this.minDelay = ~~( 1000 / this.target_fps + 0.5 );
        this._frame = L.Util.requestAnimFrame( this._animate, this );
    },

    // --------------------------------------------------------------------
    pause: function() {
        this._paused = true;
    },


    // --------------------------------------------------------------------
    _animate: function() {
        if (!this._frame) {
            return;
        }
        this._frame = null;

        // let ts = Date.now(),
        //     now = ts - this._timeOffset;

        // if ( this._paused || this._mapMoving ) {
        //     // Ths is so we can start where we left off when we resume
        //     this._timePaused = ts;
        //     return;
        // }


        // if (now - this.lastCalledTime > this.minDelay) {
        //     this.lastCalledTime = now;
        //     this.drawLayer( now );
        // }

        this._frame = L.Util.requestAnimFrame( this._animate, this );
    },

    //------------------------------------------------------------------------------
    _animateZoom: function( e ) {
        var scale = this._map.getZoomScale( e.zoom );

        // -- different calc of offset in leaflet 1.0.0 and 0.0.7 thanks for 1.0.0-rc2 calc @jduggan1
        var offset = L.Layer ? this._map._latLngToNewLayerPoint( this._map.getBounds().getNorthWest(), e.zoom, e.center ) :
                               this._map._getCenterOffset( e.center )._multiplyBy( -scale ).subtract( this._map._getMapPanePos() );

        L.DomUtil.setTransform( this._dotCanvas, offset, scale );
        L.DomUtil.setTransform( this._lineCanvas, offset, scale );
    },


    periodInSecs: function() {
        return this._period / (this._timeScale * 1000);
    },




    // -----------------------------------------------------------------------

    captureCycle: function(selection=null, callback=null) {
        let periodInSecs = this.periodInSecs();
        this._mapMoving = true;
        this._capturing = true;

        // set up display
        pd = document.createElement( 'div' );
        pd.style.position = 'absolute';
        pd.style.left = pd.style.top = 0
        pd.style.backgroundColor = 'black';
        pd.style.fontFamily = 'monospace'
        pd.style.fontSize = '20px'
        pd.style.padding = '5px'
        pd.style.color = 'white';
        pd.style.zIndex = 100000
        document.body.appendChild( pd );
        this._progressDisplay = pd;

        let msg = "capturing static map frame...";
        // console.log(msg);
        pd.textContent = msg;

        leafletImage(this._map, function(err, canvas) {
            //download(canvas.toDataURL("image/png"), "mapView.png", "image/png");
            console.log("leaflet-image: " + err);
            if (canvas) {
                this.captureGIF(selection, canvas, periodInSecs, callback=callback);
            }
        }.bind(this));
    },




    captureGIF: function(selection=null, baseCanvas=null, durationSecs=2, callback=null) {
        this._mapMoving = true;

        let sx, sy, sw, sh;
        if (selection) {
            sx = selection.topLeft.x;
            sy = selection.topLeft.y;
            sw = selection.width;
            sh = selection.height;
        } else {
            sx = sy = 0;
            sw = this._size.x;
            sh = this._size.y;
        }


        // set up GIF encoder
        let pd = this._progressDisplay,
            frameTime = Date.now(),
            // we use a frame rate of 25 fps beecause that yields a nice
            //  4 1/100-th second delay between frames
            frameRate = 25,
            numFrames = durationSecs * frameRate,
            delay = 1000 / frameRate,

            encoder = new GIF({
                workers: 8,
                quality: 8,
                transparent: 'rgba(0,0,0,0)',
                workerScript: GIFJS_WORKER_URL
            });


        this._encoder = encoder;

        encoder.on( 'progress', function( p ) {
            msg = `Encoding frames...${~~(p*100)}%`;
            // console.log(msg);
            this._progressDisplay.textContent = msg;
        }.bind( this ) );

        encoder.on('finished', function( blob ) {
            // window.open(URL.createObjectURL(blob));

            if (blob) {
                download(blob, "output.gif", 'image/gif' );
            }

            document.body.removeChild( this._progressDisplay );
            delete this._progressDisplay

            this._mapMoving = false;
            this._capturing = false;
            if (!this._paused) {
                this.animate();
            }
            if (callback) {
                callback();
            }
        }.bind( this ) );


        function canvasSubtract(newCanvas, oldCanvas){
            if (!oldCanvas) {
                return newCanvas;
            }
            let ctxOld = oldCanvas.getContext('2d'),
                dataOld = ctxOld.getImageData(0,0,sw,sh),
                dO = dataOld.data,
                ctxNew = newCanvas.getContext('2d'),
                dataNew = ctxNew.getImageData(0,0,sw,sh),
                dN = dataNew.data,
                len = dO.length;

            if (dN.length != len){
                console.log("canvasDiff: canvases are different size");
                return;
            }
            for (let i=0; i<len; i+=4) {
                if (dO[i] == dN[i] &&
                    dO[i+1] == dN[i+1] &&
                    dO[i+2] == dN[i+2]
                    && dO[i+3] == dN[i+3]
                    ) {

                    dO[i] = 0;
                    dO[i+1] = 0;
                    dO[i+2] = 0;
                    dO[i+3] = 0;
                } else {
                    dO[i] = dN[i];
                    dO[i+1] = dN[i+1];
                    dO[i+2] = dN[i+2];
                    // dO[i+3] = dN[i+3];
                    // console.log(dN[i+3]);
                    dO[i+3] = 255;
                }
            }
            ctxOld.putImageData(dataOld,0,0);
            return oldCanvas;
        }

        function display(canvas, title){
            let w = window.open(canvas.toDataURL("image/png"), target='_blank');
            // w.document.write(`<title>${title}</title>`);
        }
        // console.log(`GIF output: ${numFrames.toFixed(4)} frames, delay=${delay.toFixed(4)}`);
        let h1 = this.heatflask_icon.height,
            w1 = this.heatflask_icon.width,
            himg = [50, h1*50/w1],
            hd = [2, sh-himg[0]-2, himg[0], himg[1]],
            h2 = this.strava_icon.height,
            w2 = this.strava_icon.width,
            simg = [50, h2*50/w2],
            sd = [sw-simg[0]-2, sh-simg[1]-2, simg[0], simg[1]];
            
        framePrev = null;
        // Add frames to the encoder
        for (let i=0, num=~~numFrames; i<num; i++, frameTime+=delay){
            let msg = `Rendering frames...${~~(i/num * 100)}%`;

            // let timeOffset = (this._timeScale * frameTime) % this._period;
            // console.log( `frame${i} @ ${timeOffset}`);

            pd.textContent = msg;

            // create a new canvas
            let frame = document.createElement('canvas');
            frame.width = sw;
            frame.height = sh;
            frameCtx = frame.getContext('2d');

            // clear the frame
            frameCtx.clearRect( 0, 0, sw, sh);

            // lay the baselayer down
            baseCanvas && frameCtx.drawImage( baseCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

            // render this set of dots
            this.drawLayer(frameTime);

            // draw dots onto frame
            frameCtx.drawImage(this._dotCanvas, sx, sy, sw, sh, 0, 0, sw, sh);

            // Put Heatflask and Strava attribution images on the frame
            let ga = frameCtx.globalAlpha
            frameCtx.globalAlpha = 0.3
            frameCtx.drawImage(this.heatflask_icon, hd[0], hd[1], hd[2], hd[3]);
            frameCtx.drawImage(this.strava_icon, sd[0], sd[1], sd[2], sd[3]);
            frameCtx.globalAlpha = ga

            let gifFrame = canvasSubtract(frame, framePrev);
            // display(gifFrame, `frame_${i}`);

            let thisDelay = (i == num-1)? ~~(delay/2) : delay
            // console.log("frame "+i+": delay="+thisDelay);

            encoder.addFrame(gifFrame, {
                copy: true,
                // shorter delay after final frame
                delay: thisDelay,
                transparent: (i==0)? null : "#F0F0F0",
                dispose: 1 // leave as is
            });

            framePrev = frame;
        }

        // encode the Frame array
        encoder.render();
    },

    abortCapture: function() {
        // console.log("capture aborted");
        this._progressDisplay.textContent = "aborting...";
        if (this._encoder) {
            this._encoder.abort();
            document.body.removeChild( this._progressDisplay );
            delete this._progressDisplay

            this._mapMoving = false;
            this._capturing = false;
            if (!this._paused) {
                this.animate();
            }
        }
    },

    setDotColors: function() {
        let itemsList = Object.values( this._items ),
            numItems = itemsList.length;

        this._colorPalette = colorPalette(numItems, this.options.dotAlpha);
        for ( item of itemsList ) {
            itemsList[ i ].dotColor = this._colorPalette[ i ];
        }
   
    }

} );  // end of L.DotLayer definition

L.dotLayer = function( items, options ) {
    return new L.DotLayer( items, options );
};



/*
    From "Making annoying rainbows in javascript"
    A tutorial by jim bumgardner
*/
function makeColorGradient(frequency1, frequency2, frequency3,
                             phase1, phase2, phase3,
                             center, width, len, alpha) {
    let palette = new Array(len);

    if (center == undefined)   center = 128;
    if (width == undefined)    width = 127;
    if (len == undefined)      len = 50;

    for (let i = 0; i < len; ++i) {
        let r = Math.round(Math.sin(frequency1*i + phase1) * width + center),
            g = Math.round(Math.sin(frequency2*i + phase2) * width + center),
            b = Math.round(Math.sin(frequency3*i + phase3) * width + center);
        // palette[i] = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        palette[i] = `rgb(${r}, ${g}, ${b})`;
    }
    return palette;
};

function colorPalette(n, alpha) {
    center = 128;
    width = 127;
    steps = 10;
    frequency = 2*Math.PI/steps;
    return makeColorGradient(frequency,frequency,frequency,0,2,4,center,width,n,alpha);
};


