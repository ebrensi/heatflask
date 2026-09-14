/*
 * BoxSelect -- select activities by dragging a box over the map.
 *
 * Two ways in:
 *
 *   ctrl-drag   with a mouse, any time
 *   select mode a toggle button; while it is on, a plain drag -- one finger on
 *               a touchscreen -- draws the box instead of panning
 *
 * Select mode replaces master's L.SwipeSelect, which laid a canvas over the
 * map and turned touch events into fake mouse events for it. Pointer events
 * cover mouse, touch and pen with one set of handlers, so both ways in share
 * the same code here.
 *
 * The ctrl-drag half is a port of master's L.BoxHook.js, which was modelled on
 * Leaflet's built-in BoxZoom handler (shift-drag to zoom): same idea, ctrl
 * instead of shift, and it fires an event with the region rather than zooming
 * to it. Leaflet's stylesheet already defines .leaflet-zoom-box and
 * .leaflet-crosshair for BoxZoom, and this reuses both, so the box looks like
 * the shift-drag one.
 */

import {
  Control,
  Handler,
  DomEvent,
  DomUtil,
  Bounds,
  LatLngBounds,
  Map,
} from "leaflet"
import * as ViewBox from "./DotLayer/ViewBox"
import * as ActivityCollection from "./DotLayer/ActivityCollection"
import * as Table from "./Table"
import { icon } from "./Icons"
import { dotLayer } from "./DotLayerAPI"
import { activityPopup } from "./ActivityPopup"

import type { Map as LMap } from "leaflet"

/* Leaflet internals the handler needs; @types/leaflet declares no
 * underscore-prefixed members. */
type Toggle = { enable(): void; disable(): void }
type MapInternals = {
  _container: HTMLElement
  dragging: Toggle
  touchZoom: Toggle
  doubleClickZoom: Toggle
  scrollWheelZoom: Toggle
}

type AnyMap = LMap & MapInternals

/** Whether pan and zoom gestures reach the map. */
function mapManipulation(map: AnyMap, on: boolean): void {
  const method = on ? "enable" : "disable"
  map.dragging[method]()
  map.touchZoom[method]()
  map.doubleClickZoom[method]()
  map.scrollWheelZoom[method]()
}

