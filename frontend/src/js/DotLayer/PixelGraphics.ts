import { Bounds } from "../appUtil"
import { getWasm } from "./myWasm"

type tuple4 = [number, number, number, number]
type tuple2 = [number, number]
type rect = { x: number; y: number; w: number; h: number }
type WasmExports = Record<string, WebAssembly.ExportValue>

const DEBUG = true

/*
 * This module defines the PixelGrapics class.  A PixelGraphics object
 * encapsulates an ImageData buffer and provides methods to modify
 * pixels in that buffer.
 */
function isLittleEndian(): boolean {
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
export const rgbaToUint32 = _littleEndian
  ? (r: number, g: number, b: number, a: number) =>
      (a << 24) | (b << 16) | (g << 8) | r
  : (r: number, g: number, b: number, a: number) =>
      (r << 24) | (g << 16) | (b << 8) | a
const alphaMask = rgbaToUint32(255, 255, 255, 0)
const alphaPos = _littleEndian ? 24 : 0

export class PixelGraphics {
  imageData: ImageData
  buf32: Uint32Array
  rowBuf: Uint32Array
  drawBounds: Bounds
  color32: number
  lineWidth: number
  transform: tuple4
  wasm: WasmExports
  debugCanvas?: HTMLCanvasElement

  constructor(width?: number, height?: number) {
    this.color32 = rgbaToUint32(0, 0, 0, 255) // default color is black
    this.drawBounds = new Bounds()
    this.lineWidth = 1
    this.transform = [1, 0, 1, 0]

    if (width && height) {
      getWasm().then((exports) => {
        this.wasm = exports
        this.setSize(width, height)
      })
    }
  }

  get height(): number {
    return this.imageData.height
  }

  get width(): number {
    return this.imageData.width
  }

  // make sure we have enough memory in the wasm instance
  // for all the screen pixel data. note that it only grows memory
  setSize(width: number, height: number): void {
    const memory = <WebAssembly.Memory>this.wasm.memory
    const numPixels = width * height // reserve an extra row
    const byteSize = numPixels << 2 // (4 bytes per rgba pixel)

    const numPages = ((byteSize + 0xffff) & ~0xffff) >>> 16
    const currentNumPages = memory.grow(0)

    if (numPages > currentNumPages) {
      memory.grow(numPages - currentNumPages)
    }

    // this is a view into the memory for JavaSript access
    this.buf32 = new Uint32Array(memory.buffer, 0, numPixels)
    this.rowBuf = new Uint32Array(width)

    const imageDataArr = new Uint8ClampedArray(memory.buffer, 0, byteSize)
    this.imageData = new ImageData(imageDataArr, width, height)

    this.wasm.setSize(width, height)
  }

  setTransform(tfArray: tuple4): void {
    this.transform = tfArray
    this.wasm.setTransform(...tfArray)
  }

  setColor(colorValue: string | number): void
  setColor(r: number, g?: number, b?: number, a?: number): void {
    if (!a) a = 0xff // default full alpha
    if (g === undefined) {
      if (typeof r === "string") this.color32 = parseColor(r)
      else this.color32 = r | (a << alphaPos)
    } else {
      this.color32 = rgbaToUint32(r, g, b, a)
    }

    this.wasm.setColor(this.color32)
  }

  setLineWidth(w: number): void {
    this.lineWidth = w
  }

  updateDrawBoundsFromWasm(): void {
    const W = this.wasm
    this.drawBounds.reset()
    if (W.BOUNDSEMPTY.value) return
    this.drawBounds.update(W.XMIN.value, W.YMIN.value)
    this.drawBounds.update(W.XMAX.value, W.YMAX.value)
  }

  updateWasmDrawBounds(): void {
    this.wasm.resetDrawBounds()
    const [xmin, ymin, xmax, ymax] = this.drawBounds.data
    this.wasm.updateDrawBounds(xmin, ymin)
    this.wasm.updateDrawBounds(xmax, ymax)
  }

  /**
   * Clear (set to 0) a rectangular region
   */
  clear(rect?: rect): void {
    const { x, y, w, h } = rect || this.drawBounds.rect
    if (isNaN(x) || w == 0 || h == 0) return

    this.wasm.clearRect(x, y, w, h)

    // make sure to update drawbounds
    if (!rect) {
      this.drawBounds.reset()
      this.wasm.resetDrawBounds()
    }
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height
  }

  /* ***************************************************
   * This code line-drawing at the pixel level is adapted from
   * "anti-aliased thick line" at
   * http://members.chello.at/~easyfilter/bresenham.html
   * *******************************************************
   */
  setPixel(x: number, y: number): void {
    if (!this.inBounds(x, y)) return
    this.drawBounds.update(x, y)
    this.buf32[y * this.width + x] = this.color32
  }

  setPixelAA(x: number, y: number, a: number): void {
    if (!this.inBounds(x, y)) return
    this.drawBounds.update(x, y)
    const alpha = 0xff - Math.round(a)
    const color = (this.color32 & alphaMask) | (alpha << alphaPos)
    this.buf32[y * this.width + x] = color
  }

  plotLineAA(x0: number, y0: number, x1: number, y1: number): void {
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

  drawSegment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    th?: number
  ): void {
    if (
      x0 === undefined ||
      y0 === undefined ||
      x1 === undefined ||
      y1 === undefined
    )
      return

    const T = this.transform
    // These must be integers
    x0 = Math.round(T[0] * x0 + T[1])
    y0 = Math.round(T[2] * y0 + T[3])
    x1 = Math.round(T[0] * x1 + T[1])
    y1 = Math.round(T[2] * y1 + T[3])

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

  drawSquareJS(x: number, y: number, size: number): void {
    const dotOffset = size / 2
    const T = this.transform
    x = Math.round(T[0] * x + T[1] - dotOffset)
    y = Math.round(T[2] * y + T[3] - dotOffset)
    if (!this.inBounds(x, y)) return

    const xStart = x < 0 ? 0 : x // Math.max(0, tx)
    const xEnd = Math.min(x + size, this.width)

    const yStart = y < 0 ? 0 : y
    const yEnd = Math.min(y + size, this.height)

    this.drawBounds.update(x, y)

    for (let row = yStart; row < yEnd; row++) {
      const offset = row * this.width
      const colStart = offset + xStart
      const colEnd = offset + xEnd
      this.buf32.fill(this.color32, colStart, colEnd)
    }
  }

  drawSquare(x: number, y: number, size: number): void {
    this.wasm.drawSquare(x, y, size)
    // this.drawSquareJS(x, y, size)
  }

  drawCircleJS(x: number, y: number, size: number): void {
    const T = this.transform
    x = Math.round(T[0] * x + T[1])
    y = Math.round(T[2] * y + T[3])
    if (!this.inBounds(x, y)) return

    const r = size
    const r2 = r * r

    this.drawBounds.update(x, y)

    for (let cy = -r + 1; cy < r; cy++) {
      const offset = (cy + y) * this.width
      const cx = Math.sqrt(r2 - cy * cy)
      const colStart = (offset + x - cx) | 0
      const colEnd = (offset + x + cx) | 0
      this.buf32.fill(this.color32, colStart, colEnd)
    }
  }

  drawCircle(x: number, y: number, size: number): void {
    this.wasm.drawCircle(x, y, size)
    // this.drawCircleJS(x, y, size)
  }

  clip(x: number, max: number): number {
    if (x < 0) return 0
    else if (x > max) return max
    return x
  }
  /*
   * This function moves the pixels from one rectangular region
   *  of an imageData object to another, possibly overlapping
   *  rectanglular region of equal size.
   */
  translate(shiftX: number, shiftY: number): void {
    if (this.drawBounds.isEmpty()) return

    console.time("moveRect")
    // this.translateJS(shiftX, shiftY)

    this.updateWasmDrawBounds()
    this.wasm.moveRect(shiftX, shiftY)
    this.updateDrawBoundsFromWasm()

    console.timeEnd("moveRect")
  }

  translateJS(shiftX: number, shiftY: number): void {
    if (shiftX === 0 && shiftY === 0) return
    const { x: rx, y: ry, w: rw, h: rh } = this.drawBounds.rect

    // destination rectangle
    const dx = this.clip(rx + shiftX, this.width)
    const dy = this.clip(ry + shiftY, this.height)
    const w = this.clip(rx + rw + shiftX, this.width) - dx
    const h = this.clip(ry + rh + shiftY, this.height) - dy

    if (w === 0 || h === 0) {
      /*
       * If there is no destination rectangle (nothing in view)
       *  we just clear the source rectangle and exit
       */
      this.clear()
      this.drawBounds.reset()
      return
    }

    // source rectangle
    const sx = dx - shiftX
    const sy = dy - shiftY

    // clear rectangle
    const cx = dy != sy ? rx : sx < dx ? sx : dx + w
    const cy = dy < sy ? ry : dy > sy ? ry + h : sy
    const cw = dy != sy ? rw : Math.abs(sx - dx)
    const ch = dy != sy ? rh - h : h

    if (DEBUG && this.debugCanvas) {
      this.drawDebugBox({ x: sx, y: sy, w, h }, "source", "yellow", true) // draw source rect
      this.drawDebugBox({ x: dx, y: dy, w, h }, "dest", "blue", true) // draw dest rect
      this.drawDebugBox({ x: cx, y: cy, w: cw, h: ch }, "clear", "black", true) // draw dest rect
    }

    if (ch && cw) this.clear({ x: cx, y: cy, w: cw, h: ch })

    const moveRow = (row: number): void => {
      const sOffset = (sy + row) * this.width
      const sRowStart = sOffset + sx
      const sRowEnd = sRowStart + w
      const rowData = this.buf32.subarray(sRowStart, sRowEnd)

      const dOffset = (dy + row) * this.width
      const dRowStart = dOffset + dx

      this.buf32.set(rowData, dRowStart)

      // erase the whole source rect row
      const rStart = sOffset + rx
      const rEnd = rStart + rw
      this.buf32.fill(0, rStart, rEnd) // clear the source row
    }

    /* We only bother copying if the destination rectangle is within
     * the imageData bounds
     */
    if (dy < sy) {
      /* if the source rectangle is below the destination
       then we copy rows from the top down */
      for (let row = 0; row < h; row++) moveRow(row)
    } else if (dy > sy) {
      /* otherwise we copy from the bottom row up */
      for (let row = h - 1; row >= 0; row--) moveRow(row)
    } else {
      /* In the rare case that the source and dest rectangles are
       *  horizontally adjacent to each other, we cannot copy rows directly
       *  because the rows may overlap. We have to use an intermediate buffer,
       *  ideally an unused block of the same imageData arraybuffer.
       */
      let bufOffset

      // use the first row of imagedata if it is available
      if (dy > 0) bufOffset = 0
      // or the last row
      else if (dy + h < rh) bufOffset = (rh - 1) * this.width

      const rowBuf =
        bufOffset === undefined
          ? this.rowBuf.subarray(0, w)
          : this.buf32.subarray(bufOffset, bufOffset + w)

      for (let y = dy, n = dy + h; y < n; y++) {
        const offset = y * this.width
        const sRowStart = offset + sx
        const sRowEnd = sRowStart + w
        const dRowStart = offset + dx

        const rowData = this.buf32.subarray(sRowStart, sRowEnd)
        rowBuf.set(rowData)
        this.buf32.set(rowBuf, dRowStart)
      }
      // now clear the row buffer if it is part of imageData
      if (bufOffset !== undefined) rowBuf.fill(0)
    }

    this.drawBounds.reset()
    this.drawBounds.update(dx, dy)
    this.drawBounds.update(dx + w, dy + h)
  }

  // Draw the outline of arbitrary rect object in screen coordinates
  drawDebugBox(
    rect?: rect,
    label?: string,
    color?: string,
    fill?: boolean
  ): void {
    if (!rect || !this.debugCanvas) return
    const ctx = this.debugCanvas.getContext("2d")
    const { x, y, w, h } = rect

    if (w === 0 || h === 0) return

    if (fill) {
      ctx.globalAlpha = 0.3
      ctx.fillStyle = color
      ctx.fillRect(x, y, w, h)
      ctx.globalAlpha = 1
    } else {
      if (color) ctx.strokeStyle = color
      ctx.strokeRect(x, y, w, h)
    }
    if (label) ctx.fillText(label, x + 20, y + 20)
  }
} // end PixelGraphics definition

const _re = /(\d+),(\d+),(\d+)/
function parseColor(colorString: string) {
  if (colorString[0] === "#") {
    const num = parseInt(colorString.replace("#", "0x"))
    const r = (num & 0xff0000) >>> 16
    const g = (num & 0x00ff00) >>> 8
    const b = num & 0x0000ff
    return rgbaToUint32(r, g, b, 0xff)
  }
  const result = colorString.match(_re)
  return rgbaToUint32(+result[1], +result[2], +result[3], 0xff)
}
