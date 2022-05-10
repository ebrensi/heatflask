type BoundsData = [xmin: number, ymin: number, xmax: number, ymax: number]
type RectObj = { x: number; y: number; w: number; h: number }

/**  An object for general rectangular bounds
 */
export class Bounds {
  _bounds: BoundsData

  constructor() {
    this._bounds = [NaN, NaN, NaN, NaN]
  }

  reset(): Bounds {
    this._bounds.fill(NaN)
    return this
  }

  isEmpty(): boolean {
    return isNaN(this._bounds[0])
  }

  update(x: number, y: number): Bounds {
    if (this.isEmpty()) {
      this._bounds[0] = this._bounds[2] = x
      this._bounds[1] = this._bounds[3] = y
      return
    }
    if (x < this._bounds[0]) this._bounds[0] = x
    if (y < this._bounds[1]) this._bounds[1] = y
    if (x > this._bounds[2]) this._bounds[2] = x
    if (y > this._bounds[3]) this._bounds[3] = y
    return this
  }

  updateBounds(otherBoundsObj: Bounds): Bounds {
    const [x1, y1, x2, y2] = otherBoundsObj._bounds
    this.update(x1, y1)
    this.update(x2, y2)
    return this
  }

  contains(x: number, y: number): boolean {
    const [xmin, ymin, xmax, ymax] = this._bounds
    return xmin <= x && x <= xmax && ymin <= y && y <= ymax
  }

  containsBounds(otherBoundsObj: Bounds): boolean {
    const [x1, y1, x2, y2] = otherBoundsObj._bounds
    return this.contains(x1, y1) && this.contains(x2, y2)
  }

  overlaps(otherBoundsObj: Bounds): boolean {
    const [xmin, ymin, xmax, ymax] = this._bounds
    const [x1, y1, x2, y2] = otherBoundsObj._bounds
    return x2 >= xmin && x1 <= xmax && y2 >= ymin && y1 <= ymax
  }

  /**
   * Euclidean distance between two bounds
   */
  dist(otherBoundsObj: Bounds): number {
    const b = this._bounds
    const o = otherBoundsObj._bounds
    return Math.sqrt(
      (b[0] - o[0]) ** 2 +
        (b[1] - o[1]) ** 2 +
        (b[2] - o[2]) ** 2 +
        (b[3] - o[3]) ** 2
    )
  }

  copyTo(otherBoundsObj: Bounds): void {
    const b = this._bounds
    const o = otherBoundsObj._bounds
    o[0] = b[0]
    o[1] = b[1]
    o[2] = b[2]
    o[3] = b[3]
  }

  get rect(): RectObj {
    const [xmin, ymin, xmax, ymax] = this._bounds
    return { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin }
  }

  get data(): BoundsData {
    return this._bounds
  }

  set data(data: BoundsData) {
    this._bounds = data
  }
}
