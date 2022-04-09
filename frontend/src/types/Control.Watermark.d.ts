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
      options: ControlOptions
    }
  }
}
