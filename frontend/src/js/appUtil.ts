/*
 *   appUtil.js -- this is where we define constants and general utility functions
 *   that don't fit anywhere else
 */
export function padNum(num: number, size: number): string {
  let s = String(num)
  while (s.length < (size || 2)) {
    s = "0" + s
  }
  return s
}

// return a "HH:MM:SS" string given number of seconds
export function HHMMSS(secs: number): string {
  let totalSeconds = secs

  const hours = padNum(Math.floor(totalSeconds / 3600), 2)
  totalSeconds %= 3600
  const minutes = padNum(Math.floor(totalSeconds / 60), 2)
  const seconds = padNum(Math.round(totalSeconds % 60), 2)

  return `${hours}:${minutes}:${seconds}`
}

// return a "DD:HH:MM" string given number of seconds
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

// return an image tag string, given an image url
export function img(url: string, w = 20, h = 20, alt = ""): string {
  return `<img src='${url}' width=${w}px height=${h}px class="img-fluid" alt="${alt}">`
}

// return an HTML href tag from a url and text
export function href(url: string, text: string): string {
  return `<a href='${url}' target='_blank'>${text}</a>`
}

// define the do-nothing function, noop
export function noop(): void {
  return
}

/**
 * Binary Search returns the index of the target value in a sorted array-like
 *    data structure.
 */
export function binarySearch(
  get: (i: number) => unknown,
  target: unknown,
  start: number,
  end: number,
  compare?: (x, y) => number
): number {
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
 * @example
 *  const bins = histogram([1,1,2,2,3,4,4,4], [2, 3])
 *
 * Then bins == [2, 3, 3]
 *
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
export function sleep(t: number): Promise<number> {
  return new Promise((resolve) => window.setTimeout(resolve, t))
}

export function queueTask(cb: (x: unknown) => unknown): void {
  window.setTimeout(cb, 0)
}

export function nextTask(): Promise<void> {
  return new Promise((resolve) => queueTask(resolve))
}

export function nextAnimationFrame(): Promise<number> {
  let resolve = null
  const promise: Promise<number> = new Promise((r) => (resolve = r))
  window.requestAnimationFrame(resolve)
  return promise
}

/*
 *  An object for general rectangular bounds
 */
type BoundsData = [number, number, number, number]
type RectObj = { x: number; y: number; w: number; h: number }
export class Bounds {
  _bounds: BoundsData

  constructor() {
    this._bounds = [NaN, NaN, NaN, NaN]
    // [xmin, ymin, xmax, ymax]
  }

  reset(): Bounds {
    this._bounds.fill(NaN)
    return this
  }

  isEmpty(): boolean {
    return isNaN(this._bounds[0])
  }

  update(x: number, y: number): Bounds {
    if (this.isEmpty()) {
      this._bounds[0] = this._bounds[2] = x
      this._bounds[1] = this._bounds[3] = y
      return
    }
    if (x < this._bounds[0]) this._bounds[0] = x
    if (y < this._bounds[1]) this._bounds[1] = y
    if (x > this._bounds[2]) this._bounds[2] = x
    if (y > this._bounds[3]) this._bounds[3] = y
    return this
  }

  updateBounds(otherBoundsObj: Bounds): Bounds {
    const [x1, y1, x2, y2] = otherBoundsObj._bounds
    this.update(x1, y1)
    this.update(x2, y2)
    return this
  }

  contains(x: number, y: number): boolean {
    const [xmin, ymin, xmax, ymax] = this._bounds
    return xmin <= x && x <= xmax && ymin <= y && y <= ymax
  }

  containsBounds(otherBoundsObj: Bounds): boolean {
    const [x1, y1, x2, y2] = otherBoundsObj._bounds
    return this.contains(x1, y1) && this.contains(x2, y2)
  }

  overlaps(otherBoundsObj: Bounds): boolean {
    const [xmin, ymin, xmax, ymax] = this._bounds
    const [x1, y1, x2, y2] = otherBoundsObj._bounds
    return x2 >= xmin && x1 <= xmax && y2 >= ymin && y1 <= ymax
  }

  /**
   * Euclidean distance between two bounds
   */
  dist(otherBoundsObj: Bounds): number {
    const b = this._bounds
    const o = otherBoundsObj._bounds
    return Math.sqrt(
      (b[0] - o[0]) ** 2 +
        (b[1] - o[1]) ** 2 +
        (b[2] - o[2]) ** 2 +
        (b[3] - o[3]) ** 2
    )
  }

  copyTo(otherBoundsObj: Bounds): void {
    const b = this._bounds
    const o = otherBoundsObj._bounds
    o[0] = b[0]
    o[1] = b[1]
    o[2] = b[2]
    o[3] = b[3]
  }

  get rect(): RectObj {
    const [xmin, ymin, xmax, ymax] = this._bounds
    return { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin }
  }

  get data(): BoundsData {
    return this._bounds
  }

  set data(data: BoundsData) {
    this._bounds = data
  }
}