export const BoxSelect = Handler.extend({
  initialize: function (map: AnyMap) {
    this._map = map
    this._container = map._container
    this._resetStateTimeout = 0
    this._selectMode = false
    this._pointerId = null
    map.on("unload", this._destroy, this)
  },

  addHooks: function () {
    DomEvent.on(this._container, "pointerdown", this._onPointerDown, this)
  },

  removeHooks: function () {
    DomEvent.off(this._container, "pointerdown", this._onPointerDown, this)
    this.setSelectMode(false)
  },

  moved: function () {
    return this._moved
  },

  selectMode: function (): boolean {
    return this._selectMode
  },

  /**
   * Turn select mode on or off. While it is on the map does not pan or
   * pinch-zoom, since those gestures now draw the box. The wheel and the zoom
   * buttons still zoom.
   */
  setSelectMode: function (on: boolean) {
    if (on === this._selectMode) return
    if (!on && this._pointerId !== null) this._finish()
    this._selectMode = on

    const map = <AnyMap>this._map
    map.dragging[on ? "disable" : "enable"]()
    map.touchZoom[on ? "disable" : "enable"]()
    map.doubleClickZoom[on ? "disable" : "enable"]()

    /* Leaflet sets touch-action on the container from the handlers that are
     * enabled, and with dragging and touchZoom both off it leaves the default,
     * which lets the browser claim a touch drag as a page scroll -- it then
     * sends pointercancel and the box never gets drawn. */
    this._container.style.touchAction = on ? "none" : ""

    if (on) DomUtil.addClass(this._container, "leaflet-crosshair")
    else DomUtil.removeClass(this._container, "leaflet-crosshair")

    map.fire("boxselectmode", { on })
  },

  _destroy: function () {
    this._finish()
  },

  _resetState: function () {
    this._resetStateTimeout = 0
    this._moved = false
  },

  _clearDeferredResetState: function () {
    if (this._resetStateTimeout !== 0) {
      clearTimeout(this._resetStateTimeout)
      this._resetStateTimeout = 0
    }
  },

  _onPointerDown: function (e: PointerEvent) {
    /* Primary button only, and only the first finger: a second finger landing
     * mid-drag must not start another box. */
    if (!e.isPrimary || e.button !== 0 || this._pointerId !== null) return
    if (!this._selectMode && !(e.ctrlKey && e.pointerType === "mouse")) return

    /* Clear a deferred resetState that has not run yet, or it will interrupt
     * this interaction and orphan a box element in the container. */
    this._clearDeferredResetState()
    this._resetState()

    /* pointerdown fires before mousedown and touchstart, so disabling the map's
     * gestures here keeps them from seeing this drag at all. preventDefault
     * also stops the drag from selecting text. */
    DomEvent.preventDefault(e)
    DomUtil.disableTextSelection()
    DomUtil.disableImageDrag()

    const map = <AnyMap>this._map
    mapManipulation(map, false)

    this._pointerId = e.pointerId
    this._startPoint = map.mouseEventToContainerPoint(<never>e)

    DomEvent.on(
      <never>document,
      {
        contextmenu: DomEvent.stop,
        pointermove: this._onPointerMove,
        pointerup: this._onPointerUp,
        pointercancel: this._onPointerCancel,
        keydown: this._onKeyDown,
      },
      this
    )
  },

  _onPointerMove: function (e: PointerEvent) {
    if (e.pointerId !== this._pointerId) return

    if (!this._moved) {
      this._moved = true
      this._box = DomUtil.create("div", "leaflet-zoom-box", this._container)
      DomUtil.addClass(this._container, "leaflet-crosshair")
      this._map.fire("boxselectstart")
    }

    this._point = (<AnyMap>this._map).mouseEventToContainerPoint(<never>e)

    const bounds = new Bounds([this._point, this._startPoint])
    const size = bounds.getSize()

    DomUtil.setPosition(this._box, bounds.min)
    this._box.style.width = size.x + "px"
    this._box.style.height = size.y + "px"
  },

  _finish: function () {
    if (this._moved) {
      DomUtil.remove(this._box)
      if (!this._selectMode) {
        DomUtil.removeClass(this._container, "leaflet-crosshair")
      }
    }

    DomUtil.enableTextSelection()
    DomUtil.enableImageDrag()

    /* Hand the gestures back, except the ones select mode is holding. */
    const map = <AnyMap>this._map
    map.scrollWheelZoom.enable()
    if (!this._selectMode) mapManipulation(map, true)

    this._pointerId = null

    DomEvent.off(
      <never>document,
      {
        contextmenu: DomEvent.stop,
        pointermove: this._onPointerMove,
        pointerup: this._onPointerUp,
        pointercancel: this._onPointerCancel,
        keydown: this._onKeyDown,
      },
      this
    )
  },

  _onPointerUp: function (e: PointerEvent) {
    if (e.pointerId !== this._pointerId) return

    this._finish()
    if (!this._moved) return

    /* Deferred a tick so click handling still sees this as "moved" */
    this._clearDeferredResetState()
    this._resetStateTimeout = setTimeout(() => this._resetState(), 0)

    const map = <AnyMap>this._map
    const latLngBounds = new LatLngBounds(
      map.containerPointToLatLng(this._startPoint),
      map.containerPointToLatLng(this._point)
    )

    map.fire("boxselectend", {
      latLngBounds,
      pxBounds: new Bounds([this._startPoint, this._point]),
      selectMode: this._selectMode,
    })
  },

  /* The browser took the pointer (a system gesture, say): drop the box. */
  _onPointerCancel: function (e: PointerEvent) {
    if (e.pointerId !== this._pointerId) return
    this._finish()
    this._resetState()
  },

  _onKeyDown: function (e: KeyboardEvent) {
    if (e.key === "Escape") this._finish()
  },
})

