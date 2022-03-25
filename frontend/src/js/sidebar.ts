// Tab Content
import query_html from "bundle-text:../webpages/main-page/tab.query.html"
import actvities_html from "bundle-text:../webpages/main-page/tab.activities.html"
import profile_html from "bundle-text:../webpages/main-page/tab.profile.html"
import controls_html from "bundle-text:../webpages/main-page/tab.controls.html"

import info_html from "bundle-text:../webpages/main-page/tab.info.html"
import "../webpages/main-page/tab.info"

// Code
import "npm:sidebar-v2/js/leaflet-sidebar"
import { control } from "./myLeaflet"
import { icon } from "./Icons"
import { Map } from "./myLeaflet"

const tabSpec = {
  query: [icon("bars"), "${TARGET_USER}'s map", query_html],
  activities: [icon("list2"), "Rendered Activities", actvities_html],
  profile: [icon("user-circle-o"), "${CURRENT_USER}'s profile", profile_html],
  controls: [icon("equalizer"), "Layer Settings", controls_html],
  info: [icon("info"), "Info", info_html],
}

const sidebar_tablist_el = document.querySelector(".sidebar-tabs > ul")
const sidebar_content_el = document.querySelector(".sidebar-content")

const close_tab_icon = icon("caret-left")

const ESC_KEY = 27
const SPACE_KEY = 32
const UP_ARROW_KEY = 40
const DOWN_ARROW_KEY = 38

export function renderTabs(map: Map, tabNames?: string[]) {
  const tabs = []
  const contents = []
  tabNames = tabNames || Object.keys(tabSpec)
  for (const name of tabNames) {
    const [ico, title, content] = tabSpec[name]
    tabs.push(`<li><a href="#${name}" role="tab">${ico}</a></li>`)

    const header = `
      <h1 class="sidebar-header">${title}
        <span class="sidebar-close">
          ${close_tab_icon}
        </span>
      </h1>
    `

    contents.push(`
      <div class="sidebar-pane" id="${name}">
        ${header}
        ${content}
        </div>
    `)
  }

  sidebar_tablist_el.innerHTML = tabs.join("\n")
  sidebar_content_el.innerHTML = contents.join("")

  // The main sidebar UI
  // Leaflet sidebar v2
  const S = control.sidebar("sidebar")
  S.tabNames = tabNames
  S.currentTab = 0

  /* key and mouse bindings to the map to control the sidebar */
  S.addEventListener("opening", () => (S.isOpen = true))
  S.addEventListener("closing", () => (S.isOpen = false))
  S.isOpen = false

  document.addEventListener("keydown", (e) => {
    if (S.isOpen) {
      switch (e.keyCode) {
        case ESC_KEY:
        case SPACE_KEY:
          S.close()
          break
        case UP_ARROW_KEY:
          S.currentTab = (S.currentTab + 1) % S.tabNames.length
          S.open(S.tabNames[S.currentTab])
          break
        case DOWN_ARROW_KEY:
          S.currentTab--
          if (S.currentTab < 0) S.currentTab = S.tabNames.length - 1
          S.open(S.tabNames[S.currentTab])
          break
      }
    } else {
      switch (e.keyCode) {
        case SPACE_KEY:
          S.open(S.tabNames[S.currentTab])
          break
      }
    }
  })

  S.addTo(map)
  map.addEventListener("click", () => S.isOpen && S.close())
  return S
}

// import pureknob from "pure-knob"
// const knob = pureknob.createKnob(300, 300)
// // Create element node.
// const node = knob.node()

// // Add it to the DOM.
// const elem = document.getElementById("knob")
// elem.appendChild(node)
