import { map } from "./mapAPI"
import { dotLayer } from "./DotLayer/DotLayer"

import "leaflet-areaselect"
import "../ext/leaflet-areaselect.css"
import "../../node_modules/leaflet-easybutton/src/easy-button.d"
import "../../node_modules/leaflet-easybutton/src/easy-button.css"

const L = window.L

const areaSelect = L.areaSelect({ width: 200, height: 200 })

const capture_button_states = [
  {
    stateName: "idle",
    icon: "fa-video",
    title: "Capture GIF",
    onClick: function (btn) {
      let size = map.getSize()
      areaSelect._width = ~~(0.8 * size.x)
      areaSelect._height = ~~(0.8 * size.y)
      areaSelect.addTo(map)
      btn.state("selecting")
    },
  },
  {
    stateName: "selecting",
    icon: "fa-expand",
    title: "Select Capture Region",
    onClick: function (btn) {
      let size = map.getSize(),
        w = areaSelect._width,
        h = areaSelect._height,
        topLeft = {
          x: Math.round((size.x - w) / 2),
          y: Math.round((size.y - h) / 2),
        },
        selection = {
          topLeft: topLeft,
          width: w,
          height: h,
        }

      let center = areaSelect.getBounds().getCenter(),
        zoom = map.getZoom()
      console.log(`center: `, center)
      console.log(`width = ${w}, height = ${h}, zoom = ${zoom}`)

      dotLayer.captureCycle(selection, function () {
        btn.state("idle")
        areaSelect.remove()
        if (!ADMIN && !OFFLINE) {
          // Record this to google analytics
          let cycleDuration = Math.round(dotLayer.periodInSecs() * 1000)
          try {
            ga("send", "event", {
              eventCategory: USER_ID,
              eventAction: "Capture-GIF",
              eventValue: cycleDuration,
            })
          } catch (err) {
            //
          }
        }
      })

      btn.state("capturing")
    },
  },
  {
    stateName: "capturing",
    icon: "fa-stop-circle",
    title: "Cancel Capture",
    onClick: function (btn) {
      if (dotLayer._capturing) {
        dotLayer.abortCapture()
        areaSelect.remove()
        btn.state("idle")
      }
    },
  },
]

// Capture control button
const captureControl = L.easyButton({
  states: capture_button_states,
})

captureControl.enabled = false

function updateCaptureStatus() {
  // Enable capture if period is less than CAPTURE_DURATION_MAX
  const cycleDuration = dotLayer.periodInSecs().toFixed(2),
    captureEnabled = captureControl.enabled

  if (cycleDuration <= CAPTURE_DURATION_MAX) {
    if (!captureEnabled) {
      captureControl.addTo(map)
      captureControl.enabled = true
    }
  } else if (captureEnabled) {
    captureControl.removeFrom(map)
    captureControl.enabled = false
  }
}
