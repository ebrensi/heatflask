/*
 * This module defines the PixelGrapics class.  A PixelGraphics object
 * encapsulates an ImageData buffer and provides methods to modify
 * pixels in that buffer.
 */

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

const alphaMask = rgbaToUint32(255, 255, 255, 0)
const alphaPos = _littleEndian ? 24 : 0
const _littleEndian = isLittleEndian()
const rgbaToUint32 = _littleEndian
  ? (r, g, b, a) => (a << 24) | (b << 16) | (g << 8) | r
  : (r, g, b, a) => (r << 24) | (g << 16) | (b << 8) | a

export class PixelGraphics {
  constructor(imageData) {
    if (imageData) {
      this.imageData = imageData // note that this is a setter call
      this.color32 = rgbaToUint32(0, 0, 0, 255) // default color is black
      this.lineWidth = 1
      this.transform = [1, 0, 1, 0]
    }
  }

  set imageData(imageData) {
    this._imageData = imageData
    this.width = imageData.width
    this.height = imageData.height
    this.buf32 = new Uint32Array(imageData.data.buffer)

    // re-use existing buffer if is large enough to hold a row of data
    if (!this.rowBuf || this.rowBuf.length < imageData.width) {
      this.rowBuf = new Uint32Array(imageData.width)
    }
  }

  get imageData() {
    return this._imageData
  }

  setTransform(a1, b1, a2, b2) {
    this.transform = [a1, b1, a2, b2]
    this.pxBounds = {
      xmin: b1,
      xmax: (this.width - b1) / a1,
      ymin: b2,
      ymax: (this.width - b2) / a2,
    }
  }

  setColor(r, g, b, a = 0xff) {
    this.color32 = g ? rgbaToUint32(r, g, b, a) : r | (a << alphaPos)
  }

  setLineWidth(w) {
    this.lineWidth = w
  }

  clearRect({ x, y, w, h }) {
    if (!x) {
      this.buf32.fill(0)
      return
    }

    for (let row = y; row < y + h; row++) {
      const offset = row * this.width
      this.buf32.fill(0, offset + x, offset + x + w)
    }
  }

  /* ***************************************************
   * This code line-drawing at the pixel level is adapted from
   * "anti-aliased thick line" at
   * http://members.chello.at/~easyfilter/bresenham.html
   * *******************************************************
   */
  setPixel(x, y) {
    const B = this.pxBounds
    if (x < B.xmin || x >= B.xmax || y < B.ymin || y >= B.ymax) return

    const T = this.transform
    x = Math.round(T[0] * x + T[1])
    y = Math.round(T[0] + y + T[2])
    this.buf32[y * this.width + x] = this.color32
  }

  setPixelAA(x, y, a) {
    const B = this.pxBounds
    if (x < B.xmin || x >= B.xmax || y < B.ymin || y >= B.ymax) return

    const T = this.transform
    x = Math.round(T[0] * x + T[1])
    y = Math.round(T[0] + y + T[2])
    const alpha = 0xff - Math.round(a)
    const color = (this.color32 & alphaMask) | (alpha << alphaPos)
    this.buf32[y * this.width + x] = color
  }

