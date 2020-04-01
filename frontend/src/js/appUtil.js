
export const WS_SCHEME = ws_prefix();

function ws_prefix() {
  if (window.location.protocol == "https:")
    return "wss://";
  else
    return "ws://";
}

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
