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

    getWasm().then((exports) => {
      this.wasm = exports
      this.wasm.setAlphaMask(alphaMask, alphaPos)
      if (width && height) {
        this.setSize(width, height)
      }
    })
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
    this.wasm.setLineWidth(w)
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
    this.wasm.drawSegment(x0, y0, x1, y1, th)
  }

  drawSquare(x: number, y: number, size: number): void {
    if (!(x && y && size)) return
    this.wasm.drawSquare(x, y, size)
  }

  drawCircle(x: number, y: number, size: number): void {
    if (!(x && y && size)) return
    this.wasm.drawCircle(x, y, size)
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

    // console.time("moveRect")

    this.updateWasmDrawBounds()
    this.wasm.moveRect(shiftX, shiftY)
    this.updateDrawBoundsFromWasm()

    // console.timeEnd("moveRect")
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
