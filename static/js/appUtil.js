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

function ip_lookup_url( ip ) {
    return ( ip? "http://freegeoip.net/json/"+ip : "#" );
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
            return href( "/" + data, img( row.profile, w = 40, h = 40, alt = data ) );
        } else {
            return data;
        }
    } else {
        return "";
    }
}

function formatGroup(data, type, row) {
      if (!data || data == 1) {
        return ""
      }
      if (type == "display") {

        let owner_id = row.owner? row.owner : USER_ID,
            url = GROUP_ACTIVITY_URL(owner_id, row.id);

        return href(url, "<i class='fa fa-users'></i>");
      } else {
        return data;
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


ATYPE_SPECS = [
        ["Ride", "speed", "#2B60DE"],  // Ocean Blue
        ["Run", "pace", "#FF0000"],  // Red
        ["Swim", "speed", "#00FF7F"],  // SpringGreen
        ["Hike", "pace", "#FF1493"],  // DeepPink
        ["Walk", "pace", "#FF00FF"],  // Fuchsia
        ["AlpineSki", null, "#800080"],  // Purple
        ["BackcountrySki", null, "#800080"],  // Purple
        ["Canoeing", null, "#FFA500"],  // Orange
        ["Crossfit", null, null],
        ["EBikeRide", "speed", "#0000CD"],  // MediumBlue
        ["Elliptical", null, null],
        ["IceSkate", "speed", "#663399"],  // RebeccaPurple
        ["InlineSkate", null, "#8A2BE2"],  // BlueViolet
        ["Kayaking", null, "#FFA500"],  // Orange
        ["Kitesurf", "speed", null],
        ["NordicSki", null, "#800080"],  // purple
        ["RockClimbing", null, "#4B0082"],  // Indigo
        ["RollerSki", "speed", "#800080"],  // Purple
        ["Rowing", "speed", "#FA8072"],  // Salmon
        ["Snowboard", null, "#00FF00"],  // Lime
        ["Snowshoe", "pace", "#800080"],  // Purple
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

    ATYPE_MAP[atype[0]] = {"vtype": atype[1], "pathColor": atype[2]};
}
