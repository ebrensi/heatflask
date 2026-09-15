/*
 * AltDragRotate -- alt-drag with the left mouse button rotates and tilts the
 * map: sideways turns it, up and down tilts it.
 *
 * MapLibre rotates on right-drag and on ctrl-drag, but ctrl-drag is box select
 * here (see BoxSelect.ts), so this gives a left-button way to do it.
 */

import type { Map as MLMap } from "maplibre-gl"

/* MapLibre's own rates for its right-drag rotate and pitch, so the two
 * gestures feel the same */
const BEARING_PER_PX = 0.8
const PITCH_PER_PX = 0.5

export function addAltDragRotate(map: MLMap): void {
  const container = map.getCanvasContainer()
  let pointerId: number | null = null
  let lastX = 0
  let lastY = 0
  let panWasEnabled = false

  function onPointerDown(e: PointerEvent): void {
    if (!e.altKey || e.ctrlKey || e.button !== 0 || e.pointerType !== "mouse")
      return
    if (pointerId !== null) return

    /* pointerdown precedes the mousedown MapLibre's pan handler listens for,
     * so turning panning off here keeps the drag from also panning */
    e.preventDefault()
    e.stopPropagation()
    panWasEnabled = map.dragPan.isEnabled()
    map.dragPan.disable()

    pointerId = e.pointerId
    lastX = e.clientX
    lastY = e.clientY
    container.classList.add("alt-drag-rotating")
    document.addEventListener("pointermove", onPointerMove)
    document.addEventListener("pointerup", onPointerUp)
    document.addEventListener("pointercancel", onPointerUp)
  }

  function onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    // the map clamps pitch to its own limits
    map.jumpTo({
      bearing: map.getBearing() + dx * BEARING_PER_PX,
      pitch: map.getPitch() - dy * PITCH_PER_PX,
    })
  }

  function onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    pointerId = null
    if (panWasEnabled) map.dragPan.enable()
    container.classList.remove("alt-drag-rotating")
    document.removeEventListener("pointermove", onPointerMove)
    document.removeEventListener("pointerup", onPointerUp)
    document.removeEventListener("pointercancel", onPointerUp)
  }

  container.addEventListener("pointerdown", onPointerDown, { capture: true })
}
