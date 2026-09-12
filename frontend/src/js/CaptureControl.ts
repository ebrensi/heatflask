/*
 * CaptureControl -- record the animation as an MP4.
 *
 * Three states, the same flow master's GIF button had:
 *
 *   idle      click drops a resizable box on the map
 *   selecting click records whatever is inside the box
 *   capturing click aborts
 *
 * Master gated the button on periodInSecs() <= CAPTURE_DURATION_MAX and hid it
 * entirely when the cycle ran long. That is a confusing control -- it vanishes
 * without saying why -- so instead the capture is clamped to
 * CAPTURE_DURATION_MAX and the button says when that will happen.
 */

import { Control, DomUtil, DomEvent } from "leaflet"
import { icon } from "./Icons"
import { captureVideo, saveBlob, abortCapture } from "./Capture"
import { CAPTURE_DURATION_MAX } from "./Env"
import { dotLayer } from "./DotLayerAPI"

import type { Map as LMap, LatLngBounds } from "leaflet"
import type { Selection } from "./Capture"

const RECORD_ICON = icon("video-camera")
const APPLY_ICON = icon("crop")
const STOP_ICON = icon("stop2")

type AreaSelect = {
  addTo(map: LMap): unknown
  remove(): unknown
  getBounds(): LatLngBounds
}
type MapWithAreaSelect = LMap & { areaSelect: AreaSelect }
type ControlCtor = new () => { addTo(map: LMap): unknown }

type CaptureState = "idle" | "selecting" | "capturing"

/** The area-select box, as a rectangle of the viewport in container pixels. */
function selectionRect(map: LMap, areaSelect: AreaSelect): Selection {
  const bounds = areaSelect.getBounds()
  const nw = map.latLngToContainerPoint(bounds.getNorthWest())
  const se = map.latLngToContainerPoint(bounds.getSouthEast())

  /* Clamp to the viewport. Anything outside it was never rendered, so
   * capturing it would produce a band of empty pixels. */
  const size = map.getSize()
  const x = Math.max(0, Math.round(nw.x))
  const y = Math.max(0, Math.round(nw.y))

  return {
    x,
    y,
    width: Math.min(size.x, Math.round(se.x)) - x,
    height: Math.min(size.y, Math.round(se.y)) - y,
  }
}

function filename(): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  return `heatflask-${stamp}.mp4`
}

function fileSize(bytes: number): string {
  /* A short capture of a sparse map is tens of KB, which read as "0.0 MB" */
  if (bytes < 1e6) return `${Math.round(bytes / 1e3)} KB`
  return `${(bytes / 1e6).toFixed(1)} MB`
}

export function addCaptureControl(map: LMap): void {
  const areaSelect = (<MapWithAreaSelect>map).areaSelect
  if (!areaSelect) return

  let state: CaptureState = "idle"

  /* A small readout over the map. The capture runs for a few seconds and
   * gives no other sign of life, so without this it looks like nothing
   * happened. */
  const progress = DomUtil.create("div", "capture-progress")
  progress.hidden = true
  map.getContainer().appendChild(progress)

  function showProgress(text: string): void {
    progress.textContent = text
    progress.hidden = false
  }

  const CaptureControl = Control.extend({
    options: { position: "topleft" },

    onAdd: function () {
      const container = DomUtil.create(
        "div",
        "leaflet-bar leaflet-control capture-control"
      )
      const button = <HTMLAnchorElement>DomUtil.create("a", "", container)
      button.href = "#"
      button.setAttribute("role", "button")

      const render = () => {
        if (state === "idle") {
          button.innerHTML = RECORD_ICON
          const period = dotLayer.periodInSecs()
          button.title =
            period > CAPTURE_DURATION_MAX
              ? `Record video (one cycle is ${period.toFixed(
                  1
                )}s; only the first ${CAPTURE_DURATION_MAX}s will be recorded)`
              : `Record video (${period.toFixed(1)}s loop)`
        } else if (state === "selecting") {
          button.innerHTML = APPLY_ICON
          button.title = "Record the area inside the box"
        } else {
          button.innerHTML = STOP_ICON
          button.title = "Stop recording"
        }
        button.setAttribute("aria-label", button.title)
      }

      async function run(): Promise<void> {
        const sel = selectionRect(map, areaSelect)
        areaSelect.remove()

        if (sel.width < 16 || sel.height < 16) {
          showProgress("selection is too small")
          setTimeout(() => (progress.hidden = true), 3000)
          state = "idle"
          render()
          return
        }

        state = "capturing"
        render()

        try {
          const blob = await captureVideo(map, sel, (_frac, label) =>
            showProgress(label)
          )
          if (blob) {
            const name = filename()
            saveBlob(blob, name)
            showProgress(`saved ${name} (${fileSize(blob.size)})`)
          } else {
            showProgress("capture cancelled")
          }
        } catch (e) {
          console.error(e)
          showProgress(`capture failed: ${(<Error>e).message}`)
        } finally {
          setTimeout(() => (progress.hidden = true), 4000)
          state = "idle"
          render()
        }
      }

      DomEvent.on(button, "click", (e: Event) => {
        DomEvent.stop(e)

        switch (state) {
          case "idle": {
            /* Open the box at 80% of the viewport, like master did */
            const size = map.getSize()
            const as = <AreaSelect & { _width: number; _height: number }>(
              areaSelect
            )
            as._width = ~~(0.8 * size.x)
            as._height = ~~(0.8 * size.y)
            areaSelect.addTo(map)
            state = "selecting"
            render()
            break
          }

          case "selecting":
            run()
            break

          case "capturing":
            abortCapture()
            break
        }
      })

      render()
      return container
    },
  })

  new (<ControlCtor>(<unknown>CaptureControl))().addTo(map)
}
