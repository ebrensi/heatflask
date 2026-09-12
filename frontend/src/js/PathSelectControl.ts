/*
 * PathSelectControl -- select activities by dragging a box over the map.
 *
 * A two-state button: the first click drops leaflet-areaselect's resizable
 * box on the map, the second applies it -- every activity with a point inside
 * the box becomes selected, and the rest are deselected.
 *
 * The pieces were already here: MapAPI instantiates map.areaSelect,
 * ViewBox.latLng2pxBounds converts the box, and
 * ActivityCollection.inPxBounds walks the in-view activities against it.
 * Only the control was missing (Control.pathSelect.ts never existed).
 */

import { Control, DomUtil, DomEvent } from "leaflet"
import { icon } from "./Icons"
import * as ViewBox from "./DotLayer/ViewBox"
import * as ActivityCollection from "./DotLayer/ActivityCollection"
import * as Table from "./Table"
import { dotLayer } from "./DotLayerAPI"

import type { Map as LMap, LatLngBounds } from "leaflet"

const SELECT_ICON = icon("object-group")
const APPLY_ICON = icon("checkmark")

type AreaSelect = {
  addTo(map: LMap): unknown
  remove(): unknown
  getBounds(): LatLngBounds
}
type MapWithAreaSelect = LMap & { areaSelect: AreaSelect }
type ControlCtor = new () => { addTo(map: LMap): unknown }

export function addPathSelectControl(map: LMap): void {
  const areaSelect = (<MapWithAreaSelect>map).areaSelect
  if (!areaSelect) return

  let active = false

  function apply(): void {
    const pxBounds = ViewBox.latLng2pxBounds(areaSelect.getBounds())
    const found = new Set(ActivityCollection.inPxBounds(pxBounds))

    for (const A of ActivityCollection.items.values()) {
      A.selected = found.has(A)
    }

    Table.update()
    if (dotLayer) dotLayer.redraw(true)
  }

  const PathSelectControl = Control.extend({
    options: { position: "topleft" },

    onAdd: function () {
      const container = DomUtil.create(
        "div",
        "leaflet-bar leaflet-control path-select-control"
      )
      const button = <HTMLAnchorElement>DomUtil.create("a", "", container)
      button.href = "#"
      button.setAttribute("role", "button")

      const render = () => {
        button.innerHTML = active ? APPLY_ICON : SELECT_ICON
        button.title = active
          ? "Select the activities inside the box"
          : "Select activities by area"
        button.setAttribute("aria-label", button.title)
      }

      DomEvent.on(button, "click", (e: Event) => {
        DomEvent.stop(e)

        if (active) {
          apply()
          areaSelect.remove()
          active = false
        } else {
          areaSelect.addTo(map)
          active = true
        }
        render()
      })

      render()
      return container
    },
  })

  new (<ControlCtor>(<unknown>PathSelectControl))().addTo(map)
}
