/* fps display control for leaflet*/
/* Efrem Rensi 2017/2/19 */

L.Control.fps = L.Control.extend({
    lastCalledTime: 1,

    options: {
        position: "topright"
    },

    onAdd: function (map) {
        // Control container
        this._container = L.DomUtil.create('div', 'leaflet-control-fps');
        L.DomEvent.disableClickPropagation(this._container);
        this.update(0);
        return this._container;
    },

    update: function(now=Date.now()) {
        let fps = 500 / (now - this.lastCalledTime);
        this._container.innerHTML = "FPS: " + 2 * Math.floor(fps);
        this.lastCalledTime = now;
        return fps
  }
});

//constructor registration
L.control.fps = function(options) {
  return new L.Control.fps();
};
