
function stravaActivityURL( id ) {
    return `https://www.strava.com/activities/${id}`;
}

function stravaAthleteURL( id ) {
    return `https://www.strava.com/athletes/${id}`;
}

function href( url, text ) {
    return `<a href='${url}' target='_blank'>${text}</a>`;
}

function ip_lookup_url( ip ) {
    return ip ? `http://freegeoip.net/json/${ip}` : "#";
}

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

function hhmmss( secs ) {
    return new Date( secs * 1000 ).toISOString().substr( 11, 8 );
}

function img( url, w=20, h=20, alt="" ) {
  return `<img src=${url} width=${w} height=${h} class="img-fluid" alt="${alt}">`;
}
