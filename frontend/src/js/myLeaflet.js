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
} from "../../node_modules/leaflet/dist/leaflet-src.esm.js"
// } from "../../node_modules/leaflet/src/Leaflet.js"

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
