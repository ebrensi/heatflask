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
  let s = String(this);
  while (s.length < (size || 2)) {s = "0" + s;}
  return s;
};

// ------------------------------
function hhmmss( secs ) {
    let totalSeconds = secs;

    const hours = Math.floor(totalSeconds / 3600).pad(2);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60).pad(2);
    const seconds = Math.round((totalSeconds % 60)).pad(2);

    return `${hours}:${minutes}:${seconds}`;
}

function img( url, w=20, h=20, alt="" ) {
  return `<img src='${url}' width=${w}px height=${h}px class="img-fluid" alt="${alt}">`;
}


// return an HTML href tag from a url and text
function href( url, text ) {
    return `<a href='${url}' target='_blank'>${text}</a>`;
}

// For DataTables
function formatDate( data, type, row, meta ) {
    const date = new Date( data );
    return ( type === "display" || type === "filter" ) ?
        date.toLocaleString( "en-US", { hour12: false } ) : date;
}

function ip_lookup_url(ip) {
    return
}

function formatIP( data, type, row, meta ) {
    if ( data ) {
        const ip = data;
        return ( type === "display" ) ? href( ip_lookup_url( ip ), ip ) : ip;
    } else {
        return "";
    }
}

function formatUserId ( data, type, row ) {
    if ( data ) {
        if ( type == "display" ) {
            const link = "/" + data;
            if (row.profile) {
                const avatar = img( row.profile, 40, 40, data );
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
    const dataToSend = JSON.stringify(payload);
    xmlHttp.send(dataToSend);
}

// ---------------------------------------
function touchHandler(event) {
    // Add touch support by converting touch events to mouse events
    // Source: http://stackoverflow.com/a/6362527/725573

    const touches = event.changedTouches,
        first = touches[0];
    let type = "";

    switch(event.type) {
        case "touchstart": type = "mousedown"; break;
        case "touchmove":  type = "mousemove"; break;
        case "touchend":   type = "mouseup";   break;
        default: return;
    }

    //Convert the touch event into it's corresponding mouse event
    const simulatedEvent = document.createEvent("MouseEvent");
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


// debugger;


let Pikaday = window.Pikaday,
    msgpack = window.msgpack,
    PersistentWebSocket = window.PersistentWebSocket,
    // $ = window.$ = function() {},
    // jQuery = window.jQuery = function() {},
    ga = window.ga,
    GIF = window.GIF,
    leafletImage = window.leafletImage,
    download = window.download,
    open = window.open,
    sessionStorage = window.sessionStorage,
    localStorage = window.localStorage,
    simpleDatatables = window.simpleDatatables,
    PouchDB = window.PouchDB,
    // JSCompiler_renameProperty = window.JSCompiler_renameProperty,
    SVGElementInstance = window.SVGElementInstance;

/* 
 * Workaround for 1px lines appearing in some browsers due to fractional transforms
 * and resulting anti-aliasing.
 * https://github.com/Leaflet/Leaflet/issues/3575
 */
(function(){
    var originalInitTile = L.GridLayer.prototype._initTile
    L.GridLayer.include({
        _initTile: function (tile) {
            originalInitTile.call(this, tile);

            var tileSize = this.getTileSize();

            tile.style.width = tileSize.x + 1 + 'px';
            tile.style.height = tileSize.y + 1 + 'px';
        }
    });
})();


/* 
 * Workaround for 1px lines appearing in some browsers due to fractional transforms
 * and resulting anti-aliasing.
 * https://github.com/Leaflet/Leaflet/issues/3575
 */
(function(){
    var originalInitTile = L.GridLayer.prototype._initTile
    L.GridLayer.include({
        _initTile: function (tile) {
            originalInitTile.call(this, tile);

            var tileSize = this.getTileSize();

            tile.style.width = tileSize.x + 1 + 'px';
            tile.style.height = tileSize.y + 1 + 'px';
        }
    });
})()