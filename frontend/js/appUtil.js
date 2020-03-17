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


// let Pikaday = window.Pikaday,
//     msgpack = window.msgpack,
//     PersistentWebSocket = window.PersistentWebSocket,
//     // $ = window.$ = function() {},
//     // jQuery = window.jQuery = function() {},
//     ga = window.ga,
//     GIF = window.GIF,
//     leafletImage = window.leafletImage,
//     download = window.download,
//     open = window.open,
//     sessionStorage = window.sessionStorage,
//     localStorage = window.localStorage,
//     simpleDatatables = window.simpleDatatables,
//     PouchDB = window.PouchDB,
//     // JSCompiler_renameProperty = window.JSCompiler_renameProperty,
//     SVGElementInstance = window.SVGElementInstance;

