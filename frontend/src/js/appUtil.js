function ws_prefix() {
  if (window.location.protocol == "https:")
    return "wss://";
  else
    return "ws://";
}

export const WS_SCHEME = ws_prefix();


// runtime arguments that come from the backend server are embedded in the html
// as a json string, which .
const R = window["_args"];

// R is defined at runtime and has attributes with these exact names
// so we don't want closure compiler renaming them
export const ONLOAD_PARAMS = R["QUERY"],
             CLIENT_ID = R["CLIENT_ID"],
             OFFLINE = R["OFFLINE"],
             ADMIN = R["ADMIN"],
             FLASH_MESSAGES = R["FLASH_MESSAGES"],
             MAPBOX_ACCESS_TOKEN = R["MAPBOX_ACCESS_TOKEN"],
             CAPTURE_DURATION_MAX = R["CAPTURE_DURATION_MAX"],
             DEFAULT_DOTCOLOR = R["DEFAULT_DOTCOLOR"],
             MEASURMENT_PREFERENCE = R["MEASURMENT_PREFERENCE"],
             USER_ID = R["USER_ID"],
             BASE_USER_URL = R["BASE_USER_URL"],
             SHARE_PROFILE = R["SHARE_PROFILE"],
             SHARE_STATUS_UPDATE_URL = R["SHARE_STATUS_UPDATE_URL"],
             ACTIVITY_LIST_URL = R["ACTIVITY_LIST_URL"],
             BEACON_HANDLER_URL = R["BEACON_HANDLER_URL"];

export const DIST_UNIT = (MEASURMENT_PREFERENCE=="feet")? 1609.34 : 1000.0,
             DIST_LABEL = (MEASURMENT_PREFERENCE=="feet")?  "mi" : "km",
             SPEED_SCALE = 5.0,
             SEP_SCALE = {m: 0.15, b: 15.0},
             WEBSOCKET_URL = WS_SCHEME+window.location.host+"/data_socket";



// Courtesy of TwoFuckingDevelopers (@2fdevs, @elecash and @qmarcos)
export function isMobileDevice() {
    return (
      typeof window.orientation !== "undefined") ||
      (navigator.userAgent.indexOf('IEMobile') !== -1
    );
};


//--------------------------------
Number.prototype.pad = function(size) {
  let s = String(this);
  while (s.length < (size || 2)) {s = "0" + s;}
  return s;
};

// ------------------------------
export function hhmmss( secs ) {
    let totalSeconds = secs;

    const hours = Math.floor(totalSeconds / 3600).pad(2);
    totalSeconds %= 3600;
    const minutes = Math.floor(totalSeconds / 60).pad(2);
    const seconds = Math.round((totalSeconds % 60)).pad(2);

    return `${hours}:${minutes}:${seconds}`;
}

export function img( url, w=20, h=20, alt="" ) {
  return `<img src='${url}' width=${w}px height=${h}px class="img-fluid" alt="${alt}">`;
}


// return an HTML href tag from a url and text
export function href( url, text ) {
    return `<a href='${url}' target='_blank'>${text}</a>`;
}


export function secs2DDHHMM(sec){
  if (!sec || sec <= 0) {
    return "??"
  }
  let days = Math.floor(sec / 86400);
  sec -= days * 86400;

  // calculate (and subtract) whole hours
  let hours = Math.floor(sec / 3600) % 24;
  sec -= hours * 3600;

  // calculate (and subtract) whole minutes
  let minutes = Math.floor(sec / 60) % 60;
  sec -= minutes * 60;

  return `${days.pad(2)}:${hours.pad(2)}:${minutes.pad(2)}`
}


export function noop(){}
