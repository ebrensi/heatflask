import * as L from "leaflet"

let container, lastCalledTime

L.Control.fps = L.Control.extend({

  options: {
    position: "topright",
  },

  onAdd: function () {
    // Control container
    container = L.DomUtil.create("div", "leaflet-control-fps")
    L.DomEvent.disableClickPropagation(container)
    container.style.backgroundColor = "white"
    update(0)
    return container
  }
})

function update(now, msg) {
  const ts = now || Date.now()
  const fps = ~~(1000 / (ts - lastCalledTime) + 0.5)
  container.innerHTML = `${fps} f/s, ${msg}`
  lastCalledTime = now
  return fps
}

//constructor registration
L.control.fps = function (options) {
  return new L.Control.fps(options)
}
