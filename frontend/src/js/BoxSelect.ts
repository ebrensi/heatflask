/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * BoxSelect -- select activities by dragging a box over the map.
 *
 * Two ways in:
 *
 *   shift-drag  with a mouse, any time
 *   select mode a toggle button; while it is on, a plain drag -- one finger on
 *               a touchscreen -- draws the box instead of panning
 *
 * Shift-drag is MapLibre's box zoom, which this replaces. Ctrl-drag is left to
 * MapLibre, which rotates and tilts the map with it, as other maps do.
 *
 * Pointer events cover mouse, touch and pen with one set of handlers, so both
 * ways in share the same code.
 *
 * The hit test is done in screen space by the layer, against the same points
 * it draws, projected through the same camera. With a pitched or rotated map a
 * box on the screen is not a box on the ground, so testing geographic bounds,
 * as the Leaflet version did, would select the wrong things.
 */

import * as Table from "./Table"
import { icon } from "./Icons"
import { activityPopup } from "./ActivityPopup"
import { dotLayer } from "./DotLayerAPI"
import { ButtonControl } from "./MapControls"

import type { Map as MLMap } from "maplibre-gl"
import type { Activity } from "./DotLayer/Activity"

const SELECT_ICON = icon("object-group")
const CANCEL_ICON = icon("cross")

/* MapLibre's gesture handlers that a box drag has to hold off */
type Gesture = "dragPan" | "touchZoomRotate" | "doubleClickZoom" | "dragRotate"
const GESTURES: Gesture[] = [
  "dragPan",
  "touchZoomRotate",
  "doubleClickZoom",
  "dragRotate",
]

/* Select mode holds off the same ones except dragRotate, so ctrl-drag and
 * right-drag still rotate the map between boxes */
const SELECT_MODE_GESTURES = GESTURES.filter((g) => g !== "dragRotate")

export function addBoxSelect(map: MLMap): void {
  const container = map.getCanvasContainer()
  let selectMode = false
  let pointerId: number | null = null
  let start: { x: number; y: number }
  let box: HTMLDivElement | null = null

  function gestures(on: boolean, which = GESTURES): void {
    for (const g of which) {
      if (on) map[g].enable()
      else map[g].disable()
    }
  }

  const control = new ButtonControl("select-mode-control", () =>
    setSelectMode(!selectMode)
  )

  function render(): void {
    control.set(
      selectMode ? CANCEL_ICON : SELECT_ICON,
      selectMode
        ? "Stop selecting"
        : "Select activities: drag a box over them (or shift-drag any time)"
    )
    control.button.setAttribute("aria-pressed", String(selectMode))
  }

  function setSelectMode(on: boolean): void {
    if (on === selectMode) return
    if (!on && pointerId !== null) finish()
    selectMode = on
    gestures(!on, SELECT_MODE_GESTURES)
    /* without touch-action: none the browser claims a one-finger drag as a
     * page scroll and cancels the pointer */
    container.style.touchAction = on ? "none" : ""
    container.classList.toggle("box-select-crosshair", on)
    render()
  }

  function point(e: PointerEvent) {
    const r = container.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  function onPointerDown(e: PointerEvent): void {
    // ctrl-drag rotates the map, even in select mode
    if (!e.isPrimary || e.button !== 0 || e.ctrlKey || pointerId !== null)
      return
    if (!selectMode && !(e.shiftKey && e.pointerType === "mouse")) return

    /* pointerdown fires before mousedown and touchstart, so stopping it here
     * keeps MapLibre's own handlers from seeing this drag at all */
    e.preventDefault()
    e.stopPropagation()
    gestures(false)

    pointerId = e.pointerId
    start = point(e)
    document.addEventListener("pointermove", onPointerMove)
    document.addEventListener("pointerup", onPointerUp)
    document.addEventListener("pointercancel", onPointerCancel)
    document.addEventListener("keydown", onKeyDown)
  }

  function onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    if (!box) {
      box = document.createElement("div")
      box.className = "box-select-box"
      container.appendChild(box)
    }
    const p = point(e)
    box.style.left = `${Math.min(p.x, start.x)}px`
    box.style.top = `${Math.min(p.y, start.y)}px`
    box.style.width = `${Math.abs(p.x - start.x)}px`
    box.style.height = `${Math.abs(p.y - start.y)}px`
  }

  function finish(): void {
    box?.remove()
    box = null
    pointerId = null
    gestures(true, selectMode ? ["dragRotate"] : GESTURES)
    document.removeEventListener("pointermove", onPointerMove)
    document.removeEventListener("pointerup", onPointerUp)
    document.removeEventListener("pointercancel", onPointerCancel)
    document.removeEventListener("keydown", onKeyDown)
  }

  function onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== pointerId) return
    const moved = !!box
    const end = point(e)
    const wasSelectMode = selectMode
    finish()
    if (!moved) return
    swallowClick()

    /* One selection per trip into select mode, as on master */
    if (wasSelectMode) setSelectMode(false)

    const found = dotLayer.activitiesInScreenBox(start.x, start.y, end.x, end.y)
    for (const A of found.keys()) A.selected = !A.selected

    /* The list scrolls to, and the popup identifies, what the box just
     * selected, so adding to a selection on the map says what was added. A
     * box selects its activities all at once, so of several the most recent
     * stands for "last": the list is newest first, so its row is the top of
     * the new selection. Deselecting shows nothing new. */
    let newest: Activity | undefined
    for (const A of found.keys())
      if (A.selected && (!newest || (A.ts || 0) > (newest.ts || 0))) newest = A

    Table.update()
    Table.selectionChanged(newest)

    /* The popup goes on the activity where it crossed the box, which is on
     * screen, rather than at the middle of the activity, which zoomed in
     * often isn't. */
    if (newest) activityPopup(map, newest, map.unproject(found.get(newest)))
  }

  /* The browser follows a drag with a click. MapLibre would take it for a
   * click on the map, since it never saw the mousedown that would tell it a
   * drag came first, and close the popup this drag just opened. So stop that
   * click -- only that one: if none comes, stop waiting after this task. */
  function swallowClick(): void {
    const stop = (e: Event) => e.stopPropagation()
    window.addEventListener("click", stop, { capture: true, once: true })
    setTimeout(() => window.removeEventListener("click", stop, true))
  }

  function onPointerCancel(e: PointerEvent): void {
    if (e.pointerId === pointerId) finish()
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Escape") finish()
  }

  map.boxZoom.disable()
  container.addEventListener("pointerdown", onPointerDown, { capture: true })
  render()
  map.addControl(control, "top-left")
}
