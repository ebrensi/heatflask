// declare function drawDebugRect(x: number, y: number, w: number, h: number): void

declare function logi(v0: i64, v1?: i64, v2?: i64, v3?: i64): void
declare function logf(v0: f64, v1?: f64, v2?: f64, v3?: f64): void

export let PATH_IMAGEDATA_OFFSET: usize
export let DOT_IMAGEDATA_OFFSET: usize

// reserve 4 32-bit words for each set of bounds
// [xmin, xmax, ymin, ymax]
export let PATH_DRAW_BOUNDS: usize
export let DOT_DRAW_BOUNDS: usize

export let WIDTH: i32 = 0
export let HEIGHT: i32 = 0

// transform: 4 x 64-bit float
// [TA1, TB1, TA2, TB2]
// export const TRANSFORM = memory.data(4 << 6)
let TA1: f64
let TB1: f64
let TA2: f64
let TB2: f64

let COLOR: i32
let MASKEDCOLOR: i32
let ALPHAMASK: i32
let ALPHAPOS: i32
let ALPHASCALE: f32 = 1

let LINEWIDTH: i32 = 1

export function allocateBasics(): void {
  PATH_DRAW_BOUNDS = heap.alloc(4 << 5)
  DOT_DRAW_BOUNDS = heap.alloc(4 << 5)
}

export function allocateViewport(width: i32, height: i32): usize {
  const viewportPixelSize = width * height
  const viewportBufSize = viewportPixelSize << 2
  const totBufSize: usize = viewportBufSize << 1
  if (WIDTH * HEIGHT == 0) {
    PATH_IMAGEDATA_OFFSET = heap.alloc(totBufSize)
  } else {
    PATH_IMAGEDATA_OFFSET = heap.realloc(DOT_IMAGEDATA_OFFSET, totBufSize)
  }

  DOT_IMAGEDATA_OFFSET = PATH_IMAGEDATA_OFFSET + viewportBufSize

  WIDTH = width
  HEIGHT = height
  return PATH_IMAGEDATA_OFFSET
}

/*
 * Getters and Setters
 */
export function setTransform(a1: f64, b1: f64, a2: f64, b2: f64): void {
  // store<f64>(TRANSFORM, a1)
  // store<f64>(TRANSFORM + 64, b1)
  // store<f64>(TRANSFORM + 128, a2)
  // store<f64>(TRANSFORM + 256, b2)
  TA1 = a1
  TB1 = b1
  TA2 = a2
  TB2 = b2
}

export function setAlphaMask(mask: i32, pos: i32): void {
  ALPHAMASK = mask
  ALPHAPOS = pos
}

export function setLineWidth(w: i32): void {
  LINEWIDTH = w
}

export function setAlphaScale(alphaScale: f32): void {
  ALPHASCALE = alphaScale
}

export function setColor(color: u32): void {
  COLOR = color
  MASKEDCOLOR = ALPHAMASK & COLOR
}

@inline
function inViewportBounds(x: i32, y: i32): boolean {
  return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT
}

// Reset Draw bounds
@inline
export function resetDrawBounds(loc: usize): void {
  store<i32>(loc, -1)
}


// indicate whether bounds are empty
@inline
export function drawBoundsEmpty(loc: usize): boolean {
  return load<i32>(loc) == -1
}

// Update draw bounds
@inline
export function updateDrawBounds(loc: usize, x: i32, y: i32): void {
  const xmin = loc
  const ymin = loc + 32
  const xmax = loc + 64
  const ymax = loc + 96

  if (drawBoundsEmpty(loc)) {
    store<i32>(xmin, x)
    store<i32>(ymin, y)
    store<i32>(xmax, x)
    store<i32>(ymax, y)
    return
  }
  if (x < load<i32>(xmin)) store<i32>(xmin, x)
  else if (x < load<i32>(xmax)) store<i32>(xmax, x)

  if (y < load<i32>(ymin)) store<i32>(ymin, y)
  else if (y > load<i32>(ymax)) store<i32>(ymax, y)
}


@inline
function clip(v: i32, vmax: i32): i32 {
  if (v < 0) return <i32>0
  else if (v > vmax) return vmax
  return v
}


// Clear rectangle
@inline
export function clearRect(loc: usize, x: i32, y: i32, w: i32, h: i32): void {
  if (w == 0 || h == 0) return
  const widthInBytes = w << 2
  const lastRow = y + h
  for (let row = y; row < lastRow; row++) {
    const offsetBytes = (row * WIDTH + x) << 2
    memory.fill(loc + offsetBytes, 0, widthInBytes)
  }
}


