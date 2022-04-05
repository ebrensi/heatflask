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
  TileLayerOptions,
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
  TileLayerOptions,
  tileLayer,
  GridLayer,
  Util,
}

/*
 * The global namespace L is required by a few plugins.  We provide one,
 * with the bare minimum content that they require.
 */
const L = {
  Browser,
  Class,
  control,
  Control,
  DomEvent,
  DomUtil,
  Draggable,
  Evented,
  extend,
  point,
  Point,
  setOptions,
  TileLayer,
  tileLayer,
  Util,
}

export type LeafletGlobal = typeof L

window.L = L
