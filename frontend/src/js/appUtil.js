/*
 *   appUtil.js -- this is where we define constants and general utility functions
 *   that don't fit anywhere else
 */

// Add .pad method to Number objects
Number.prototype.pad = function (size) {
  let s = String(this)
  while (s.length < (size || 2)) {
    s = "0" + s
  }
  return s
}

// return a "HH:MM:SS" string given number of seconds
export function HHMMSS(secs) {
  let totalSeconds = secs

  const hours = Math.floor(totalSeconds / 3600).pad(2)
  totalSeconds %= 3600
  const minutes = Math.floor(totalSeconds / 60).pad(2)
  const seconds = Math.round(totalSeconds % 60).pad(2)

  return `${hours}:${minutes}:${seconds}`
}

// return a "DD:HH:MM" string given number of seconds
export function DDHHMM(sec) {
  if (!sec || sec <= 0) {
    return "??"
  }
  let days = Math.floor(sec / 86400)
  sec -= days * 86400

  // calculate (and subtract) whole hours
  let hours = Math.floor(sec / 3600) % 24
  sec -= hours * 3600

  // calculate (and subtract) whole minutes
  let minutes = Math.floor(sec / 60) % 60
  sec -= minutes * 60

  return `${days.pad(2)}:${hours.pad(2)}:${minutes.pad(2)}`
}

// return an image tag string, given an image url
export function img(url, w = 20, h = 20, alt = "") {
  return `<img src='${url}' width=${w}px height=${h}px class="img-fluid" alt="${alt}">`
}

// return an HTML href tag from a url and text
export function href(url, text) {
  return `<a href='${url}' target='_blank'>${text}</a>`
}

// define the do-nothing function, noop
export function noop() {}

/*
  depending on whether the page this script is in is http or https, we need to
  make sure the websocket protocol matches
*/
export function ws_prefix() {
  if (window.location.protocol == "https:") {
    return "wss://"
  } else {
    return "ws://"
  }
}

// Courtesy of TwoFuckingDevelopers (@2fdevs, @elecash and @qmarcos)
function isMobileDevice() {
  return (
    typeof window.orientation !== "undefined" ||
    navigator.userAgent.indexOf("IEMobile") !== -1
  )
}

export const MOBILE = isMobileDevice()
