// declare function drawDebugRect(x: number, y: number, w: number, h: number): void
// declare function consoleLog(arg0: i32): void;

let WIDTH: i32
let HEIGHT: i32

// transform
let TA1: f32
let TB1: f32
let TA2: f32
let TB2: f32

// draw bounds
export let XMIN: i32
export let XMAX: i32
export let YMIN: i32
export let YMAX: i32
export let BOUNDSEMPTY = true

let COLOR: i32
let MASKEDCOLOR: i32
let ALPHAMASK: i32
let ALPHAPOS: i32
let ALPHASCALE: f32

let LINEWIDTH: i32 = 1

// @inline
function Tx(x: f64): i32 {
  return <i32>Math.round(TA1 * x + TB1)
}

// @inline
function Ty(y: f64): i32 {
  return <i32>Math.round(TA2 * y + TB2)
}

/*
 * Getters and Setters
 */
export function setSize(width: i32, height: i32): void {
  WIDTH = width
  HEIGHT = height
}

export function setTransform(a1: f32, b1: f32, a2: f32, b2: f32): void {
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

// @inline
function inViewportBounds(x: i32, y: i32): boolean {
  return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT
}

// @inline
export function resetDrawBounds(): void {
  BOUNDSEMPTY = true
}

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

// @inline
function clip(v: i32, vmax: i32): i32 {
  if (v < 0) return <i32>0
  else if (v > vmax) return vmax
  return v
}

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
export function drawSquare(fx: f32, fy: f32, size: f32): void {
  const dotOffset = size / 2
  const s = <i32>size
  const x = <i32>Mathf.round(TA1 * fx + TB1 - dotOffset)
  const y = <i32>Mathf.round(TA2 * fy + TB2 - dotOffset)
  if (!inViewportBounds(x, y)) return

  const xStart = max<i32>(0, x) // Math.max(0, tx)
  const xEnd = min<i32>(x + s, WIDTH)

  const yStart = max<i32>(0, y)
  const yEnd = min<i32>(y + s, HEIGHT)

  updateDrawBounds(xStart, yStart)
  updateDrawBounds(xEnd, yEnd)

  for (let row = yStart; row < yEnd; row++) {
    const offset = row * WIDTH
    const colStart = offset + xStart
    const colEnd = offset + xEnd
    fill32(colStart, colEnd, COLOR)
  }
}

export function drawCircle(fx: f32, fy: f32, size: f32): void {
  const x = Tx(fx)
  const y = Ty(fy)
  if (!inViewportBounds(x, y)) return
  updateDrawBounds(x, y)

  const r = <i32>Mathf.round(size)
  const r2 = r * r

  for (let cy = -r + 1; cy < r; cy++) {
    const offset = (cy + y) * WIDTH
    const cx = <i32>Mathf.round(Mathf.sqrt(<f32>(r2 - cy * cy)))
    const colStart = offset + x - cx
    const colEnd = offset + x + cx
    fill32(colStart, colEnd, COLOR)
  }
}

/**
 * Fills a range of adresses with a 32-bit values
 * repeat a 4-byte pattern
 */
// @inline
function fill32(start: usize, end: usize, val32: i32): void {
  for (let i = start; i < end; i++) {
    store<i32>(i, val32)
  }

  // store<i32>(start, val32)
  // memory.repeat(start + 1, start, 4, end - start - 1)
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
function setPixel(x: i32, y: i32): void {
  if (!inViewportBounds(x, y)) return
  updateDrawBounds(x, y)
  store<i32>(y * WIDTH + x, COLOR)
}

function setPixelAA(x: i32, y: i32, a: i32): void {
  if (!inViewportBounds(x, y)) return
  updateDrawBounds(x, y)
  const alpha = 0xff - a
  const color = MASKEDCOLOR | (alpha << ALPHAPOS)
  store<i32>(y * WIDTH + x, color)
}

function plotLineAA(x0: i32, y0: i32, x1: i32, y1: i32): void {
  const dx: i32 = abs<i32>(x1 - x0)
  const sx: i32 = x0 < x1 ? 1 : -1
  const dy: i32 = abs<i32>(y1 - y0)
  const sy: i32 = y0 < y1 ? 1 : -1
  let err: i32 = dx - dy
  let e2: i32
  let x2: i32 /* error value e_xy */
  const ed: i32 = dx + dy == 0 ? 1 : <i32>sqrt<f32>(<f32>(dx * dx + dy * dy))

  for (;;) {
    /* pixel loop */
    setPixelAA(x0, y0, (255 * abs<i32>(err - dx + dy)) / ed)
    e2 = err
    x2 = x0
    if (2 * e2 >= -dx) {
      /* x step */
      if (x0 == x1) break
      if (e2 + dy < ed) setPixelAA(x0, y0 + sy, (255 * (e2 + dy)) / ed)
      err -= dy
      x0 += sx
    }
    if (2 * e2 <= dy) {
      /* y step */
      if (y0 == y1) break
      if (dx - e2 < ed) setPixelAA(x2 + sx, y0, (255 * (dx - e2)) / ed)
      err += dx
      y0 += sy
    }
  }
}

export function drawSegment(fx0: f32, fy0: f32, fx1: f32, fy1: f32): void {
  let x0: i32 = Tx(fx0)
  let y0: i32 = Ty(fy0)
  let x1: i32 = Tx(fx1)
  let y1: i32 = Ty(fy1)
  let th: i32 = LINEWIDTH

  /* plot an anti-aliased line of width th pixel */
  const sx: i32 = x0 < x1 ? 1 : -1
  const sy: i32 = y0 < y1 ? 1 : -1
  let dx: i32 = abs<i32>(x1 - x0)
  let dy: i32 = abs<i32>(y1 - y0)
  let e2: i32 = <i32>sqrt<f32>(<f32>(dx * dx + dy * dy)) /* length */
  let err: i32

  if (th <= 1 || e2 == 0) {
    plotLineAA(x0, y0, x1, y1)
    return
  }
  dx *= 255 / e2
  dy *= 255 / e2
  th = 255 * (th - 1) /* scale values */

  if (dx < dy) {
    /* steep line */
    x1 = (e2 + th / 2) / dy /* start offset */
    err = x1 * dy - th / 2 /* shift error value to offset width */
    for (x0 -= x1 * sx; ; y0 += sy) {
      setPixelAA((x1 = x0), y0, err) /* aliasing pre-pixel */
      for (e2 = dy - err - th; e2 + dy < 255; e2 += dy)
        setPixel((x1 += sx), y0) /* pixel on the line */
      setPixelAA(x1 + sx, y0, e2) /* aliasing post-pixel */
      if (y0 == y1) break
      err += dx /* y-step */
      if (err > 255) {
        err -= dy
        x0 += sx
      } /* x-step */
    }
  } else {
    /* flat line */
    y1 = (e2 + th / 2) / dx /* start offset */
    err = y1 * dx - th / 2 /* shift error value to offset width */
    for (y0 -= y1 * sy; ; x0 += sx) {
      setPixelAA(x0, (y1 = y0), err) /* aliasing pre-pixel */
      for (e2 = dx - err - th; e2 + dx < 255; e2 += dx)
        setPixel(x0, (y1 += sy)) /* pixel on the line */
      setPixelAA(x0, y1 + sy, e2) /* aliasing post-pixel */
      if (x0 == x1) break
      err += dy /* x-step */
      if (err > 255) {
        err -= dx
        y0 += sy
      } /* y-step */
    }
  }
}