  plotLineAA(x0, y0, x1, y1) {
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
      this.setPixelAA(x0, y0, (255 * Math.abs(err - dx + dy)) / ed)
      e2 = err
      x2 = x0
      if (2 * e2 >= -dx) {
        /* x step */
        if (x0 == x1) break
        if (e2 + dy < ed) this.setPixelAA(x0, y0 + sy, (255 * (e2 + dy)) / ed)
        err -= dy
        x0 += sx
      }
      if (2 * e2 <= dy) {
        /* y step */
        if (y0 == y1) break
        if (dx - e2 < ed) this.setPixelAA(x2 + sx, y0, (255 * (dx - e2)) / ed)
        err += dx
        y0 += sy
      }
    }
  }

  drawSegment(x0, y0, x1, y1, th) {
    if (!x0 || !y0 || !x1 || !y1) return

    if (!th) th = this.lineWidth
    /* plot an anti-aliased line of width th pixel */
    const sx = x0 < x1 ? 1 : -1
    const sy = y0 < y1 ? 1 : -1
    let dx = Math.abs(x1 - x0)
    let dy = Math.abs(y1 - y0)
    let e2 = Math.sqrt(dx * dx + dy * dy) /* length */
    let err

    if (th <= 1 || e2 == 0) return this.plotLineAA(x0, y0, x1, y1)
    dx *= 255 / e2
    dy *= 255 / e2
    th = 255 * (th - 1) /* scale values */

    if (dx < dy) {
      /* steep line */
      x1 = Math.round((e2 + th / 2) / dy) /* start offset */
      err = x1 * dy - th / 2 /* shift error value to offset width */
      for (x0 -= x1 * sx; ; y0 += sy) {
        this.setPixelAA((x1 = x0), y0, err) /* aliasing pre-pixel */
        for (e2 = dy - err - th; e2 + dy < 255; e2 += dy)
          this.setPixel((x1 += sx), y0) /* pixel on the line */
        this.setPixelAA(x1 + sx, y0, e2) /* aliasing post-pixel */
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
        this.setPixelAA(x0, (y1 = y0), err) /* aliasing pre-pixel */
        for (e2 = dx - err - th; e2 + dx < 255; e2 += dx)
          this.setPixel(x0, (y1 += sy)) /* pixel on the line */
        this.setPixelAA(x0, y1 + sy, e2) /* aliasing post-pixel */
        if (x0 == x1) break
        err += dy /* x-step */
        if (err > 255) {
          err -= dx
          y0 += sy
        } /* y-step */
      }
    }
  }

  //
  clip(x, y) {
    if (x < 0) x = 0
    else if (x > this.width) x = this.width
    if (y < 0) y = 0
    else if (y > this.height) y = this.height
    return [x, y]
  }

  /*
   * This function moves the pixels from one rectangular region
   *  of an imageData object to another, possibly overlapping
   *  rectanglular region of equal size.
   */
  moveRect(rect, shiftX, shiftY) {
    const r = rect
    const [dx0, dy0] = this.clip(r.x + shiftX, r.y + shiftY)
    const [dx1, dy1] = this.clip(r.x + r.w + shiftX, r.y + r.h + shiftY)
    let s, d

    // We only define desatination rect if it is on-screen
    if (dx0 !== dx1 && dy0 !== dy1) {
      d = { x: dx0, y: dy0, w: dx1 - dx0, h: dy1 - dy0 }
      s = { x: dx0 - shiftX, y: dy0 - shiftY, w: d.w, h: d.h }
    } else {
      /* if there is no destination rectangle (nothing in view)
       *  we just clear the source rectangle and exit
       */
      this.clearRect(rect)
      return
    }

    if (this.debugCanvas) {
      const debugCtx = this.debugCanvas.getContext("2d")
      debugCtx.strokeStyle = "#000000"
      drawDebugBox(debugCtx, s, "source") // draw source rect
      drawDebugBox(debugCtx, d, "dest") // draw dest rect
    }

    const moveRow = (row) => {
      const sOffset = (s.y + row) * this.width
      const sRowStart = sOffset + s.x
      const sRowEnd = sRowStart + s.w
      const rowData = this.buf32.subarray(sRowStart, sRowEnd)

      const dOffset = (d.y + row) * this.width
      const dRowStart = dOffset + d.x
      this.buf32.set(rowData, dRowStart)

      // erase the whole source rect row
      const rStart = sOffset + r.x
      const rEnd = rStart + r.w
      this.buf32.fill(0, rStart, rEnd) // clear the source row
    }

    /* We only bother copying if the destination rectangle is within
     * the imageData bounds
     */
    if (d.y < s.y) {
      /* if the source rectangle is below the destination
       then we copy rows from the top down */
      for (let row = 0; row < s.h; row++) moveRow(row)

      const clearRegion = { x: r.x, y: r.y, w: r.w, h: r.h - s.h }
      if (this.debugCanvas) {
        drawDebugBox(this.debugCanvas, clearRegion, "clear") // draw source rect
      }

      this.clearRect(clearRegion)
    } else if (d.y > s.y) {
      /* otherwise we copy from the bottom row up */
      for (let row = s.h - 1; row >= 0; row--) moveRow(row)

      // and clear what's left of source rectangle
      const clearRegion = { x: r.x, y: r.y + s.h, w: r.w, h: r.h - s.h }
      if (this.debugCanvas) {
        drawDebugBox(this.debugCanvas, clearRegion, "clear") // draw source rect
      }

      this.clearRect(clearRegion)
    } else {
      /* In the rare case that the source and dest rectangles are
       *  horizontally adjacent to each other, we cannot copy rows directly
       *  because the rows may overlap. We have to use an intermediate buffer,
       *  ideally an unused block of the same imageData arraybuffer.
       */
      let bufOffset

      // use the first row of imagedata if it is available
      if (d.y > 0) bufOffset = 0
      // or the last row
      else if (d.y + d.h < r.h) bufOffset = (r.h - 1) * this.width

      const rowBuf =
        bufOffset === undefined
          ? this.rowBuf.subarray(0, d.w)
          : this.buf32.subarray(bufOffset, bufOffset + d.w)

      for (let y = d.y, n = d.y + d.h; y < n; y++) {
        const offset = y * this.width
        const sRowStart = offset + s.x
        const sRowEnd = sRowStart + s.w
        const dRowStart = offset + d.x

        const rowData = this.buf32.subarray(sRowStart, sRowEnd)
        rowBuf.set(rowData)
        this.buf32.set(rowBuf, dRowStart)
      }
      // now clear the row buffer if it is part of imageData
      if (bufOffset !== undefined) rowBuf.fill(0)

      // and clear the remaining part of source rectangle
      const clearRegion =
        s.x < d.x
          ? { x: s.x, y: s.y, w: d.x - s.x, h: s.h }
          : { x: d.x + d.w, y: s.y, w: s.x - d.x, h: s.h }
      if (this.debugCanvas) {
        drawDebugBox(this.debugCanvas, clearRegion, "clear")
      }

      this.clearRect(clearRegion)
    }
  }

  drawSquare(x, y, size) {
    const dotOffset = size / 2
    const T = this.transform
    x = Math.round(T[0] * x + T[1] - dotOffset)
    y = Math.round(T[0] + y + T[2] - dotOffset)

    const xStart = x < 0 ? 0 : x // Math.max(0, tx)
    const xEnd = Math.min(x + size, this.width)

    const yStart = y < 0 ? 0 : y
    const yEnd = Math.min(y + size, this.height)

    for (let row = yStart; row < yEnd; row++) {
      const offset = row * this.width
      const colStart = offset + xStart
      const colEnd = offset + xEnd
      this.buf32.fill(this.color32, colStart, colEnd)
    }
  }

  drawCircle(x, y, size) {
    const T = this.transform
    x = Math.round(T[0] * x + T[1])
    y = Math.round(T[0] + y + T[2])
    const r = size
    const r2 = r * r

    for (let cy = -r + 1; cy < r; cy++) {
      const offset = (cy + y) * this.width
      const cx = Math.sqrt(r2 - cy * cy)
      const colStart = (offset + x - cx) | 0
      const colEnd = (offset + x + cx) | 0
      this.buf32.fill(this.color32, colStart, colEnd)
    }
  }
} // end PixelGraphics definition

// Draw the outline of the DrawBox (or arbitrary rect object in screen coordinates)
function drawDebugBox(ctxOrCanvas, rect, label) {
  const ctx = ctxOrCanvas.getContext
    ? ctxOrCanvas.getContext("2d")
    : ctxOrCanvas
  const { x, y, w, h } = rect
  ctx.strokeRect(x, y, w, h)
  if (label) ctx.fillText(label, x + 20, y + 20)
}
