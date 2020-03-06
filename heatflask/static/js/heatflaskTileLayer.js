
L.TileLayer.CreateDB = function() {

}

// 🍂namespace TileLayer
// 🍂option useCache: Boolean = false
L.TileLayer.prototype.options.useCache = true;
L.TileLayer.prototype.cacheHits = 0;
L.TileLayer.prototype.cacheMisses = 0;


// 🍂option saveToCache: Boolean = true
// When caching is enabled, whether to save new tiles to the cache or not
L.TileLayer.prototype.options.saveToCache = true;

// 🍂option useOnlyCache: Boolean = false
// When caching is enabled, whether to request new tiles from the network or not
L.TileLayer.prototype.options.useOnlyCache = false;

// // 🍂option cacheFormat: String = 'image/png'
// // The image format to be used when saving the tile images in the cache
// L.TileLayer.prototype.options.cacheFormat = "image/png";

// 🍂option cacheMaxAge: Number = 24*3600*1000
// Maximum age of the cache, in milliseconds
L.TileLayer.prototype.options.cacheMaxAge = 24 * 3600 * 1000;

L.TileLayer.prototype.options.minNativeZoom = 0;

L.TileLayer.prototype.options.dbName = "tile-storage";

L.TileLayer.prototype.options.updateInterval = 0;

// L.TileLayer.addInitHook(function() {
//     debugger;
//     if (this.options.useCache)
//         this._db = new idbKeyval.Store(this.options.dbName, this.name);
// });


