/*
 * L.Handler.BoxHook is used to add kepress-drag-box interaction to the map
 * (call a callback with selected bounding box)
 *  Based on Leaflet's native BoxZoom
 *
 * enable by adding it to your map's handler:
 *
 *      map.addInitHook('addHandler', 'BoxHook', BoxHook);
 */

var BoxHook = L.Handler.extend({
  initialize: function (map) {
    this._map = map;
    this._container = map._container;
    this._pane = map._panes.overlayPane;
    this._resetStateTimeout = 0;
    map.on("unload", this._destroy, this);
  },

  addHooks: function () {
    L.DomEvent.on(this._container, "mousedown", this._onMouseDown, this);
  },

  removeHooks: function () {
    L.DomEvent.off(this._container, "mousedown", this._onMouseDown, this);
  },

  moved: function () {
    return this._moved;
  },

  _destroy: function () {
    L.DomUtil.remove(this._pane);
    delete this._pane;
  },

  _resetState: function () {
    this._resetStateTimeout = 0;
    this._moved = false;
  },

  _clearDeferredResetState: function () {
    if (this._resetStateTimeout !== 0) {
      clearTimeout(this._resetStateTimeout);
      this._resetStateTimeout = 0;
    }
  },

  _onMouseDown: function (e) {
    if (!e.ctrlKey || (e.which !== 1 && e.button !== 1)) {
      return false;
    }

    // Clear the deferred resetState if it hasn't executed yet, otherwise it
    // will interrupt the interaction and orphan a box element in the container.
    this._clearDeferredResetState();
    this._resetState();

    L.DomUtil.disableTextSelection();
    L.DomUtil.disableImageDrag();

    this._map.dragging.disable();
    this._map.touchZoom.disable();
    this._map.doubleClickZoom.disable();
    this._map.scrollWheelZoom.disable();

    this._startPoint = this._map.mouseEventToContainerPoint(e);

    L.DomEvent.on(
      document,
      {
        contextmenu: L.DomEvent.stop,
        mousemove: this._onMouseMove,
        mouseup: this._onMouseUp,
        keydown: this._onKeyDown,
      },
      this
    );
  },

  _onMouseMove: function (e) {
    if (!this._moved) {
      this._moved = true;

      this._box = L.DomUtil.create("div", "leaflet-zoom-box", this._container);
      L.DomUtil.addClass(this._container, "leaflet-crosshair");

      this._map.fire("boxhookstart");
    }

    this._point = this._map.mouseEventToContainerPoint(e);

    var bounds = new L.Bounds(this._point, this._startPoint),
      size = bounds.getSize();

    L.DomUtil.setPosition(this._box, bounds.min);

    this._box.style.width = size.x + "px";
    this._box.style.height = size.y + "px";
  },

  _finish: function () {
    if (this._moved) {
      L.DomUtil.remove(this._box);
      L.DomUtil.removeClass(this._container, "leaflet-crosshair");
    }

    L.DomUtil.enableTextSelection();
    L.DomUtil.enableImageDrag();

    this._map.dragging.enable();
    this._map.touchZoom.enable();
    this._map.doubleClickZoom.enable();
    this._map.scrollWheelZoom.enable();

    L.DomEvent.off(
      document,
      {
        contextmenu: L.DomEvent.stop,
        mousemove: this._onMouseMove,
        mouseup: this._onMouseUp,
        keydown: this._onKeyDown,
      },
      this
    );
  },

  _onMouseUp: function (e) {
    if (e.which !== 1 && e.button !== 1) {
      return;
    }

    this._finish();

    if (!this._moved) {
      return;
    }
    // Postpone to next JS tick so internal click event handling
    // still see it as "moved".
    this._clearDeferredResetState();
    this._resetStateTimeout = setTimeout(
      L.Util.bind(this._resetState, this),
      0
    );

    var llBounds = new L.LatLngBounds(
        this._map.containerPointToLatLng(this._startPoint),
        this._map.containerPointToLatLng(this._point)
      ),
      pxBounds = new L.Bounds(this._startPoint, this._point);

    this._map
      // .fitBounds(bounds)
      .fire("boxhookend", { latLngBounds: llBounds, pxBounds: pxBounds });
  },

  _onKeyDown: function (e) {
    if (e.keyCode === 27) {
      this._finish();
    }
  },
});

L.Map.mergeOptions({
  // @option boxHook: Boolean = true
  // Whether a custom function can be called with rectangular area specified by
  // dragging the mouse while pressing the shift key.
  boxHook: true,
});

// @section Handlers
// @property boxHook: Handler
// Box (ctrl-drag with mouse) select handler.
L.Map.addInitHook("addHandler", "boxHook", BoxHook);
