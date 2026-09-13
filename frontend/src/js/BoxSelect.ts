/*
 * BoxSelect -- select activities by ctrl-dragging a box over the map.
 *
 * A port of master's L.BoxHook.js, which was itself modelled on Leaflet's
 * built-in BoxZoom handler (shift-drag to zoom). Same idea, ctrl instead of
 * shift, and it fires an event with the region rather than zooming to it.
 *
 * The styling comes for free: Leaflet's own stylesheet already defines
 * .leaflet-zoom-box and .leaflet-crosshair for BoxZoom, and this reuses both,
 * so a ctrl-drag looks exactly like the shift-drag people already know.
 *
 * This replaces the select-by-area button. The one thing that button did that
 * ctrl-drag cannot is work on a touchscreen -- master kept a separate
 * L.SwipeSelect control for that case, which has not been ported.
 */

import { Handler, DomEvent, DomUtil, Bounds, LatLngBounds, Map } from "leaflet"
import * as ViewBox from "./DotLayer/ViewBox"
import * as ActivityCollection from "./DotLayer/ActivityCollection"
import * as Table from "./Table"
import { dotLayer } from "./DotLayerAPI"
import { activityPopup } from "./ActivityPopup"

import type { Map as LMap } from "leaflet"

/* Leaflet internals the handler needs; @types/leaflet declares no
 * underscore-prefixed members. */
type MapInternals = {
  _container: HTMLElement
  dragging: { enable(): void; disable(): void }
  touchZoom: { enable(): void; disable(): void }
  doubleClickZoom: { enable(): void; disable(): void }
  scrollWheelZoom: { enable(): void; disable(): void }
}

type AnyMap = LMap & MapInternals

export const BoxSelect = Handler.extend({
  initialize: function (map: AnyMap) {
    this._map = map
    this._container = map._container
    this._resetStateTimeout = 0
    map.on("unload", this._destroy, this)
  },

  addHooks: function () {
    DomEvent.on(this._container, "mousedown", this._onMouseDown, this)
  },

  removeHooks: function () {
    DomEvent.off(this._container, "mousedown", this._onMouseDown, this)
  },

  moved: function () {
    return this._moved
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

  _onMouseDown: function (e: MouseEvent) {
    if (!e.ctrlKey || (e.which !== 1 && e.button !== 1)) return false

    /* Clear a deferred resetState that has not run yet, or it will interrupt
     * this interaction and orphan a box element in the container. */
    this._clearDeferredResetState()
    this._resetState()

    DomUtil.disableTextSelection()
    DomUtil.disableImageDrag()

    const map = <AnyMap>this._map
    map.dragging.disable()
    map.touchZoom.disable()
    map.doubleClickZoom.disable()
    map.scrollWheelZoom.disable()

    this._startPoint = map.mouseEventToContainerPoint(e)

    DomEvent.on(
      <never>document,
      {
        contextmenu: DomEvent.stop,
        mousemove: this._onMouseMove,
        mouseup: this._onMouseUp,
        keydown: this._onKeyDown,
      },
      this
    )
  },

  _onMouseMove: function (e: MouseEvent) {
    if (!this._moved) {
      this._moved = true
      this._box = DomUtil.create("div", "leaflet-zoom-box", this._container)
      DomUtil.addClass(this._container, "leaflet-crosshair")
      this._map.fire("boxselectstart")
    }

    this._point = (<AnyMap>this._map).mouseEventToContainerPoint(e)

    const bounds = new Bounds([this._point, this._startPoint])
    const size = bounds.getSize()

    DomUtil.setPosition(this._box, bounds.min)
    this._box.style.width = size.x + "px"
    this._box.style.height = size.y + "px"
  },

  _finish: function () {
    if (this._moved) {
      DomUtil.remove(this._box)
      DomUtil.removeClass(this._container, "leaflet-crosshair")
    }

    DomUtil.enableTextSelection()
    DomUtil.enableImageDrag()

    const map = <AnyMap>this._map
    map.dragging.enable()
    map.touchZoom.enable()
    map.doubleClickZoom.enable()
    map.scrollWheelZoom.enable()

    DomEvent.off(
      <never>document,
      {
        contextmenu: DomEvent.stop,
        mousemove: this._onMouseMove,
        mouseup: this._onMouseUp,
        keydown: this._onKeyDown,
      },
      this
    )
  },

  _onMouseUp: function (e: MouseEvent) {
    if (e.which !== 1 && e.button !== 1) return

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
    })
  },

  _onKeyDown: function (e: KeyboardEvent) {
    if (e.keyCode === 27) this._finish()
  },
})

Map.mergeOptions({ boxSelect: true })
Map.addInitHook("addHandler", "boxSelect", <never>BoxSelect)

/**
 * Wire ctrl-drag to activity selection.
 *
 * The handler itself only reports a region; deciding what that means is this
 * function's job, so the handler stays reusable.
 */
export function addBoxSelect(map: LMap): void {
  /* "boxselectend" is ours, so it is not in @types/leaflet's event-name union
   * and map.on() will not accept it. Declaring the listener's shape keeps the
   * payload typed instead of casting the whole call to any. */
  const emitter = <BoxSelectEmitter>(<unknown>map)

  emitter.on("boxselectend", (e: BoxSelectEvent) => {
    if (!e.latLngBounds) return

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
}

/** What "boxselectend" carries: the dragged region, two ways. */
export type BoxSelectEvent = {
  latLngBounds: LatLngBounds
  pxBounds: Bounds
}

type BoxSelectEmitter = {
  on(type: "boxselectend", fn: (e: BoxSelectEvent) => void): void
}
