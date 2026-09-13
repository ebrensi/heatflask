/*
 * Render -- run an activity query and put the result on the map.
 *
 * This lives outside UI.ts so that the query tab can trigger a render without
 * creating an import cycle (UI -> Sidebar -> tab.query -> UI).
 */

import * as ActivityCollection from "./DotLayer/ActivityCollection"
import * as Table from "./Table"
import * as ImportProgress from "./ImportProgress"
import { dotLayer } from "./DotLayerAPI"
import { qToQ, makeActivityQuery } from "./DataImport"
import { URLS } from "./Env"

import type { Map as LMap } from "leaflet"
import type { State } from "./Model"
import type { ImportedActivity } from "./DataImport"

let _map: LMap
let _state: State

export function initRender(map: LMap, appState: State): void {
  _map = map
  _state = appState
}

/** Write to every .info-message element the sidebar puts in the DOM */
function message(msg: string): void {
  for (const el of Array.from(document.querySelectorAll(".info-message"))) {
    el.innerHTML = msg
  }
}

/**
 * Run the current query, replace the activity set with the result, and
 * redraw. Returns how many activities were rendered.
 */
export async function renderFromQuery(): Promise<number> {
  if (!_state) throw new Error("initRender() has not been called")
  const { query, visual } = _state

  const backendQuery = qToQ(query, true)
  if (!backendQuery) {
    message("nothing to query")
    return 0
  }

  message("importing…")
  ImportProgress.start()

  /* Collect first, swap at the end. Clearing up front emptied the map for the
   * whole network round-trip, so the dots visibly vanished while the new set
   * loaded. */
  const incoming: ImportedActivity[] = []
  /* How many the backend says are coming, so the progress bar can be a real
   * bar rather than an indeterminate one. */
  let expected: number | undefined

  try {
    for await (const obj of makeActivityQuery(backendQuery, URLS.query)) {
      if (!obj) continue

      if ("_id" in obj) {
        incoming.push(<ImportedActivity>(<unknown>obj))
        ImportProgress.progress(incoming.length, expected)
      } else {
        /* Status messages from the backend: {msg} while it builds the index,
         * {count} before the activities start, plus {info}, {delete} and
         * per-activity {error} entries. */
        const status = <{ msg?: string; count?: number }>obj
        if (typeof status.count === "number") {
          expected = status.count
          ImportProgress.progress(incoming.length, expected)
        } else if (status.msg) {
          ImportProgress.message(status.msg)
        } else {
          console.log(obj)
        }
      }
    }
  } catch (e) {
    ImportProgress.finish("import failed")
    throw e
  }

  const count = incoming.length
  if (!count) {
    ImportProgress.finish("no activities")
    message("no activities")
    console.warn("query returned no activities")
    return 0
  }

  ImportProgress.finish(`${count} activities`)

  ActivityCollection.clear()
  for (const activity of incoming) ActivityCollection.add(activity)

  message(`${count} activities`)

  /* reset() packs the streams, builds the per-zoom index sets, draws, and
   * starts the animation. */
  await dotLayer.reset()

  /* After reset, not before: ActivityCollection.setDotColors() runs inside it,
   * so until it has, every Activity.colors.dot is still null and the table's
   * colour swatches come out blank. */
  Table.update()

  if (visual.autozoom) {
    const bounds = await ActivityCollection.getLatLngBounds()
    if (bounds && bounds.isValid()) _map.fitBounds(bounds)
  }

  return count
}
