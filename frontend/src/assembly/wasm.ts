// declare function drawDebugRect(x: number, y: number, w: number, h: number): void
// declare function consoleLog(arg0: i32): void;

export const DOT_IMAGEDATA_OFFSET: usize = 0
export const PATH_IMAGEDATA_OFFSET: usize = 0

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
  store<i32>(<usize>((y * WIDTH + x) << 2) + PATH_IMAGEDATA_OFFSET, color)
}

const posarr = new Float64Array(5)
const negarr = new Float64Array(5)

export function drawSegment(fx0: f64, fy0: f64, fx1: f64, fy1: f64): void {
  /* plot an anti-aliased line of width wd */

  fx0 = TA1 * fx0 + TB1
  fy0 = TA2 * fy0 + TB2
  fx1 = TA1 * fx1 + TB1
  fy1 = TA2 * fy1 + TB2

  if (
    fx0 < 0 ||
    fx0 > WIDTH ||
    fx1 < 0 ||
    fx1 > WIDTH ||
    fy0 < 0 ||
    fy0 > HEIGHT ||
    fy1 < 0 ||
    fy1 > HEIGHT
  ) {
    /*
     * clip the segment to viewPort if necessary
     * adapted from Liang–Barsky algorithm
     * https://en.wikipedia.org/wiki/Liang%E2%80%93Barsky_algorithm
     */
    const p1: f64 = -(fx1 - fx0)
    const p2: f64 = -p1
    const p3: f64 = -(fy1 - fy0)
    const p4: f64 = -p3

    const q1: f64 = fx0
    const q2: f64 = <f64>WIDTH - fx0
    const q3: f64 = fy0
    const q4: f64 = <f64>HEIGHT - fy0

    let posind: u8 = 0
    let negind: u8 = 0

    if (p1 != 0) {
      const r1: f64 = q1 / p1
      const r2: f64 = q2 / p2
      if (p1 < 0) {
        negarr[negind++] = r1 // for negative p1, add it to negative array
        posarr[posind++] = r2 // and add p2 to positive array
      } else {
        negarr[negind++] = r2
        posarr[posind++] = r1
      }
    }
    if (p3 != 0) {
      const r3: f64 = q3 / p3
      const r4: f64 = q4 / p4
      if (p3 < 0) {
        negarr[negind++] = r3
        posarr[posind++] = r4
      } else {
        negarr[negind++] = r4
        posarr[posind++] = r3
      }
    }

    let rn1: f64 = 0
    while (negind > 0) {
      negind--
      if (negarr[negind] > rn1) rn1 = negarr[negind]
    }
    let rn2: f64 = 1
    while (posind > 0) {
      posind--
      if (posarr[posind] < rn2) rn2 = posarr[posind]
    }

    fx1 = fx0 + p2 * rn2
    fy1 = fy0 + p4 * rn2
    fx0 += p2 * rn1
    fy0 += p4 * rn1
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
      max<i32>(
        0,
        <i32>(
          Mathf.round(
            <f32>255 * (<f32>abs<i32>(err - dx + dy) / ed - wd + <f32>1)
          )
        )
      )
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
          max<i32>(
            0,
            <i32>Mathf.round(<f32>255 * (<f32>abs<i32>(e2) / ed - wd + <f32>1))
          )
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
          max(
            0,
            <i32>Mathf.round(<f32>255 * (<f32>abs<i32>(e2) / ed - wd + <f32>1))
          )
        )
      if (y0 == y1) break
      err += dx
      y0 += sy
    }
  }
}