Map.mergeOptions({ boxSelect: true })
Map.addInitHook("addHandler", "boxSelect", <never>BoxSelect)

type BoxSelectHandler = {
  selectMode(): boolean
  setSelectMode(on: boolean): void
}

/**
 * Wire box selection to activities, and add the select-mode button.
 *
 * The handler itself only reports a region; deciding what that means is this
 * function's job, so the handler stays reusable.
 */
export function addBoxSelect(map: LMap): void {
  const handler = (<LMap & { boxSelect: BoxSelectHandler }>map).boxSelect

  /* "boxselectend" is ours, so it is not in @types/leaflet's event-name union
   * and map.on() will not accept it. Declaring the listener's shape keeps the
   * payload typed instead of casting the whole call to any. */
  const emitter = <BoxSelectEmitter>(<unknown>map)

  emitter.on("boxselectend", (e: BoxSelectEvent) => {
    if (!e.latLngBounds) return

    /* One selection per trip into select mode, as on master: the map pans
     * again as soon as the box is drawn. */
    if (e.selectMode) handler.setSelectMode(false)

    /* Go through ViewBox rather than the raw container pixels the handler
     * reports: ActivityCollection indexes activities in ViewBox pixel space,
     * which is what inPxBounds expects. */
    const pxBounds = ViewBox.latLng2pxBounds(e.latLngBounds)
    const found = new Set(ActivityCollection.inPxBounds(pxBounds))

    for (const A of ActivityCollection.items.values()) A.selected = found.has(A)

    Table.update()
    if (dotLayer) dotLayer.redraw(true)

    /* A lone activity gets its details popped up over it, as on master.
     * Deferred because the mouseup that ended the drag is followed by a click,
     * and a map click closes any open popup. */
    map.closePopup()
    if (found.size === 1) {
      const [A] = found
      setTimeout(() => activityPopup(map, A), 100)
    }
  })

  addSelectModeControl(map, handler, emitter)
}

const SELECT_ICON = icon("object-group")
const CANCEL_ICON = icon("cross")

type ControlCtor = new () => { addTo(map: LMap): unknown }

function addSelectModeControl(
  map: LMap,
  handler: BoxSelectHandler,
  emitter: BoxSelectEmitter
): void {
  const SelectModeControl = Control.extend({
    options: { position: "topleft" },

    onAdd: function () {
      const container = DomUtil.create(
        "div",
        "leaflet-bar leaflet-control select-mode-control"
      )
      const button = <HTMLAnchorElement>DomUtil.create("a", "", container)
      button.href = "#"
      button.setAttribute("role", "button")

      const render = (on: boolean) => {
        button.innerHTML = on ? CANCEL_ICON : SELECT_ICON
        button.title = on
          ? "Stop selecting"
          : "Select activities: drag a box over them (or ctrl-drag any time)"
        button.setAttribute("aria-label", button.title)
        button.setAttribute("aria-pressed", String(on))
      }

      DomEvent.on(button, "click", (e: Event) => {
        // don't let the click reach the map underneath
        DomEvent.stop(e)
        handler.setSelectMode(!handler.selectMode())
      })

      /* The handler also leaves select mode on its own, after a selection */
      emitter.on("boxselectmode", (e: { on: boolean }) => render(e.on))

      render(handler.selectMode())
      return container
    },
  })

  new (<ControlCtor>(<unknown>SelectModeControl))().addTo(map)
}

/** What "boxselectend" carries: the dragged region, two ways. */
export type BoxSelectEvent = {
  latLngBounds: LatLngBounds
  pxBounds: Bounds
  /** whether the box was drawn in select mode rather than by ctrl-drag */
  selectMode: boolean
}

type BoxSelectEmitter = {
  on(type: "boxselectend", fn: (e: BoxSelectEvent) => void): void
  on(type: "boxselectmode", fn: (e: { on: boolean }) => void): void
}
