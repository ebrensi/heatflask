
import { TileLayer, tileLayer } from "leaflet";

import extension from "./Extension.js"
import * as providers from "./Providers.js"

TileLayer.Provider = TileLayer.extend(extension);
TileLayer.Provider.providers = providers;

tileLayer.provider = function (provider, options) {
	return new TileLayer.Provider(provider, options);
};

export { TileLayer, tileLayer }
