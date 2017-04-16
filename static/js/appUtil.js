function hhmmss( secs ) {
    return new Date( secs * 1000 ).toISOString().substr( 11, 8 );
}

function img( url, w=20, h=20, alt="" ) {
  return `<img src=${url} width=${w} height=${h} class="img-fluid" alt="${alt}">`;
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
// ----------------------



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




