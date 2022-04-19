import * as L from "leaflet"

declare module "leaflet" {
  namespace Control {
    interface WatermarkOptions extends ControlOptions {
      image: string
      width: string
      opacity: string
    }
    class Watermark extends Control {
      constructor(options?: WatermarkOptions)
      onAdd(): HTMLImageElement
      options: WatermarkOptions
    }

    interface InfoViewerOptions extends ControlOptions {
      style?: CSSStyleDeclaration
    }
    class InfoViewer extends Control {
      constructor(options?: InfoViewerOptions)
      _el: HTMLDivElement
      _map: Map
      options: InfoViewerOptions
      onAdd(map: Map): HTMLDivElement
      onMove(): void
    }
  }
}
