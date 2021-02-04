// declare function drawDebugRect(x: number, y: number, w: number, h: number): void
// declare function consoleLog(arg0: i32): void;

export let WIDTH: i32
export let HEIGHT: i32

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

export let COLOR: u32
let MASKEDCOLOR: u32
let ALPHAMASK: u32
let ALPHAPOS: i32
let GLOBALALPHA: u32

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

export function setAlphaMask(mask: u32, pos: u8): void {
  ALPHAMASK = mask
  ALPHAPOS = pos
}

export function setGlobalAlpha(ga: u32): void {
  GLOBALALPHA = ga
}

export function setColor(color: u32): void {
  COLOR = color
  MASKEDCOLOR = ALPHAMASK & COLOR
}

@inline
function inViewportBounds(x: i32, y: i32): boolean {
  return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT
}

@inline
export function resetDrawBounds(): void {
  BOUNDSEMPTY = true
}

@inline
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

@inline
function clip(v: i32, vmax: i32): i32 {
  if (v < 0) return <i32>0
  else if (v > vmax) return vmax
  return v
}

@inline
export function clearRect(x: i32, y: i32, w: i32, h: i32): void {
  if (w == 0 || h == 0) return
  const widthInBytes = w << 2
  const lastRow = y + h
  for (let row = y; row < lastRow; row++) {
    const offsetBytes = (row * WIDTH + x) << 2
    memory.fill(offsetBytes, 0, widthInBytes)
  }
}

@inline
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

// ---------------------------------------------------------

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
    for (let i = colStart; i < colEnd; i++) {
      store<u32>(i, COLOR)
    }
    // this.buf32.fill(this.color32, colStart, colEnd)
  }
}

export function drawCircle(fx: f32, fy: f32, size: f32): void {
    const x = <i32>Mathf.round(TA1 * fx + TB1)
    const y = <i32>Mathf.round(TA2 * fy + TB2)
    if (!inViewportBounds(x, y)) return
    updateDrawBounds(x, y)

    const r = <i32>Mathf.round(size)
    const r2 = r * r

    for (let cy = -r + 1; cy < r; cy++) {
      const offset = (cy + y) * WIDTH
      const cx = <i32>Mathf.round(Mathf.sqrt(<f32>(r2 - cy * cy)))
      const colStart = offset + x - cx
      const colEnd = offset + x + cx
      for (let i = colStart; i < colEnd; i++) {
          store<u32>(i, COLOR)
        }
      // this.buf32.fill(this.color32, colStart, colEnd)
    }
  }
