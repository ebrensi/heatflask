import { TileLayer, tileLayer } from "leaflet";

// these plugins modify the TileLayer class
import "./TileLayer.NoGap.js";
import "./TileLayer.Cached.js";
import "./TileLayer.Providers/Layer.js";

export { TileLayer, tileLayer }
