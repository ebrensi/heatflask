/*
 *  Some Leaflet plugins expect the global variable L, so we supply one
 *  with just enough for them to function.
 */

import {
  bind,
  Browser,
  Bounds,
  Class,
  control,
  Control,
  DomEvent,
  DomUtil,
  Draggable,
  Evented,
  extend,
  Handler,
  LatLng,
  LatLngBounds,
  Layer,
  Map,
  point,
  Point,
  setOptions,
  TileLayer,
  tileLayer,
  GridLayer,
  Util,
} from "leaflet"

export {
  bind,
  Browser,
  Bounds,
  Class,
  control,
  Control,
  DomEvent,
  Draggable,
  DomUtil,
  Evented,
  extend,
  Handler,
  LatLng,
  LatLngBounds,
  Layer,
  Map,
  point,
  Point,
  setOptions,
  TileLayer,
  tileLayer,
  GridLayer,
  Util,
}

/*
 * The global namespace L is required by a few plugins.  We provide one,
 * with the bare minimum content that they require.
 */
window.L = {
  //bind,
  Browser,
  //Bounds,
  Class,
  control,
  Control,
  DomEvent,
  DomUtil,
  Draggable,
  Evented,
  extend,
  //Handler,
  //LatLngBounds,
  //Layer,
  //Map,
  point,
  Point,
  setOptions,
  TileLayer,
  tileLayer,
  //GridLayer,
  Util,
}

// Map._animateZoom = function (center, zoom, startAnim, noUpdate) {
//   if (!this._mapPane) {
//     return
//   }

//   if (startAnim) {
//     this._animatingZoom = true

//     // remember what center/zoom to set after animation
//     this._animateToCenter = center
//     this._animateToZoom = zoom

//     addClass(this._mapPane, "leaflet-zoom-anim")
//   }

//   // @section Other Events
//   // @event zoomanim: ZoomAnimEvent
//   // Fired at least once per zoom animation. For continuous zoom, like pinch zooming, fired once per frame during zoom.
//   this.fire("zoomanim", {
//     center: center,
//     zoom: zoom,
//     noUpdate: noUpdate,
//   })

//   // Work around webkit not firing 'transitionend', see https://github.com/Leaflet/Leaflet/issues/3689, 2693
//   setTimeout(bind(this._onZoomTransitionEnd, this), 0)
// }
