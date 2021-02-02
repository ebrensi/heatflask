// The entry file of your WebAssembly module.

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

let COLOR: u32
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

export function clearRect(x: i32, y: i32, w: i32, h: i32): void {
  const widthInBytes = w << 2
  const lastRow = y + h
  for (let row = y; row < lastRow; row++) {
    const offsetBytes = (row * WIDTH + x) << 2
    memory.fill(offsetBytes, 0, widthInBytes)
  }
}

// @inline
function inViewportBounds(x: i32, y: i32): boolean {
  return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT
}

export function clearDrawBounds(): void {
  BOUNDSEMPTY = true
}

// @inline
function updateDrawBounds(x: i32, y: i32): void {
  if (BOUNDSEMPTY) {
    XMIN = x
    XMAX = x
    YMIN = y
    YMAX = y
  }
  if (x < XMIN) XMIN = x
  else if (x > XMAX) XMAX = x
  if (y < YMIN) YMIN = y
  else if (y > YMAX) YMAX = y
}

/* ***************************************************
 * This code line-drawing at the pixel level is adapted from
 * "anti-aliased thick line" at
 * http://members.chello.at/~easyfilter/bresenham.html
 * *******************************************************
 */
function setPixel(x: i32, y: i32): void {
  if (!inViewportBounds(x, y)) return
  updateDrawBounds(x, y)
  memory.store<u32>(y * WIDTH + x, COLOR)
}

function setPixelAA(x: i32, y: i32, a: i32): void {
  if (!inViewportBounds(x, y)) return
  updateDrawBounds(x, y)
  const alpha = 0xff - nearest<i32>(a)
  const color = MASKEDCOLOR | (alpha << ALPHAPOS)
  memory.store<u32>(y * WIDTH + x, color)
}
// ---------------------------------------------------------

// drawSquare(x: i32, y: i32, size: i32): void {
//     const dotOffset = size / 2
//     const T = this.transform
//     x = Math.round(T[0] * x + T[1] - dotOffset)
//     y = Math.round(T[2] * y + T[3] - dotOffset)
//     if (!this.inBounds(x, y)) return

//     const xStart = x < 0 ? 0 : x // Math.max(0, tx)
//     const xEnd = Math.min(x + size, this.width)

//     const yStart = y < 0 ? 0 : y
//     const yEnd = Math.min(y + size, this.height)

//     this.drawBounds.update(x, y)

//     for (let row = yStart; row < yEnd; row++) {
//       const offset = row * this.width
//       const colStart = offset + xStart
//       const colEnd = offset + xEnd
//       this.buf32.fill(this.color32, colStart, colEnd)
//     }
//   }