@inline
function moveRow(
  loc: usize,
  sx: i32,
  sy: i32,
  dx: i32,
  dy: i32,
  row: i32,
  wBytes: i32
): void {
  const sOffset = (sx + (sy + row) * WIDTH) << 2
  const dOffset = (dx + (dy + row) * WIDTH) << 2
  memory.copy(loc + dOffset, sOffset, wBytes)
}

/*
 * This function moves the pixels from one rectangular region
 *  of an imageData object to another, possibly overlapping
 *  rectanglular region of equal size.
 */
function moveRect(
  bounds: usize,
  loc: usize,
  shiftX: i32,
  shiftY: i32
): void {
  if ((shiftX == 0 && shiftY == 0) || drawBoundsEmpty(bounds)) return

  const rx = load<i32>(bounds)      // xmin
  const ry = load<i32>(bounds + 32) // ymin
  const rw = load<i32>(bounds + 64) - rx // xmax - xmin
  const rh = load<i32>(bounds + 96) - ry // ymax - ymin

  // destination rectangle
  const dx = clip(rx + shiftX, WIDTH)
  const dy = clip(ry + shiftY, HEIGHT)
  const w = clip(rx + rw + shiftX, WIDTH) - dx
  const h = clip(ry + rh + shiftY, HEIGHT) - dy

  if (w === 0 || h === 0) {
    /*
     * If there is no destination rectangle (nothing in view)
     *  we just clear the source rectangle and exit
     */
    clearRect(loc, rx, ry, rw, rh)
    resetDrawBounds(bounds)
    return
  }

  // source rectangle
  const sx = dx - shiftX
  const sy = dy - shiftY

  // clear rectangle
  const cx = dy != sy ? rx : sx < dx ? sx : dx + w
  const cy = dy < sy ? ry : dy > sy ? ry + h : sy
  const cw = dy != sy ? rw : abs<i32>(sx - dx)
  const ch = dy != sy ? rh - h : h

  if (cw && ch) clearRect(loc, cx, cy, cw, ch)

  /* We only bother copying if the destination rectangle is within
   * the imageData bounds
   */
  const widthInBytes = w << 2
  if (dy < sy) {
    /* if the source rectangle is below the destination
     then we copy rows from the top down */
    for (let row = 0; row < h; row++) {
      moveRow(loc, sx, sy, dx, dy, row, widthInBytes)
      memory.fill((loc + (rx + (sy + row) * WIDTH)) << 2, 0, rw << 2)
    }
  } else if (dy > sy) {
    /* otherwise we copy from the bottom row up */
    for (let row = h - 1; row >= 0; row--) {
      moveRow(loc, sx, sy, dx, dy, row, widthInBytes)
      memory.fill((loc + (rx + (sy + row) * WIDTH)) << 2, 0, rw << 2)
    }
  } else {
    for (let row = 0; row < h; row++) {
      moveRow(loc, sx, sy, dx, dy, row, widthInBytes)
    }
  }

  resetDrawBounds(bounds)
  updateDrawBounds(bounds, dx, dy)
  updateDrawBounds(bounds, dx + w, dy + h)
}

/*
 *  **** Dot Drawing functions ****
 */
@inline
export function drawSquare(fx: f64, fy: f64, size: f64): void {
  const dotOffset: f64 = size / <f64>2
  const s = <i32>size
  const x = <i32>Math.round(TA1 * fx + TB1 - dotOffset)
  const y = <i32>Math.round(TA2 * fy + TB2 - dotOffset)
  if (!inViewportBounds(x, y)) return
  updateDrawBounds(DOT_DRAW_BOUNDS, x, y)

  const xStart = max<i32>(0, x) // Math.max(0, tx)
  const xEnd = min<i32>(x + s, WIDTH)

  const yStart = max<i32>(0, y)
  const yEnd = min<i32>(y + s, HEIGHT)

  for (let row = yStart; row < yEnd; row++) {
    const offset = row * WIDTH
    const colStart = offset + xStart
    const colEnd = offset + xEnd
    fill32(colStart, colEnd, COLOR)
  }
}

