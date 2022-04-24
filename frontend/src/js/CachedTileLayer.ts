/*
 * This implementation of a cached tile-layer was adapted from
 *   https://github.com/MazeMap/Leaflet.TileLayer.PouchDBCached
 *   and
 *   https://github.com/ghybs/Leaflet.TileLayer.Fallback
 *
 *  The code for PouchDBCached was pretty good but rather than use CouchDB
 *    I decided to go with native IndexedDB, via myIDB.
 *
 *  Efrem Rensi 2020, 2021
 */

import * as idb from "./myIdb"

import { TileLayer, GridLayer, Util, Browser, bind, extend } from "leaflet"

import type { TileLayerOptions, Map, Coords, DoneCallback } from "leaflet"

export const DefaultCachedLayerOptions = {
  useCache: true,
  useOnlyCache: false,
  cacheMaxAge: 24 * 3600 * 1000,
  minNativeZoom: 0,
  dbName: "tile-storage",
  updateInterval: 200,
  updateWhenIdle: false,
}

TileLayer.mergeOptions(DefaultCachedLayerOptions)
type CacheOptions = typeof DefaultCachedLayerOptions
type CachedTileLayerOptions = TileLayerOptions & CacheOptions

type TileCoords = Coords & { fallback?: boolean }
interface TileElement extends HTMLImageElement {
  _originalCoords?: TileCoords
  _currentCoords?: TileCoords
  _originalSrc?: string
  _fallbackZoom?: number
  _fallbackScale?: number
}

type StoredObj = {
  ts?: Date
  blob: Blob
}

