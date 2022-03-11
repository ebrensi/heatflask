/*
 *  UI.js -- the front-end user interface for heatflask.
 *  Here we initialize the DOM/user interface
 */

import { AUTHORIZE_URL } from "./Env"

import { targetUser, currentUser, vParams, qParams, flags } from "./Model"
/* URL.ts import must be here because it requires MapAPI which requires
 *  ActivityCollection, which requires URL.  If we import MapAPI first
 *  then it will end up requiring itself.
 */
import "./URL"
import { map } from "./MapAPI"

import * as ActivityCollection from "./DotLayer/ActivityCollection"

import { dotLayer } from "./DotLayerAPI"
// import { captureCycle, abortCapture } from "./DotLayer/Export"

import "./DotControls"
import "./Control.pathSelect"

import paypalButtonHTML from "bundle-text:../html/paypal-button.html"
import infoTabHTML from "bundle-text:../html/main-info.html"

import { makeQuery, abortQuery } from "./DataImport"
import * as table from "./Table"
import { queueTask } from "./appUtil"
import { getUrlString } from "./URL"

// pause animation when window/tab is not visible
document.onvisibilitychange = function (e) {
  if (!dotLayer) return
  const paused = vParams.paused
  if (e.target.hidden && !paused) {
    dotLayer.pause()
  } else if (!paused) {
    dotLayer.animate()
  }
}

document.querySelector("#info-tab").innerHTML = infoTabHTML

document.querySelectorAll(".paypal-button").forEach((el) => {
  el.innerHTML = paypalButtonHTML
})

/*
 * Set a listener to change user's account to public or private
 *  if they change that setting
 */
currentUser.onChange("public", async (status) => {
  const resp = await fetch(`${currentUser.url.public}?status=${status}`)
  const response = await resp.text()
  console.log(`response: ${response}`)
})

/*
 * If the user hits enter in tbe number field, make the query
 */
document
  .querySelector("[data-bind=quantity]")
  .addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      qParams.quantity = event.target.value
      renderFromQuery()
    }
  })

/*
 * Define button actions
 */
function login() {
  window.location.href = AUTHORIZE_URL
}

function logout() {
  console.log(`${currentUser.id} logging out`)
  window.location.href = currentUser.url.logout
}

function deleteAccount() {
  window.location.href = currentUser.url.delete
}

function viewIndex() {
  window.open(currentUser.url.index)
}

function abortRender() {
  abortQuery()
}

/*
 * Bind data-actions
 */
const userActions = {
  "selection-clear": table.clearSelections,
  "selection-render": openSelected,
  query: renderFromQuery,
  "abort-query": abortRender,
  login: login,
  logout: logout,
  delete: deleteAccount,
  "view-index": viewIndex,
}

function doAction(event) {
  const name = event.target.dataset.action,
    action = userActions[name]
  console.log(name)
  action && action()
}

for (const el of document.querySelectorAll("[data-action]")) {
  el.addEventListener("click", doAction)
}

/*
 *  Construct a query for activity data from our qParams
 */
function getCurrentQuery() {
  const query = { streams: true }

  switch (qParams.queryType) {
    case "activities":
      query.limit = +qParams.quantity
      break

    case "days": {
      // debugger;
      const today = new Date(),
        before = new Date(),
        after = new Date(),
        n = +qParams.quantity
      before.setDate(today.getDate() + 1) // tomorrow
      after.setDate(today.getDate() - n) // n days ago

      query.before = before.toISOString().split("T")[0]
      query.after = after.toISOString().split("T")[0]

      break
    }

    case "ids":
      if (!qParams.ids) return
      else {
        const idSet = new Set(qParams.ids.split(/\D/).map(Number))
        idSet.delete(0)
        // create an array of ids (numbers) from a string
        query.activity_ids = Array.from(idSet)
      }
      break

    case "dates":
      if (qParams.before) query.before = qParams.before
      if (qParams.after) query.after = qParams.after
      break

    case "key":
      query.key = qParams.key
  }

  const to_exclude = Object.keys(items).map(Number)
  if (to_exclude.length) query["exclude_ids"] = to_exclude

  return query
}

function renderFromQuery() {
  const query = {
    [qParams.userid]: getCurrentQuery(),
  }
  // console.log(`making query: ${JSON.stringify(query)}`)

  makeQuery(query, () => {
    flags.importing = false
    const num = items.size
    const msg = `done! ${num} activities imported`
    document.querySelectorAll(".info-message").forEach((el) => {
      el.innerHTML = msg
    })
    updateLayers()
  })
}

export function openSelected(): void {
  const ids = Array.from(items.values())
    .filter((A) => A.selected)
    .map((A) => A.id)

  if (ids.length) {
    const argString = getUrlString({ id: ids.join("+") })
    const url = targetUser.id + argString
    window.open(url, "_blank")
  }
}

/* Rendering */
async function updateLayers(): Promise<void> {
  if (vParams.autozoom) {
    const totalBounds = await ActivityCollection.getLatLngBounds()

    if (totalBounds.isValid()) {
      map.fitBounds(totalBounds)
    }
  }

  // if (!ADMIN && !OFFLINE) {
  //   // Record this to google analytics
  //   try {
  //     ga("send", "event", {
  //       eventCategory: USER_ID,
  //       eventAction: "Render",
  //       eventValue: num,
  //     });
  //   } catch (err) {}
  // }

  dotLayer.reset()
  table.update()
}

// Make initial query if there is one
if (qParams.userid) {
  queueTask(renderFromQuery)
}