@inline
export function drawCircle(fx: f64, fy: f64, r: i32): void {
  const x = <i32>Math.round(TA1 * fx + TB1)
  const y = <i32>Math.round(TA2 * fy + TB2)
  if (!inViewportBounds(x, y)) return
  updateDrawBounds(DOT_DRAW_BOUNDS, x, y)

  const r2 = r * r
  const yStart = max<i32>(-y, -r + 1)
  const yEnd = min<i32>(r, HEIGHT - y)

  for (let cy = yStart; cy < yEnd; cy++) {
    const offset = (cy + y) * WIDTH
    const cx = <i32>Math.round(Math.sqrt(<f64>(r2 - cy * cy)))
    const colStart = offset + max<i32>(0, x - cx)
    const colEnd = offset + min<i32>(x + cx, WIDTH)
    fill32(colStart, colEnd, COLOR)
  }
}

/**
 * Fills a range of adresses with a 32-bit values
 * repeat a 4-byte pattern
 */
@inline
function fill32(start: usize, end: usize, val32: i32): void {
  const endByte = (end << 2) + DOT_IMAGEDATA_OFFSET
  for (let i = (start << 2) + DOT_IMAGEDATA_OFFSET; i < endByte; i += 4) {
    store<i32>(i, val32)
  }

  // const startByte = (start << 2) + DOT_IMAGEDATA_OFFSET
  // store<i32>(startByte, val32)
  // memory.repeat(startByte + 4, startByte, 4, end - start - 1)
}

/*
 *  Path Drawing functions
 */
/* ***************************************************
 * This code line-drawing at the pixel level is adapted from
 * "anti-aliased thick line" at
 * http://members.chello.at/~easyfilter/bresenham.html
 * *******************************************************
 */

@inline
function setPixelAA(x: i32, y: i32, a: i32): void {
  const alpha = 0xff - a
  const color = MASKEDCOLOR | (alpha << ALPHAPOS)
  assert(inViewportBounds(x, y))
  store<i32>(<usize>((y * WIDTH + x) << 2) + PATH_IMAGEDATA_OFFSET, color)
}

/*
 * We use the Cohen-Southerland algorithm for clipping to the view-port
 * https://en.wikipedia.org/wiki/Cohen-Sutherland_algorithm
 */
// This pad is necessary because sometimes drawSegment draws Anti-Aliased points past its bundaries
const pad: f64 = 3

@inline
function CohenSoutherlandCode(x: f64, y: f64): u8 {
  let code: u8 = 0b0000 // initialised as being inside of [[clip window]]

  if (x < pad)
    // to the left of clip window
    code |= 0b0001
  else if (x > WIDTH - pad)
    // to the right of clip window
    code |= 0b0010
  if (y < pad)
    // below the clip window
    code |= 0b0100
  else if (y > HEIGHT - pad)
    // above the clip window
    code |= 0b1000
  return code
}

