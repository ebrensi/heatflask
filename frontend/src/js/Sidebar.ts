/**
 * We construct the sidebar, but don't do any data binding here
 */

/*
 * The default export of each of these modules is a function that
 * takes Model state as input and runs after the nexr redraw when the
 * content is present in the DOM
 */
import * as queryTab from "../webpages/main-page/tab.query"
import * as activitiesTab from "../webpages/main-page/tab.activities"
import * as profileTab from "../webpages/main-page/tab.profile"
import * as infoTab from "../webpages/main-page/tab.info"
import * as controlsTab from "../webpages/main-page/tab.controls"

import { control, Control, Map } from "leaflet"
import "~/node_modules/sidebar-v2/js/leaflet-sidebar"

import { nextAnimationFrame } from "./appUtil"
import { icon } from "./Icons"
import { State } from "./Model"

interface Sidebar extends Control.Sidebar {
  tabNames: string[]
  currentTab: number
  isOpen: boolean
}

type setupFunc = (appState: State) => void

/**
 * All the source data and code for a Sidebar tab
 */
type TabSource = {
  /** The HTML5 id property of the content of this tab */
  ID: string
  /** HTML tag specifying the icon of this tab  */
  ICON: string
  /** The displayed title of this tab */
  TITLE: string
  /** HTML content of this tab */
  CONTENT: string
  /** A function that binds model parameters with tab elements */
  SETUP: setupFunc
}

const tabSources: TabSource[] = [
  queryTab,
  activitiesTab,
  profileTab,
  controlsTab,
  infoTab,
]

const tabSpec: Record<TabSource["ID"], TabSource> = {}
for (const tabSource of tabSources) {
  tabSpec[tabSource.ID] = tabSource
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

export async function renderTabs(map: Map, state: State, tabIds?: string[]) {
  const tabs: string[] = []
  const contents: string[] = []
  const setupFuncs: setupFunc[] = []

  tabIds = tabIds || Object.keys(tabSpec)
  for (const ID of tabIds) {
    const { ICON, TITLE, CONTENT, SETUP } = tabSpec[ID]
    setupFuncs.push(SETUP)
    tabs.push(`<li><a href="#${ID}" role="tab">${ICON}</a></li>`)

    const header = `
      <h5 class="sidebar-header">${TITLE}
        <span class="sidebar-close">
          ${close_tab_icon}
        </span>
      </h5>
    `

    contents.push(`
      <div class="sidebar-pane" id="${ID}">
        ${header}
        ${CONTENT}
        </div>
    `)
  }

  sidebar_tablist_el.innerHTML = tabs.join("\n")
  sidebar_content_el.innerHTML = contents.join("")

  // The main sidebar UI
  // Leaflet sidebar v2
  const S = <Sidebar>control.sidebar("sidebar")
  S.tabNames = tabIds
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

  // note: these funcs may be async
  for (const func of setupFuncs) func && func(state)
}
