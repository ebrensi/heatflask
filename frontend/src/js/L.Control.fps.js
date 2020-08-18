import * as L from "leaflet";

L.Control.fps = L.Control.extend({
  lastCalledTime: 1,

  options: {
    position: "topright",
  },

  onAdd: function () {
    // Control container
    this._container = L.DomUtil.create("div", "leaflet-control-fps");
    L.DomEvent.disableClickPropagation(this._container);
    this._container.style.backgroundColor = "white";
    this.update(0);
    return this._container;
  },

  update: function (now = Date.now(), msg = "") {
    let fps = ~~(1000 / (now - this.lastCalledTime) + 0.5);
    this._container.innerHTML = `${fps} f/s, ${msg}`;
    this.lastCalledTime = now;
    return fps;
  },
});

//constructor registration
L.control.fps = function (options) {
  return new L.Control.fps(options);
};
