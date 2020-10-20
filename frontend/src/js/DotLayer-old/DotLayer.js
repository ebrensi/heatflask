import { Layer } from "leaflet"
import extension from "./_DotLayer.js"
import { ViewBox } from "./DotLayer.ViewBox.js"
import { DrawBox } from "./DotLayer.DrawBox.js"

extension.ViewBox = ViewBox
extension.DrawBox = DrawBox

export const DotLayer = Layer.extend(extension)

export const dotLayer = function (options) {
  return new DotLayer(options)
}
