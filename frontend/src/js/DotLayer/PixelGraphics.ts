/*
 * PixelGraphics draws activity paths and dots onto a canvas.
 *
 * It used to render by hand into an ImageData buffer aliased onto WebAssembly
 * memory, with its own line, circle and rectangle routines in AssemblyScript
 * and draw-bounds bookkeeping shared with the wasm module. All of that is
 * gone. The WASM experiment measured *slower* than plain JS, and the
 * incremental-redraw machinery it existed to serve was more complexity than it
 * earned. This draws with the Canvas 2D API, directly onto the destination
 * canvas -- no intermediate buffer, and no per-frame ImageData copy.
 *
 * Drawing is batched: calls accumulate into a Path2D and are stroked or filled
 * in one go, flushed whenever the color, line width or drawing mode changes,
 * and by an explicit flush() at the end of a pass.
 */

type tuple4 = [number, number, number, number]
type rect = { x: number; y: number; w: number; h: number }
type Mode = "stroke" | "fill"

export class PixelGraphics {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  transform: tuple4
  debugCanvas?: HTMLCanvasElement

  private _path: Path2D
  private _mode: Mode
  private _pending: boolean
  private _color: string

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext("2d")
    this.transform = [1, 0, 1, 0]
    this._color = "black"
    this._mode = "stroke"
    this._path = new Path2D()
    this._pending = false
    this._applyLineStyle()
  }

  private _applyLineStyle(): void {
    this.ctx.lineCap = "round"
    this.ctx.lineJoin = "round"
  }

  get width(): number {
    return this.canvas.width
  }

  get height(): number {
    return this.canvas.height
  }

  /* Assigning width or height also clears the canvas, which is what we want
   * on a resize. Skip the assignment when the size is unchanged so we do not
   * throw away a good frame. */
  setSize(width: number, height: number): void {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      this._applyLineStyle()
    }
    this._path = new Path2D()
    this._pending = false
  }

  /**
   * [a1, b1, a2, b2], where Tx = b1 + a1 * x and Ty = b2 + a2 * y.
   *
   * Applied to each point here rather than through ctx.setTransform, because
   * a1 is 2**zoom: a canvas transform would scale lineWidth along with the
   * geometry and the strokes would blow out at high zoom.
   */
  setTransform(tfArray: tuple4): void {
    this.transform = tfArray
  }

  setColor(color: string): void {
    if (color === this._color) return
    this.flush()
    this._color = color
  }

  setLineWidth(w: number): void {
    if (w === this.ctx.lineWidth) return
    this.flush()
    this.ctx.lineWidth = w
  }

  /* Not restored after a pass: it has to still be in effect at the flush that
   * follows. Every draw pass sets its own. */
  setAlpha(alpha: number): void {
    if (alpha === this.ctx.globalAlpha) return
    this.flush()
    this.ctx.globalAlpha = alpha
  }

  private _setMode(mode: Mode): void {
    if (mode === this._mode) return
    this.flush()
    this._mode = mode
  }

  /** Stroke or fill everything accumulated since the last flush. */
  flush(): void {
    if (!this._pending) return
    if (this._mode === "stroke") {
      this.ctx.strokeStyle = this._color
      this.ctx.stroke(this._path)
    } else {
      this.ctx.fillStyle = this._color
      this.ctx.fill(this._path)
    }
    this._path = new Path2D()
    this._pending = false
  }

  /** Clear a rectangle, or the whole canvas when given nothing. */
  clear(r?: rect): void {
    this._path = new Path2D()
    this._pending = false
    if (r) {
      if (isNaN(r.x) || r.w === 0 || r.h === 0) return
      this.ctx.clearRect(r.x, r.y, r.w, r.h)
    } else {
      this.ctx.clearRect(0, 0, this.width, this.height)
    }
  }

  drawSegment(x0: number, y0: number, x1: number, y1: number): void {
    if (
      x0 === undefined ||
      y0 === undefined ||
      x1 === undefined ||
      y1 === undefined
    )
      return

    this._setMode("stroke")
    const [a1, b1, a2, b2] = this.transform
    this._path.moveTo(b1 + a1 * x0, b2 + a2 * y0)
    this._path.lineTo(b1 + a1 * x1, b2 + a2 * y1)
    this._pending = true
  }

  drawSquare(x: number, y: number, size: number): void {
    if (!size) return
    this._setMode("fill")
    const [a1, b1, a2, b2] = this.transform
    const s = size / 2
    this._path.rect(b1 + a1 * x - s, b2 + a2 * y - s, size, size)
    this._pending = true
  }

  drawCircle(x: number, y: number, size: number): void {
    if (!size) return
    this._setMode("fill")
    const [a1, b1, a2, b2] = this.transform
    const tx = b1 + a1 * x
    const ty = b2 + a2 * y
    // moveTo before arc, so consecutive dots are not joined by a line
    this._path.moveTo(tx + size, ty)
    this._path.arc(tx, ty, size, 0, 2 * Math.PI)
    this._pending = true
  }

  /** Draw the outline of a rect in screen coordinates, for debugging */
  drawDebugBox(
    r?: rect,
    label?: string,
    color?: string,
    fill?: boolean
  ): void {
    if (!r || !this.debugCanvas) return
    const ctx = this.debugCanvas.getContext("2d")
    const { x, y, w, h } = r

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
}
