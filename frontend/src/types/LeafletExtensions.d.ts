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

  function areaSelect(box: AreaSelectOptions): AreaSelect

  interface AreaSelectOptions {
    width?: number
    height?: number
    minWidth?: number
    minHorizontalSpacing?: number
    minVerticalSpacing?: number
    keepAspectRatio?: boolean
  }

  interface Dimension {
    width: number
    height: number
  }

  class AreaSelect extends Evented {
    constructor(options?: AreaSelectOptions)
    addTo(map: Map): Map
    getBounds(): LatLngBounds
    setDimensions(dim: Dimension): void
  }
}
