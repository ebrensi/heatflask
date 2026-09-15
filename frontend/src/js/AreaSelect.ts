/*
 * AreaSelect -- a resizable box over the map, with the rest of the map dimmed.
 *
 * Replaces leaflet-areaselect, which the capture control used to choose what
 * to record. The box stays centred and its corners resize it symmetrically,
 * as that plugin's did; the map still pans and zooms underneath it.
 */

import type { Selection } from "./Capture"

const MIN_SIZE = 32

export class AreaSelect {
  private box: HTMLDivElement

  constructor(private container: HTMLElement, fraction: number) {
    const box = (this.box = document.createElement("div"))
    box.className = "area-select"
    const { clientWidth: w, clientHeight: h } = container
    this.setSize(w * fraction, h * fraction)

    for (const corner of ["nw", "ne", "sw", "se"]) {
      const handle = document.createElement("div")
      handle.className = `area-select-handle area-select-${corner}`
      handle.addEventListener("pointerdown", (e) => this.drag(e))
      box.appendChild(handle)
    }
    container.appendChild(box)
  }

  private setSize(width: number, height: number): void {
    const { clientWidth: w, clientHeight: h } = this.container
    width = Math.max(MIN_SIZE, Math.min(w, width))
    height = Math.max(MIN_SIZE, Math.min(h, height))
    Object.assign(this.box.style, {
      width: `${width}px`,
      height: `${height}px`,
      left: `${(w - width) / 2}px`,
      top: `${(h - height) / 2}px`,
    })
  }

  /* Dragging a corner moves it away from or toward the centre, and the
   * opposite corner mirrors it, keeping the box centred. */
  private drag(down: PointerEvent): void {
    down.preventDefault()
    down.stopPropagation()
    const handle = <HTMLElement>down.target
    handle.setPointerCapture(down.pointerId)
    const r = this.container.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2

    const move = (e: PointerEvent) => {
      this.setSize(2 * Math.abs(e.clientX - cx), 2 * Math.abs(e.clientY - cy))
    }
    const up = () => {
      handle.removeEventListener("pointermove", move)
      handle.removeEventListener("pointerup", up)
      handle.removeEventListener("pointercancel", up)
    }
    handle.addEventListener("pointermove", move)
    handle.addEventListener("pointerup", up)
    handle.addEventListener("pointercancel", up)
  }

  /** The box, in CSS pixels relative to the map container */
  getRect(): Selection {
    return {
      x: this.box.offsetLeft,
      y: this.box.offsetTop,
      width: this.box.offsetWidth,
      height: this.box.offsetHeight,
    }
  }

  remove(): void {
    this.box.remove()
  }
}
