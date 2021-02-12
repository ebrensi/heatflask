// declare function drawDebugRect(x: number, y: number, w: number, h: number): void

declare function logi(v0: i64, v1?: i64, v2?: i64, v3?: i64): void
declare function logf(v0: f64, v1?: f64, v2?: f64, v3?: f64): void

export let DOT_IMAGEDATA_OFFSET: usize = 0
export let DOT_IMAGEDATA_LENGTH: usize = 0
export let PATH_IMAGEDATA_OFFSET: usize = 0
export let PATH_IMAGEDATA_LENGTH: usize = 0

// draw bounds
export let XMIN: i32
export let XMAX: i32
export let YMIN: i32
export let YMAX: i32
export let BOUNDSEMPTY = true

let WIDTH: i32
let HEIGHT: i32

// transform
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

// function i32toi64(v1: i32, v2: i32): i64 {
//   return (<i64>v1) << 32 || <i64>v2
// }

// function i64toi32_1(v: i64): i32 {
//   return <i32>(v >> 32)
// }

// function i64toi32_2(v: i64): i32 {
//   return <i32>(v && 0x00000000ffffffff)
// }

/*
 * Getters and Setters
 */
export function setSize(width: i32, height: i32): void {
  WIDTH = width
  HEIGHT = height
  logi(WIDTH, HEIGHT)
}

export function setTransform(a1: f64, b1: f64, a2: f64, b2: f64): void {
  TA1 = a1
  TA2 = a2
  TB1 = b1
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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: decorator
// @inline
function inViewportBounds(x: i32, y: i32): boolean {
  return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: decorator
// @inline
export function resetDrawBounds(): void {
  BOUNDSEMPTY = true
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: decorator
// @inline
export function updateDrawBounds(x: i32, y: i32): void {
  if (BOUNDSEMPTY) {
    XMIN = x
    XMAX = x
    YMIN = y
    YMAX = y
    BOUNDSEMPTY = false
    return
  }
  if (x < XMIN) XMIN = x
  else if (x > XMAX) XMAX = x
  if (y < YMIN) YMIN = y
  else if (y > YMAX) YMAX = y
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: decorator
// @inline
function clip(v: i32, vmax: i32): i32 {
  if (v < 0) return <i32>0
  else if (v > vmax) return vmax
  return v
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: decorator
// @inline
export function clearRect(x: i32, y: i32, w: i32, h: i32): void {
  if (w == 0 || h == 0) return
  const widthInBytes = w << 2
  const lastRow = y + h
  for (let row = y; row < lastRow; row++) {
    const offsetBytes = (row * WIDTH + x) << 2
    memory.fill(offsetBytes, 0, widthInBytes)
  }
}

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: decorator
// @inline
function moveRow(
  sx: i32,
  sy: i32,
  dx: i32,
  dy: i32,
  row: i32,
  wBytes: i32
): void {
  const sOffset = (sx + (sy + row) * WIDTH) << 2
  const dOffset = (dx + (dy + row) * WIDTH) << 2
  memory.copy(dOffset, sOffset, wBytes)
}

/*
 * This function moves the pixels from one rectangular region
 *  of an imageData object to another, possibly overlapping
 *  rectanglular region of equal size.
 */
export function moveRect(shiftX: i32, shiftY: i32): void {
  if (shiftX == 0 && shiftY == 0) return

  const rx = XMIN
  const ry = YMIN
  const rw = XMAX - XMIN
  const rh = YMAX - YMIN

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
    clearRect(rx, ry, rw, rh)
    resetDrawBounds()
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

  if (cw && ch) clearRect(cx, cy, cw, ch)

  /* We only bother copying if the destination rectangle is within
   * the imageData bounds
   */
  const widthInBytes = w << 2
  if (dy < sy) {
    /* if the source rectangle is below the destination
     then we copy rows from the top down */
    for (let row = 0; row < h; row++) {
      moveRow(sx, sy, dx, dy, row, widthInBytes)
      memory.fill((rx + (sy + row) * WIDTH) << 2, 0, rw << 2)
    }
  } else if (dy > sy) {
    /* otherwise we copy from the bottom row up */
    for (let row = h - 1; row >= 0; row--) {
      moveRow(sx, sy, dx, dy, row, widthInBytes)
      memory.fill((rx + (sy + row) * WIDTH) << 2, 0, rw << 2)
    }
  } else {
    for (let row = 0; row < h; row++) {
      moveRow(sx, sy, dx, dy, row, widthInBytes)
    }
  }

  resetDrawBounds()
  updateDrawBounds(dx, dy)
  updateDrawBounds(dx + w, dy + h)
}

/*
 *  **** Dot Drawing functions ****
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: decorator
// @inline
export function drawSquare(fx: f64, fy: f64, size: f64): void {
  const dotOffset: f64 = size / <f64>2
  const s = <i32>size
  const x = <i32>Math.round(TA1 * fx + TB1 - dotOffset)
  const y = <i32>Math.round(TA2 * fy + TB2 - dotOffset)
  if (!inViewportBounds(x, y)) return
  updateDrawBounds(x, y)

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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: decorator
// @inline
export function drawCircle(fx: f64, fy: f64, r: i32): void {
  const x = <i32>Math.round(TA1 * fx + TB1)
  const y = <i32>Math.round(TA2 * fy + TB2)
  if (!inViewportBounds(x, y)) return
  updateDrawBounds(x, y)

  const r2 = r * r

  for (let cy = -r + 1; cy < r; cy++) {
    const offset = (cy + y) * WIDTH
    const cx = <i32>Math.round(Math.sqrt(<f64>(r2 - cy * cy)))
    const colStart = offset + x - cx
    const colEnd = offset + x + cx
    fill32(colStart, colEnd, COLOR)
  }
}

/**
 * Fills a range of adresses with a 32-bit values
 * repeat a 4-byte pattern
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: decorator
// @inline
function fill32(start: usize, end: usize, val32: i32): void {
  // const endByte = (end << 2) + DOT_IMAGEDATA_OFFSET
  // for (let i = (start << 2)+ DOT_IMAGEDATA_OFFSET; i < endByte; i += 4) {
  //   store<i32>(i, val32)
  // }

  const startByte = (start << 2) + DOT_IMAGEDATA_OFFSET
  store<i32>(startByte, val32)
  memory.repeat(startByte + 4, startByte, 4, end - start - 1)
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

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore: decorator
// @inline
function setPixelAA(x: i32, y: i32, a: i32): void {
  const alpha = 0xff - a
  const color = MASKEDCOLOR | (alpha << ALPHAPOS)
  if (!inViewportBounds(x, y)) {
    logi(x, y)
    return
  }
  store<i32>(<usize>((y * WIDTH + x) << 2) + PATH_IMAGEDATA_OFFSET, color)
}

/*
 * We use the Cohen-Southerland algorithm for clipping to the view-port
 * https://en.wikipedia.org/wiki/Cohen-Sutherland_algorithm
 */
// This pad is necessary because sometimes drawSegment draws Anti-Aliased points past its bundaries
const pad: f64 = 3

// @inline
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

  updateDrawBounds(x0, y0)
  updateDrawBounds(x1, y1)

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
