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

import { icon } from "./Icons"
import { captureVideo, saveBlob, abortCapture } from "./Capture"
import { CAPTURE_DURATION_MAX, OFFLINE, SPONSOR_URL } from "./Env"
import { dotLayer } from "./DotLayerAPI"
import { ButtonControl } from "./MapControls"
import { AreaSelect } from "./AreaSelect"

import type { Map as MLMap } from "maplibre-gl"

const RECORD_ICON = icon("video-camera")
const APPLY_ICON = icon("crop")
const STOP_ICON = icon("stop2")

type CaptureState = "idle" | "selecting" | "capturing"

function filename(): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")
  return `heatflask-${stamp}.mp4`
}

function fileSize(bytes: number): string {
  /* A short capture of a sparse map is tens of KB, which read as "0.0 MB" */
  if (bytes < 1e6) return `${Math.round(bytes / 1e3)} KB`
  return `${(bytes / 1e6).toFixed(1)} MB`
}

export function addCaptureControl(map: MLMap): void {
  let state: CaptureState = "idle"
  let areaSelect: AreaSelect | undefined

  /* A small readout over the map. The capture runs for a few seconds and
   * gives no other sign of life, so without this it looks like nothing
   * happened. */
  const progress = document.createElement("div")
  progress.className = "capture-progress"
  progress.hidden = true
  map.getContainer().appendChild(progress)

  let hideTimer = 0

  function showProgress(text: string): void {
    clearTimeout(hideTimer)
    progress.textContent = text
    progress.hidden = false
  }

  /* One timer, so a message that replaced an earlier one is not hidden on the
   * earlier one's schedule. */
  function hideProgress(afterMs: number): void {
    clearTimeout(hideTimer)
    hideTimer = window.setTimeout(() => (progress.hidden = true), afterMs)
  }

  function showSaved(text: string): void {
    showProgress(text)
  }

  const control = new ButtonControl("capture-control", onClick)

  const render = () => {
    if (state === "idle") {
      const period = dotLayer.periodInSecs()
      control.set(
        RECORD_ICON,
        period > CAPTURE_DURATION_MAX
          ? `Record video (one cycle is ${period.toFixed(
              1
            )}s; only the first ${CAPTURE_DURATION_MAX}s will be recorded)`
          : `Record video (${period.toFixed(1)}s loop)`
      )
    } else if (state === "selecting") {
      control.set(APPLY_ICON, "Record the area inside the box")
    } else {
      control.set(STOP_ICON, "Stop recording")
    }
  }

  async function run(): Promise<void> {
    const sel = areaSelect.getRect()
    areaSelect.remove()
    areaSelect = undefined

    if (sel.width < 16 || sel.height < 16) {
      showProgress("selection is too small")
      hideProgress(3000)
      state = "idle"
      render()
      return
    }

    state = "capturing"
    render()
    let hideAfter = 4000

    try {
      const blob = await captureVideo(map, sel, (_frac, label) =>
        showProgress(label)
      )
      if (blob) {
        const name = filename()
        saveBlob(blob, name)
        showSaved(`saved ${name} (${fileSize(blob.size)})`)
        if (!OFFLINE) hideAfter = 12000
      } else {
        showProgress("capture cancelled")
      }
    } catch (e) {
      console.error(e)
      showProgress(`capture failed: ${(<Error>e).message}`)
    } finally {
      hideProgress(hideAfter)
      state = "idle"
      render()
    }
  }

  function onClick(): void {
    switch (state) {
      case "idle":
        /* Open the box at 80% of the viewport, like master did */
        areaSelect = new AreaSelect(map.getContainer(), 0.8)
        state = "selecting"
        render()
        break

      case "selecting":
        run()
        break

      case "capturing":
        abortCapture()
        break
    }
  }

  render()
  map.addControl(control, "top-left")
}
