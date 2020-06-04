import { TileLayer, tileLayer } from "leaflet";

// these plugins modify the TileLayer class
import "./TileLayer.NoGap.js";
import "./TileLayer.Cached.js";
import "leaflet-providers";

export { TileLayer, tileLayer }
