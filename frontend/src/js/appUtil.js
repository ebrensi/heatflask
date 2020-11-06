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

/**
 * Binary Search returns the index of the target value in a sorted array-like
 *    data structure.
 * @param  {function} get -- accessor function
 * @param  {number} target
 * @param  {number} start -- index of first value
 * @param  {number} end   -- index of last value
 * @param  {function} compare -- function compare(x,y) > 0 if x ">" y
 * @return {number}
 */
export function binarySearch(get, target, start, end, compare) {
  if (start > end) {
    return false
  }

  const mid = Math.floor((start + end) / 2)

  if (compare(get(mid), target) === 0) {
    return mid
  }

  if (compare(get(mid), target) > 0) {
    return binarySearch(get, target, start, mid - 1)
  } else {
    return binarySearch(get, target, mid + 1, end)
  }
}

/**
 * Histogram for analysis
 * @param  {Iterable} points
 * @param  {Array<Number>} bins -- boundaries for bins
 * @return {Array<Number>}
 *
 * @example
 *  const bins = histogram([1,1,2,2,3,4,4,4], [2, 3])
 *
 * Then bins == [2, 3, 3]
 *
 */
export function histogram(points, bins) {
  const binCounts = new Array(bins.length + 1).fill(0)
  const last = bins.length - 1
  for (const p of points) {
    if (p < bins[0]) {
      binCounts[0]++
    } else if (p > bins[last]) {
      binCounts[bins.length]++
    } else {
      for (let i = 0; i < binCounts.length; i++) {
        if (bins[i] <= p && p <= bins[i + 1]) {
          binCounts[i]++
          break
        }
      }
    }
  }
  // console.log(bins)
  return binCounts
}
