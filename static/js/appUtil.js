// Courtesy of TwoFuckingDevelopers (@2fdevs, @elecash and @qmarcos)
function isMobileDevice() {
    return (typeof window.orientation !== "undefined") || (navigator.userAgent.indexOf('IEMobile') !== -1);
};


// ------------------------------
function hhmmss( secs ) {
    return new Date( secs * 1000 ).toISOString().substr( 11, 8 );
}

function img( url, w=20, h=20, alt="" ) {
  return `<img src=${url} width=${w}px height=${h}px class="img-fluid" alt="${alt}">`;
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
        let url = GROUP_ACTIVITY_URL + row.id;
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

// make touch events simulate mouse events via _touchHandler
document.addEventListener("touchstart", touchHandler, true);
document.addEventListener("touchmove", touchHandler, true);
document.addEventListener("touchend", touchHandler, true);
document.addEventListener("touchcancel", touchHandler, true);
