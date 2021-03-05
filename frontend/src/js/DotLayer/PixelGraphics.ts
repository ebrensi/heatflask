import { Bounds } from "../appUtil"
import { getWasm } from "./myWasm"

type tuple4 = [number, number, number, number]
type tuple2 = [number, number]
type rect = { x: number; y: number; w: number; h: number }
type WasmExports = Record<string, WebAssembly.ExportValue>

const DEBUG = true

/**
 * This is an extension of the Bounds class where we assume the bounds data
 * is a block of 4 32-bit words in WebAssembly memory
 * (we can't use NaN to indicate empty bounds)
 */
class WasmBounds extends Bounds {
  constructor(memory: WebAssembly.Memory, boundsDataOffset: number) {
    const boundsData = new Int32Array(memory, boundsDataOffset, 4)
    super(boundsData)
    this.reset()
  }

  reset(): void {
    this._bounds[0] = -1
  }

  isEmpty(): boolean {
    return this._bounds[0] == -1
  }
}

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
  pathImageData: ImageData
  dotImageData: ImageData
  pathBounds: WasmBounds
  dotBounds: WasmBounds
  color32: number
  lineWidth: number
  transform: tuple4
  wasm: WasmExports
  debugCanvas?: HTMLCanvasElement

  constructor(width?: number, height?: number) {
    this.color32 = rgbaToUint32(0, 0, 0, 255) // default color is black
    this.lineWidth = 1
    this.transform = [1, 0, 1, 0]

    getWasm().then((exports) => {
      const W = (this.wasm = exports)
      W.setAlphaMask(alphaMask, alphaPos)

      if (width && height) {
        this.initViewport(width, height)
      }
    })
  }

  /**
   * Ensure that we have byteSize bytes available.
   * If this wasm instance's memory already has hat capacity then
   * nothing happens, otherwise we grow the memory.  We cannot
   * assume anything currently in memory is preserved.
   * @returns the size of the memory in bytes
   */
  allocateWasmMemory(byteSize?: number): number {
    const W = this.wasm
    let currentNumPages = W.memory.grow(0)

    if (byteSize) {
      const numPages = ((byteSize + 0xffff) & ~0xffff) >>> 16
      if (numPages > currentNumPages) {
        W.memory.grow(numPages - currentNumPages)
        currentNumPages = numPages
      }
    }
    this.wasm.allocateBasics()
    this.pathBounds = new WasmBounds(W.memory.buffer, W.PATH_DRAW_BOUNDS.value)
    this.dotBounds = new WasmBounds(W.memory.buffer, W.DOT_DRAW_BOUNDS.value)

    return currentNumPages
  }

  initViewport(width: number, height: number): void {
    const memory = <WebAssembly.Memory>this.wasm.memory
    const numPixels = width * height // reserve an extra row
    const byteSize = numPixels << 2 // (4 bytes per rgba pixel)

    // get the memory offset of a chunk of memory byteSize * 2 in length
    this.wasm.allocateViewport(width, height)

    const pathDataLoc = this.wasm.PATH_IMAGEDATA_OFFSET.value
    const dotDataLoc = this.wasm.DOT_IMAGEDATA_OFFSET.value

    // views into the viewport memory for JavaSript access
    const pathImageDataArr = new Uint8ClampedArray(
      memory.buffer,
      pathDataLoc,
      byteSize
    )
    this.pathImageData = new ImageData(pathImageDataArr, width, height)

    const dotImageDataArr = new Uint8ClampedArray(
      memory.buffer,
      dotDataLoc,
      byteSize
    )
    this.dotImageData = new ImageData(dotImageDataArr, width, height)
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

  get width(): number {
    return this.wasm.WIDTH.value
  }

  get height(): number {
    return this.wasm.HEIGHT.value
  }

  /**
   * Clear (set to 0) a rectangular region
   */
  clearRect(boundsLoc: usize, dataLoc: usize, rect: rect): void {
    if (this.wasm.drawBoundsEmpty(boundsLoc)) return
    const { x, y, w, h } = rect
    if (w == 0 || h == 0) return
    this.wasm.clearRect(boundsLoc, x, y, w, h)
  }

  clearPathRect(rect?: rect): void {
    const boundsLoc = this.wasm.PATH_DRAW_BOUNDS.value
    const dataLoc = this.wasm.PATH_IMAGEDATA_OFFSET.value
    this.clearRect(boundsLoc, dataLoc, rect || this.pathBounds.rect)

    // make sure to update drawbounds
    if (!rect) {
      this.wasm.resetDrawBounds(boundsLoc)
    }
  }

  clearDotRect(rect?: rect): void {
    const boundsLoc = this.wasm.DOT_DRAW_BOUNDS.value
    const dataLoc = this.wasm.DOT_IMAGEDATA_OFFSET.value
    this.clearRect(boundsLoc, dataLoc, rect || this.pathBounds.rect)

    // make sure to update drawbounds
    if (!rect) {
      this.wasm.resetDrawBounds(boundsLoc)
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
  translatePaths(shiftX: number, shiftY: number): void {
    const boundsLoc = this.wasm.PATH_DRAW_BOUNDS.value
    const dataLoc = this.wasm.PATH_IMAGEDATA_OFFSET.value

    // console.time("moveRect")
    this.wasm.moveRect(boundsLoc, dataLoc, shiftX, shiftY)
    // console.timeEnd("moveRect")
  }

  translateDots(shiftX: number, shiftY: number): void {
    const boundsLoc = this.wasm.DOT_DRAW_BOUNDS.value
    const dataLoc = this.wasm.DOT_IMAGEDATA_OFFSET.value

    // console.time("moveRect")
    this.wasm.moveRect(boundsLoc, dataLoc, shiftX, shiftY)
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
