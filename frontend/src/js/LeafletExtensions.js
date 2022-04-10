import Geohash from "latlon-geohash"
import { Control, DomUtil } from "leaflet"

// Watermark control
Control.Watermark = Control.extend({
  onAdd: function () {
    const img = DomUtil.create("img")
    img.src = this.options.image
    img.style.width = this.options.width
    img.style.opacity = this.options.opacity
    return img
  },
})

/*
 * Display for debugging
 */
Control.InfoViewer = Control.extend({
  options: {
    style: {
      width: "200px",
      padding: "5px",
      background: "rgba(255,255,255,0.6)",
      textAlign: "left",
    },
  },
  onAdd(map) {
    const el = DomUtil.create("div")
    Object.assign(el.style, this.options.style)
    this._el = el
    this._map = map

    map.on("zoomstart zoom zoomend move", this.onMove)
    map.fireEvent("move")
    return el
  },

  onRemove(map) {
    map.off("zoomstart zoom zoomend move", this.onMove)
    this.el.remove()
  },

  onMove() {
    const map = this._map
    const zoom = map.getZoom()
    const center = map.getCenter()
    const gh = Geohash.encode(center.lat, center.lng, zoom)
    const { x: pox, y: poy } = map.getPixelOrigin()
    const { x: mx, y: my } = map._getMapPanePos()
    const llb = map.getBounds()
    const W = llb.getWest()
    const S = llb.getSouth()
    const N = llb.getNorth()
    const E = llb.getEast()

    this._el.innerHTML =
      `<b>Map</b>: zoom: ${zoom.toFixed(2)}<br>` +
      `GeoHash: ${gh}<br>` +
      `SW: ${W.toFixed(4)}, ${S.toFixed(4)}<br>` +
      `NE: ${E.toFixed(4)}, ${N.toFixed(4)}<br>` +
      `px0: ${pox}, ${poy}<br>` +
      `mpp: ${mx.toFixed(3)}, ${my.toFixed(3)}<br>`
  },
})
