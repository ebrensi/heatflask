import * as L from "leaflet"

declare module "leaflet" {
  namespace Control {
    interface SidebarOptions {
      position: string
    }

    class _Sidebar extends Control {
      constructor(id: string, options?: SidebarOptions)
      options: ControlOptions
      addTo(map: Map): this
      remove(): this
      open(id: string): this
      close(): this
    }

    interface Sidebar extends _Sidebar, Evented {}
  }

  namespace control {
    function sidebar(
      id: string,
      options?: Control.SidebarOptions
    ): L.Control.Sidebar
  }
}
