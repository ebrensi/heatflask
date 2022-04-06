// import * as L from "npm:leaflet"
// import { Control, control } from "npm:leaflet"
import { Map, ControlOptions } from "npm:leaflet"

declare namespace L {
  namespace Control {
    interface SidebarOptions {
      position: string
    }

    class Sidebar extends Control {
      constructor(id: string, options?: SidebarOptions)
      options: ControlOptions
      addTo(map: Map): this
      remove(): this
      open(id: string): this
      close(): this
    }
  }

  namespace control {
    function sidebar(
      id: string,
      options?: Control.SidebarOptions
    ): L.Control.Sidebar
  }
}
