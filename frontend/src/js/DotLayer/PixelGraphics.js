/*
 * some functions for writing to an imageData object
 */


let imageData, color32
const { width, data } = imageData

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
export function rgbaToUint32(r, g, b, a) {
  if (_littleEndian) {
    return (a << 24) | (b << 16) | (g << 8) | r
  } else {
    return (r << 24) | (g << 16) | (b << 8) | a
  }
}

/*
 * This is adapted from "anti-aliased thick line" at
 * http://members.chello.at/~easyfilter/bresenham.html
 */
function setPixel(x, y) {
  data[y*width + x] = color32
}

function setPixelAA(x, y, i) {
  i = 1 - i / 255
  if (context.getImageData(x * zoom, y * zoom, 1, 1).data[3] > i) return
  context.fillStyle = "rgba(0,0,0," + i + ")"
  context.fillRect(x * zoom, y * zoom, zoom, zoom)
}

function plotLineAA(x0, y0, x1, y1) {
  /* draw a black (0) anti-aliased line on white (255) background */
  var dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1
  var dy = Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1
  var err = dx - dy,
    e2,
    x2 /* error value e_xy */
  var ed = dx + dy == 0 ? 1 : Math.sqrt(dx * dx + dy * dy)

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

function plotLineWidth(x0, y0, x1, y1, th) {
  /* plot an anti-aliased line of width th pixel */
  var dx = Math.abs(x1 - x0),
    sx = x0 < x1 ? 1 : -1
  var dy = Math.abs(y1 - y0),
    sy = y0 < y1 ? 1 : -1
  var err,
    e2 = Math.sqrt(dx * dx + dy * dy) /* length */

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
