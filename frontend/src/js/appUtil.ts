/**  appUtil.js -- this is where we define constants and general utility functions
 *   that don't fit anywhere else.
 *
 *   importing it has no side-effects
 */
export function padNum(num: number, size: number): string {
  let s = String(num)
  while (s.length < (size || 2)) {
    s = "0" + s
  }
  return s
}

/** "HH:MM:SS" string given number of seconds */
export function HHMMSS(secs: number): string {
  let totalSeconds = secs

  const hours = padNum(Math.floor(totalSeconds / 3600), 2)
  totalSeconds %= 3600
  const minutes = padNum(Math.floor(totalSeconds / 60), 2)
  const seconds = padNum(Math.round(totalSeconds % 60), 2)

  return `${hours}:${minutes}:${seconds}`
}

/** "DD:HH:MM" string given number of seconds */
export function DDHHMM(sec: number): string {
  if (!sec || sec <= 0) {
    return "??"
  }
  const days = Math.floor(sec / 86400)
  sec -= days * 86400

  // calculate (and subtract) whole hours
  const hours = Math.floor(sec / 3600) % 24
  sec -= hours * 3600

  // calculate (and subtract) whole minutes
  const minutes = Math.floor(sec / 60) % 60
  sec -= minutes * 60

  return `${padNum(days, 2)}:${padNum(hours, 2)}:${padNum(minutes, 2)}`
}

/** image tag string, given an image url */
export function img(
  url: string,
  w = 20,
  h = 20,
  alt: number | string = ""
): string {
  return `<img loading=lazy src='${url}' width=${w}px height=${h}px alt="${alt}">`
}

/** HTML href tag from a url and text */
export function href(url: string, text: string): string {
  return `<a href='${url}' target='_blank'>${text}</a>`
}

/** do-nothing function */
export function noop(): void {
  return
}

/** Binary Search returns the index of the target value in a sorted array-like
 *    data structure.
 */
export function binarySearch<T>(
  get: (i: number) => T,
  target: T,
  start: number,
  end: number,
  compare?: (x: T, y: T) => number
): number {
  if (start > end) {
    return
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

/**  Histogram for analysis
 * @example
 *  const bins = histogram([1,1,2,2,3,4,4,4], [2, 3])
 *
 * Then bins == [2, 3, 3]
 */
export function histogram(points: Iterable<number>, bins: number[]): number[] {
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

/**
 * Filters outliers from an Array using standard IQR method. Creates a new Array.
 * adapted from https://gist.github.com/ogun/f19dc055e6b84d57e8186cbc9eaa8e45 (Kemal Ogun Isik)
 */
type quartObj = { q1: number; q3: number; iqr: number }
export function quartiles(someArray: Array<number>): quartObj {
  if (someArray.length < 4) return

  const values = someArray.slice().sort((a, b) => a - b)
  const n = values.length
  const n_4 = n / 4
  const evenQuarters = n_4 % 1 === 0

  const q1 = evenQuarters
    ? (1 / 2) * (values[n_4] + values[n_4 + 1])
    : values[Math.floor(n_4 + 1)]

  const q3 = evenQuarters
    ? (1 / 2) * (values[n * (3 / 4)] + values[n * (3 / 4) + 1])
    : values[Math.ceil(n * (3 / 4) + 1)]

  return { q1, q3, iqr: q3 - q1 }
}

/*
 * Some functions that make de-janking easier via async code
 */

/** Async sleep
 * @param t number of seconds
 */
export function sleep(t: number): Promise<number> {
  return new Promise((resolve) => window.setTimeout(resolve, t))
}

/** Schedule a functin to run on next microevent loop
 * @param cb callback function
 */
export function queueTask(cb: (x: unknown) => void): void {
  window.setTimeout(cb, 0)
}

/** Async wait untill next Task
 */
export function nextTask(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0))
}

/** Async wait until next paint
 * @returns
 */
export function nextAnimationFrame(): Promise<number> {
  let resolve = null
  const promise: Promise<number> = new Promise((r) => (resolve = r))
  window.requestAnimationFrame(resolve)
  return promise
}
