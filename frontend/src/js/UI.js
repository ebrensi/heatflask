/*
 *  UI.js -- the front-end user interface for heatflask.
 *  Here we initialize the DOM/user interface
 */

// import "leaflet-easybutton";

import { AUTHORIZE_URL } from "./Init.js"

import app from "./Model.js"
import "./URL.js"

// import { map } from "./MapAPI.js";
// import { dotLayer } from "./DotLayerAPI.js";
// import "./DotControls.js";

import paypalButtonHTML from "bundle-text:../html/paypal-button.html"
import infoTabHTML from "bundle-text:../html/main-info.html"

import { makeQuery, abortQuery } from "./DataImport.js"
import * as dataTable from "./Table.js"

/* TODO: have two UI submodules: UI-simple.js (single) and
                                 UI-complex.js (multi-user)

    one of which to be dynamically imported depending on the data query.

  right now we are only doing the single target-user UI.
*/

let dotLayer

// pause animation when window/tab is not visible
document.onvisibilitychange = function (e) {
  if (!dotLayer) return
  const paused = app.vParams.paused
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
app.currentUser.onChange("public", async (status) => {
  const resp = await fetch(`${app.currentUser.url.public}?status=${status}`)
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
      app.qParams.quantity = event.target.value
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
  console.log(`${app.currentUser.id} logging out`)
  window.location.href = app.currentUser.url.logout
}

function deleteAccount() {
  window.location.href = app.currentUser.url.delete
}

function viewIndex() {
  window.open(app.currentUser.url.index)
}

function abortRender() {
  abortQuery()
}

/*
 * Bind data-actions
 */
const userActions = {
  "selection-clear": null,
  "selection-render": null,
  query: renderFromQuery,
  "abort-query": abortRender,
  login: login,
  logout: logout,
  delete: deleteAccount,
  "view-index": viewIndex,
}

const doAction = (event) => {
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
  const query = { streams: true },
    qParams = app.qParams

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

  const to_exclude = Object.keys(app.items).map(Number)
  if (to_exclude.length) query["exclude_ids"] = to_exclude

  return query
}

function renderFromQuery() {
  const query = {
    [app.qParams.userid]: getCurrentQuery(),
  }
  console.log(`making query: ${JSON.stringify(query)}`)

  makeQuery(query, () => {
    app.flags.importing = false

    console.log("done")
  })
}

if (app.qParams.userid) {
  renderFromQuery()
}

/* Table Stuff */
dataTable.events.addListener("selection", (e) => {
  // console.log("table selections ", e)
})

// /*
//  *  Set up or tear down current user stuff
//  */
// Dom.addEvent("#zoom-to-selection", "change", function(){
//     if ( Dom.prop("#zoom-to-selection", 'checked') ) {
//         zoomToSelectedPaths();
//     }
// });

// Dom.addEvent("#render-selection-button", "click", openSelected);
// Dom.addEvent("#clear-selection-button", "click", deselectAll);
