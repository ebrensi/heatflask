import { tileLayer, TileLayer, TileLayerOptions } from "../myLeaflet"

// these plugins modify the TileLayer class
import { cachedLayerOptions, cachedLayerMethods } from "./TileLayer.Cached"
import "npm:leaflet-providers"

type myTileLayerOptions = TileLayerOptions & typeof cachedLayerOptions
type myTileLayer = TileLayer & typeof cachedLayerMethods

// TODO: Get these types right
export { tileLayer }