L.TileLayer.include({

    // returns the unique and compact lookup key for this tile
    onAdd: function(map) {
        // debugger;
        if (this.options.useCache) {
            this._db = new idbKeyval.Store(this.options.dbName, this.name);
        }
        
        L.GridLayer.prototype.onAdd.call(this, map)
    },

    onRemove: function (map) {
        if (this._db) {
            L.GridLayer.prototype.onRemove.call(this, map);
            this._db.close()
            this._db = undefined
        }
    },

    _key: function(coords) {
        return String.fromCodePoint( coords.z, coords.x, coords.y );
        // return `${coords.z}:${coords.x}:${coords.y}`
    },

    // Overwrites L.TileLayer.prototype.createTile
    createTile: function(coords, done) {
        const tile = document.createElement("img"),
              tileUrl = this.getTileUrl(coords);

        tile.onerror = L.bind(this._tileOnError, this, done, tile);
        tile.onload = L.bind(this._tileOnLoad, this, done, tile);

        if (this.options.crossOrigin) {
            tile.crossOrigin = "";
        }
        tile.crossOrigin = 'Anonymous';
        /*
         Alt tag is *set to empty string to keep screen readers from reading URL and for compliance reasons
         http://www.w3.org/TR/WCAG20-TECHS/H67
         */
        tile.alt = "";

        /*
         Set role="presentation" to force screen readers to ignore this
         https://www.w3.org/TR/wai-aria/roles#textalternativecomputation
        */
        tile.setAttribute('role', 'presentation');

        if (this.options.useCache && this._db) {

            const key = this._key(coords);
            idbKeyval.get(key, this._db)
                     .then( data => data? 
                            this._onCacheHit(tile, tileUrl, key, data, done) :
                            this._onCacheMiss(tile, tileUrl, key, done)
                    )
        } else {
            // Fall back to standard behaviour
            tile.onload = L.bind(this._tileOnLoad, this, done, tile);
            tile.src = tileUrl;
        }

        tile._originalCoords = coords;
        tile._originalSrc = tile.src;

        return tile;
    },

    _createCurrentCoords: function (originalCoords) {
        var currentCoords = this._wrapCoords(originalCoords);

        currentCoords.fallback = true;

        return currentCoords;
    },

    _originalTileOnError: L.TileLayer.prototype._tileOnError,

    _tileOnError: function (done, tile, e) {
        var layer = this, // `this` is bound to the Tile Layer in L.TileLayer.prototype.createTile.
            originalCoords = tile._originalCoords,
            currentCoords = tile._currentCoords = tile._currentCoords || layer._createCurrentCoords(originalCoords),
            fallbackZoom = tile._fallbackZoom = tile._fallbackZoom === undefined ? originalCoords.z - 1 : tile._fallbackZoom - 1,
            scale = tile._fallbackScale = (tile._fallbackScale || 1) * 2,
            tileSize = layer.getTileSize(),
            style = tile.style,
            newUrl, top, left;

        // If no lower zoom tiles are available, fallback to errorTile.
        if (fallbackZoom < layer.options.minNativeZoom) {
            return this._originalTileOnError(done, tile, e);
        }

        // Modify tilePoint for replacement img.
        currentCoords.z = fallbackZoom;
        currentCoords.x = Math.floor(currentCoords.x / 2);
        currentCoords.y = Math.floor(currentCoords.y / 2);

        // Generate new src path.
        newUrl = layer.getTileUrl(currentCoords);

        // Zoom replacement img.
        style.width = (tileSize.x * scale) + 'px';
        style.height = (tileSize.y * scale) + 'px';

        // Compute margins to adjust position.
        top = (originalCoords.y - currentCoords.y * scale) * tileSize.y;
        style.marginTop = (-top) + 'px';
        left = (originalCoords.x - currentCoords.x * scale) * tileSize.x;
        style.marginLeft = (-left) + 'px';

        // Crop (clip) image.
        // `clip` is deprecated, but browsers support for `clip-path: inset()` is far behind.
        // http://caniuse.com/#feat=css-clip-path
        style.clip = 'rect(' + top + 'px ' + (left + tileSize.x) + 'px ' + (top + tileSize.y) + 'px ' + left + 'px)';

        layer.fire('tilefallback', {
            tile: tile,
            url: tile._originalSrc,
            urlMissing: tile.src,
            urlFallback: newUrl
        });

        tile.src = newUrl;
    },

    getTileUrl: function (coords) {
        var z = coords.z = coords.fallback ? coords.z : this._getZoomForUrl();

        var data = {
            r: L.Browser.retina ? '@2x' : '',
            s: this._getSubdomain(coords),
            x: coords.x,
            y: coords.y,
            z: z
        };
        if (this._map && !this._map.options.crs.infinite) {
            var invertedY = this._globalTileRange.max.y - coords.y;
            if (this.options.tms) {
                data['y'] = invertedY;
            }
            data['-y'] = invertedY;
        }

        return L.Util.template(this._url, L.extend(data, this.options));
    },

    _onCacheHit: function(tile, tileUrl, key, data, done) {

        this.cacheHits++;

        // Serve tile from cached data
        //console.log('Tile is cached: ', tileUrl);
        tile.src = URL.createObjectURL(data.blob);

        // if (
        //     Date.now() > data.ts + this.options.cacheMaxAge &&
        //     !this.options.useOnlyCache
        // )
    },

    _tileOnLoad: function(done, tile) {
        URL.revokeObjectURL(tile.src);
        done(null, tile);
    },

    _onCacheMiss: function(tile, tileUrl, key, done) {
   
        this.cacheMisses++;

        if (this.options.useOnlyCache) {
            // Offline, not cached
            //  console.log('Tile not in cache', tileUrl);
            tile.onload = L.Util.falseFn;
            tile.src = L.Util.emptyImageUrl;
        } else {
            // Online, not cached, fetch the tile
            if (this.options.saveToCache) {
                // console.log('fetching tile', tileUrl);
                // t0 = performance.now();

                fetch(tileUrl)
                    .then( response => response.blob() )
                    .then( blob => {
                        // console.log(`${key} fetch took ${~~(performance.now()-t0)}`);
                        idbKeyval.set(key, {
                            ts: Date.now(),
                            blob: blob,
                        }, this._db);

                        tile.src = URL.createObjectURL(blob);
                        
                    })
                    .catch(error => {
                        this._tileOnError(done, tile, error);
                    });   
            } else {
                // handle normally
                tile.onload = L.bind(this._tileOnLoad, this, done, tile);
                tile.crossOrigin = "Anonymous";
                tile.src = tileUrl;
            }
        }
    },

    _createTile: function() {
        return document.createElement("img");
    },

    // Modified L.TileLayer.getTileUrl, this will use the zoom given by the parameter coords
    //  instead of the maps current zoomlevel.
    _getTileUrl: function(coords) {
        var zoom = coords.z;
        if (this.options.zoomReverse) {
            zoom = this.options.maxZoom - zoom;
        }
        zoom += this.options.zoomOffset;
        return L.Util.template(
            this._url,
            L.extend(
                {
                    r:
                        this.options.detectRetina &&
                        L.Browser.retina &&
                        this.options.maxZoom > 0
                            ? "@2x"
                            : "",
                    s: this._getSubdomain(coords),
                    x: coords.x,
                    y: this.options.tms
                        ? this._globalTileRange.max.y - coords.y
                        : coords.y,
                    z: this.options.maxNativeZoom
                        ? Math.min(zoom, this.options.maxNativeZoom)
                        : zoom,
                },
                this.options
            )
        );
    },
});