export function drawSegment(fx0: f64, fy0: f64, fx1: f64, fy1: f64): void {
  /* plot an anti-aliased line of width wd */

  fx0 = TA1 * fx0 + TB1
  fy0 = TA2 * fy0 + TB2
  fx1 = TA1 * fx1 + TB1
  fy1 = TA2 * fy1 + TB2

  // compute outcodes for P0, P1, and whatever point lies outside the clip rectangle
  let outcode0: u8 = CohenSoutherlandCode(fx0, fy0)
  let outcode1: u8 = CohenSoutherlandCode(fx1, fy1)

  while (true) {
    if (!(outcode0 | outcode1)) {
      break
    } else if (outcode0 & outcode1) {
      // bitwise AND is not 0: both points share an outside zone (LEFT, RIGHT, TOP,
      // or BOTTOM), so both must be outside window; exit loop (accept is false)
      return
    } else {
      // failed both tests, so calculate the line segment to clip
      // from an outside point to an intersection with clip edge
      let x: f64
      let y: f64

      // At least one endpoint is outside the clip rectangle; pick it.
      const outcodeOut: u8 = outcode1 > outcode0 ? outcode1 : outcode0

      // Now find the intersection point;
      // use formulas:
      //   slope = (y1 - y0) / (x1 - x0)
      //   x = x0 + (1 / slope) * (ym - y0), where ym is ymin or ymax
      //   y = y0 + slope * (xm - x0), where xm is xmin or xmax
      // No need to worry about divide-by-zero because, in each case, the
      // outcode bit being tested guarantees the denominator is non-zero
      if (outcodeOut & 0b1000) {
        // point is above the clip window
        x = fx0 + ((fx1 - fx0) * (<f64>HEIGHT - pad - fy0)) / (fy1 - fy0)
        y = <f64>HEIGHT - pad
      } else if (outcodeOut & 0b0100) {
        // point is below the clip window
        x = fx0 + ((fx1 - fx0) * (pad - fy0)) / (fy1 - fy0)
        y = pad
      } else if (outcodeOut & 0b0010) {
        // point is to the right of clip window
        y = fy0 + ((fy1 - fy0) * (<f64>WIDTH - pad - fx0)) / (fx1 - fx0)
        x = <f64>WIDTH - pad
      } else if (outcodeOut & 0b0001) {
        // point is to the left of clip window
        y = fy0 + ((fy1 - fy0) * (pad - fx0)) / (fx1 - fx0)
        x = pad
      }

      // Now we move outside point to intersection point to clip
      // and get ready for next pass.
      if (outcodeOut == outcode0) {
        fx0 = x
        fy0 = y
        outcode0 = CohenSoutherlandCode(fx0, fy0)
      } else {
        fx1 = x
        fy1 = y
        outcode1 = CohenSoutherlandCode(fx1, fy1)
      }
    }
  }

  let x0: i32 = <i32>Math.round(fx0)
  let y0: i32 = <i32>Math.round(fy0)
  const x1: i32 = <i32>Math.round(fx1)
  const y1: i32 = <i32>Math.round(fy1)

  updateDrawBounds(PATH_DRAW_BOUNDS, x0, y0)
  updateDrawBounds(PATH_DRAW_BOUNDS, x1, y1)

  const wd: f32 = (<f32>LINEWIDTH + 1.0) / 2.0
  const dx: i32 = abs(x1 - x0)
  const sx: i32 = x0 < x1 ? 1 : -1

  const dy: i32 = abs(y1 - y0)
  const sy: i32 = y0 < y1 ? 1 : -1

  let err: i32 = dx - dy
  let e2: i32
  let x2: i32
  let y2: i32

  /* error value e_xy */
  const ed: f32 = dx + dy == 0 ? <f32>1 : sqrt<f32>(<f32>(dx * dx + dy * dy))

  while (true) {
    /* pixel loop */
    setPixelAA(
      x0,
      y0,
      max<i32>(0, <i32>(255.0 * (<f32>abs<i32>(err - dx + dy) / ed - wd + 1.0)))
    )
    e2 = err
    x2 = x0
    if (2 * e2 >= -dx) {
      /* x step */
      for (
        e2 += dy, y2 = y0;
        e2 < <i32>(ed * wd) && (y1 != y2 || dx > dy);
        e2 += dx
      )
        setPixelAA(
          x0,
          (y2 += sy),
          max<i32>(0, <i32>(255.0 * (<f32>abs<i32>(e2) / ed - wd + 1.0)))
        )
      if (x0 == x1) break
      e2 = err
      err -= dy
      x0 += sx
    }
    if (2 * e2 <= dy) {
      /* y step */
      for (e2 = dx - e2; e2 < <i32>(ed * wd) && (x1 != x2 || dx < dy); e2 += dy)
        setPixelAA(
          (x2 += sx),
          y0,
          max<i32>(0, <i32>(255.0 * (<f32>abs<i32>(e2) / ed - wd + 1.0)))
        )
      if (y0 == y1) break
      err += dx
      y0 += sy
    }
  }
}

/*
 * Activity data processing functions
 */
const MAX_LATITUDE: f32 = 85.0511287798
const EARTH_RADIUS: f32 = 6378137.0
const RAD: f32 = Mathf.PI / 180.0

// CRS transformation
const S: f32 = 0.5 / (Mathf.PI * EARTH_RADIUS)
const A: f32 = S
const B: f32 = 0.5
const C: f32 = -S
const D: f32 = 0.5

/**
 * This is a streamlined version of Leaflet's EPSG:3857 projection.
 *   Given a pointer to a block of memory with nPoints 32-bit float
 *   latLng pairs, this function converts them in-place to
 *   32-bit floats of rectangular coordinates.
 */
export function CRSproject(startLoc: usize, nPoints: i32, zoom: u8 = 0): void {
  const scale: f32 = <f32>(1 << (8 + zoom))

  for (let i: i32 = 0; i < nPoints; i++) {
    const loc = startLoc + (i << 2)
    let px: f32 = load<f32>(loc) // latitude
    let py: f32 = load<f32>(loc + 4) // longitude

    px = Mathf.max(Mathf.min(MAX_LATITUDE, px), -MAX_LATITUDE)
    const sin = Mathf.sin(px * RAD)

    px = EARTH_RADIUS * py * RAD
    py = (EARTH_RADIUS * Mathf.log((1 + sin) / (1 - sin))) / 2

    px = scale * (A * px + B)
    py = scale * (C * py + D)

    store<f32>(loc, px)
    store<f32>(loc + 4, py)
  }
}
