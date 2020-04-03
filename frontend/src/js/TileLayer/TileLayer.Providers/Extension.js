import { TileLayer, Util } from "leaflet";

export { extension as default };

const extension = {
	initialize: function (arg, options) {
		var providers = TileLayer.Provider.providers;

		var parts = arg.split('.');

		var providerName = parts[0];
		var variantName = parts[1];

		if (!providers[providerName]) {
			throw 'No such provider (' + providerName + ')';
		}

		var provider = {
			url: providers[providerName].url,
			options: providers[providerName].options
		};

		// overwrite values in provider from variant.
		if (variantName && 'variants' in providers[providerName]) {
			if (!(variantName in providers[providerName].variants)) {
				throw 'No such variant of ' + providerName + ' (' + variantName + ')';
			}
			var variant = providers[providerName].variants[variantName];
			var variantOptions;
			if (typeof variant === 'string') {
				variantOptions = {
					variant: variant
				};
			} else {
				variantOptions = variant.options;
			}
			provider = {
				url: variant.url || provider.url,
				options: Util.extend({}, provider.options, variantOptions)
			};
		}

		// replace attribution placeholders with their values from toplevel provider attribution,
		// recursively
		var attributionReplacer = function (attr) {
			if (attr.indexOf('{attribution.') === -1) {
				return attr;
			}
			return attr.replace(/\{attribution.(\w*)\}/g,
				function (match, attributionName) {
					return attributionReplacer(providers[attributionName].options.attribution);
				}
			);
		};
		provider.options.attribution = attributionReplacer(provider.options.attribution);

		// Compute final options combining provider options with any user overrides
		var layerOpts = Util.extend({}, provider.options, options);
		TileLayer.prototype.initialize.call(this, provider.url, layerOpts);
	}
};