TileLayer.include({
  cacheHits: 0,
  cacheMisses: 0,

  // returns the unique and compact lookup key for this tile
  onAdd: function (map: Map) {
    if (this.options.useCache) {
      this._db = new idb.Store(this.options.dbName, this.name)
    }

    GridLayer.prototype.onAdd.call(this, map)
    return this
  },

  onRemove: function (map: Map) {
    if (this._db) {
      GridLayer.prototype.onRemove.call(this, map)
      this._db.close()
      this._db = undefined
    }
    return this
  },

  _key: function (coords: TileCoords) {
    return String.fromCodePoint(coords.z, coords.x, coords.y)
    // return `${coords.z}:${coords.x}:${coords.y}`
  },

  // Overwrites TileLayer.prototype.createTile
  createTile: function (coords: TileCoords, done: DoneCallback) {
    const tile = <TileElement>document.createElement("img")

    tile.onerror = bind(this._tileOnError, this, done, tile)
    tile.onload = bind(this._tileOnLoad, this, done, tile)

    // tile.crossOrigin = "Anonymous"
    if (this.options.crossOrigin || this.options.crossOrigin === "") {
      tile.crossOrigin =
        this.options.crossOrigin === true ? "" : this.options.crossOrigin
    }
    /*
     * Some settings to prevent screen readers from having problems
     *  http://www.w3.org/TR/WCAG20-TECHS/H67
     *  https://www.w3.org/TR/wai-aria/roles#textalternativecomputation
     */
    tile.alt = ""
    tile.setAttribute("role", "presentation")

    const tileUrl = this.getTileUrl(coords)
    if (this.options.useCache && this._db) {
      this._attachTileData(tile, tileUrl, this._key(coords), done)
    } else {
      // Fall back to standard behaviour
      tile.src = tileUrl
    }

    tile._originalCoords = coords
    tile._originalSrc = tileUrl

    return tile
  },

  _createCurrentCoords: function (originalCoords: TileCoords) {
    const currentCoords = this._wrapCoords(originalCoords)

    currentCoords.fallback = true

    return currentCoords
  },

  // @ts-expect-error  -- This object doesn't know it is a TileLayer
  _originalTileOnError: TileLayer.prototype._tileOnError,

  _tileOnError: function (done: DoneCallback, tile: TileElement, e: Error) {
    // `this` is bound to the Tile Layer in TileLayer.prototype.createTile.
    const layer = this /* eslint-disable-line */

    const originalCoords = tile._originalCoords
    const currentCoords =
      tile._currentCoords || layer._createCurrentCoords(originalCoords)
    if (!tile._currentCoords) tile._currentCoords = currentCoords

    const fallbackZoom = (tile._fallbackZoom =
      tile._fallbackZoom === undefined
        ? originalCoords.z - 1
        : tile._fallbackZoom - 1)
    const scale = (tile._fallbackScale = (tile._fallbackScale || 1) * 2)
    const tileSize = layer.getTileSize()
    const style = tile.style

    // If no lower zoom tiles are available, fallback to errorTile.
    if (fallbackZoom < layer.options.minNativeZoom) {
      return this._originalTileOnError(done, tile, e)
    }

    // Modify tilePoint for replacement img.
    currentCoords.z = fallbackZoom
    currentCoords.x = Math.floor(currentCoords.x / 2)
    currentCoords.y = Math.floor(currentCoords.y / 2)

    // Generate new src path.
    const newUrl = layer.getTileUrl(currentCoords)

    // Zoom replacement img.
    style.width = tileSize.x * scale + "px"
    style.height = tileSize.y * scale + "px"

    // Compute margins to adjust position.
    const top = (originalCoords.y - currentCoords.y * scale) * tileSize.y
    const left = (originalCoords.x - currentCoords.x * scale) * tileSize.x
    style.marginTop = `${-top}px`
    style.marginLeft = `${-left}px`

    // Crop (clip) image.
    // `clip` is deprecated, but browsers support for `clip-path: inset()` is far behind.
    // http://caniuse.com/#feat=css-clip-path
    style.clip = `rect(${top}px ${left + tileSize.x}px ${
      top + tileSize.y
    }px ${left}px)`

    layer.fire("tilefallback", {
      tile: tile,
      url: tile._originalSrc,
      urlMissing: tile.src,
      urlFallback: newUrl,
    })
    tile.src = newUrl
  },

  getTileUrl: function (coords: TileCoords): string {
    const z = (coords.z = coords.fallback ? coords.z : this._getZoomForUrl())

    const data = {
      r: Browser.retina ? "@2x" : "",
      s: this._getSubdomain(coords),
      x: coords.x,
      y: coords.y,
      z: z,
    }
    if (this._map && !this._map.options.crs.infinite) {
      const invertedY = this._globalTileRange.max.y - coords.y
      if (this.options.tms) {
        data["y"] = invertedY
      }
      data["-y"] = invertedY
    }

    return Util.template(this._url, extend(data, this.options))
  },

  _attachTileData: async function (
    tile: TileElement,
    tileUrl: string,
    key: string,
    done: DoneCallback
  ) {
    const data = <StoredObj>await idb.get(key, this._db)
    if (data) {
      // Cache hit, yay!
      this.cacheHits++
      tile.src = URL.createObjectURL(data.blob)
    } else {
      this.cacheMisses++
      if (this.options.useOnlyCache) {
        // Offline, not cached
        tile.onload = Util.falseFn
        tile.src = Util.emptyImageUrl
        return
      }
      // Online, not cached, fetch the tile
      let blob: Blob
      try {
        const response = await fetch(tileUrl)
        blob = await response.blob()
        tile.src = URL.createObjectURL(blob)
      } catch (error) {
        this._tileOnError(done, tile, error)
        return
      }
      if (blob) idb.set(key, { blob: blob }, this._db)
    }
  },

  _tileOnLoad: function (done: DoneCallback, tile: TileElement) {
    URL.revokeObjectURL(tile.src)
    done(null, tile)
  },
})

export default class CachedTileLayer extends TileLayer {
  cacheHits: number
  cacheMisses: number
  name?: string
  declare options: CachedTileLayerOptions
  constructor(urlTemplate: string, options?: Partial<CachedTileLayerOptions>) {
    super(urlTemplate, options)
  }
}
