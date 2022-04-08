/**
 * We construct the sidebar, but don't do any data binding here
 */

// Tab Content
import query_html from "bundle-text:../webpages/main-page/tab.query.html"
import actvities_html from "bundle-text:../webpages/main-page/tab.activities.html"
import profile_html from "bundle-text:../webpages/main-page/tab.profile.html"
import controls_html from "bundle-text:../webpages/main-page/tab.controls.html"
import info_html from "bundle-text:../webpages/main-page/tab.info.html"

/*
 * The default export of each of these modules is a function that
 * takes Model state as input and runs after the nexr redraw when the
 * content is present in the DOM
 */
import queryTabSetup from "../webpages/main-page/tab.query"
import activitiesTabSetup from "../webpages/main-page/tab.activities"
import profileTabSetup from "../webpages/main-page/tab.profile"
import infoTabSetup from "../webpages/main-page/tab.info"
import controlsTabSetup from "../webpages/main-page/tab.controls"

import { control, Control, Map } from "leaflet"
import "~/node_modules/sidebar-v2/js/leaflet-sidebar"

import { nextAnimationFrame } from "./appUtil"
import { icon } from "./Icons"
import { State } from "./Model"

interface mySidebar extends Control.Sidebar {
  tabNames: string[]
  currentTab: number
  isOpen: boolean
}

const query_header = `
  <a href="#"
   data-bind="strava-url"
   data-prop="href"
   data-class="target-user"
   target="_blank"
  >
  <button
    class="avatar"
    data-class="target-user"
    data-bind="avatar"
    data-attr="data-url"
    ></button
  ></a>

  <span
    data-bind="username"
    data-prop="innerText"
    data-class="target-user"
    >$TARGET_USER</span
  >'s map
`
const profile_header = `
  <a href="#"
    target="_blank"
    data-bind="strava-url"
    data-prop="href"
    data-class="current-user"
  >
  <button
    class="avatar"
    data-class="target-user"
    data-bind="avatar"
    data-attr="data-url"
  ></button
  ></a>

  <span
    data-bind="username"
    data-prop="innerText"
    data-class="current-user"
  ></span>
`

const tabSpec: Record<string, [string, string, string, (s: State) => void]> = {
  query: [icon("bars"), query_header, query_html, queryTabSetup],
  activities: [
    icon("list2"),
    "Rendered Activities",
    actvities_html,
    activitiesTabSetup,
  ],
  profile: [
    icon("user-circle-o"),
    profile_header,
    profile_html,
    profileTabSetup,
  ],
  controls: [
    icon("equalizer"),
    "Layer Settings",
    controls_html,
    controlsTabSetup,
  ],
  info: [icon("info"), "Info", info_html, infoTabSetup],
}

const sidebar_tablist_el = document.querySelector(".sidebar-tabs > ul")
const sidebar_content_el = document.querySelector(".sidebar-content")

const close_tab_icon = icon("caret-left")

const ESC_KEY = 27
const SPACE_KEY = 32
const UP_ARROW_KEY = 40
const DOWN_ARROW_KEY = 38
const RIGHT_ARROW_KEY = 39
const LEFT_ARROW_KEY = 37

export async function renderTabs(map: Map, state: State, tabNames?: string[]) {
  const tabs = []
  const contents = []
  const setupFuncs = []

  tabNames = tabNames || Object.keys(tabSpec)
  for (const name of tabNames) {
    const [ico, title, content, setupFunc] = tabSpec[name]

    setupFuncs.push(setupFunc)

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
  const S = <mySidebar>control.sidebar("sidebar")
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

  await nextAnimationFrame()
  for (const func of setupFuncs) func && func(state)
}
