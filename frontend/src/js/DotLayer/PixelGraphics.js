/*
 * some functions for writing to an imageData object
 */

let height, width, buf32, color32, lineWidth

function isLittleEndian() {
  // from TooTallNate / endianness.js.   https://gist.github.com/TooTallNate/4750953
  const b = new ArrayBuffer(4)
  const a = new Uint32Array(b)
  const c = new Uint8Array(b)
  a[0] = 0xdeadbeef
  if (c[0] == 0xef) return true
  if (c[0] == 0xde) return false
  throw new Error("unknown endianness")
}

const _littleEndian = isLittleEndian()

const rgbaToUint32 = _littleEndian
  ? (r, g, b, a) => (a << 24) | (b << 16) | (g << 8) | r
  : (r, g, b, a) => (r << 24) | (g << 16) | (b << 8) | a

const alphaMask = rgbaToUint32(255, 255, 255, 0)
const shift = _littleEndian ? 24 : 0

export function setColor(r, g, b) {
  if (!g && !b) {
    color32 = r | (0xff << shift)
  } else {
    color32 = rgbaToUint32(r, g, b, 255)
  }
}

export function setWidth(w) {
  lineWidth = w
}

function withAlpha(a) {
  return (color32 & alphaMask) | ((255 - a) << shift)
  // return color32
}

export function setImageData(imageData) {
  width = imageData.width
  height = imageData.height
  buf32 = new Uint32Array(imageData.data.buffer)
}

// TODO: only clear a given rectangle
export function clear() {
  buf32.fill(0)
}

/*
 * This is adapted from "anti-aliased thick line" at
 * http://members.chello.at/~easyfilter/bresenham.html
 */
function setPixel(x, y) {
  buf32[y * width + x] = color32
}

function setPixelAA(x, y, a) {
  const color = withAlpha(Math.round(a))
  buf32[y * width + x] = color
}

function plotLineAA(x0, y0, x1, y1) {
  const dx = Math.abs(x1 - x0)
  const sx = x0 < x1 ? 1 : -1
  const dy = Math.abs(y1 - y0)
  const sy = y0 < y1 ? 1 : -1
  let err = dx - dy
  let e2
  let x2 /* error value e_xy */
  const ed = dx + dy == 0 ? 1 : Math.sqrt(dx * dx + dy * dy)

  for (;;) {
    /* pixel loop */
    setPixelAA(x0, y0, (255 * Math.abs(err - dx + dy)) / ed)
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

export function drawSegment(x0, y0, x1, y1, th) {
  if (!th) th = lineWidth
  /* plot an anti-aliased line of width th pixel */
  const sx = x0 < x1 ? 1 : -1
  const sy = y0 < y1 ? 1 : -1
  let dx = Math.abs(x1 - x0)
  let dy = Math.abs(y1 - y0)
  let e2 = Math.sqrt(dx * dx + dy * dy) /* length */
  let err

  if (th <= 1 || e2 == 0) return plotLineAA(x0, y0, x1, y1) /* assert */
  dx *= 255 / e2
  dy *= 255 / e2
  th = 255 * (th - 1) /* scale values */

  if (dx < dy) {
    /* steep line */
    x1 = Math.round((e2 + th / 2) / dy) /* start offset */
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
    y1 = Math.round((e2 + th / 2) / dx) /* start offset */
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
