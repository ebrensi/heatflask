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

import type { Map as MLMap } from "maplibre-gl"

import { nextAnimationFrame } from "./appUtil"
import { icon } from "./Icons"
import { State } from "./Model"

/** The event a sidebar pane gets when it is opened */
export const PANE_OPEN = "sidebar-pane-open"

/**
 * sidebar-v2's behaviour without its Leaflet control: the markup and the
 * stylesheet are the same, and all it ever did was move .active and
 * .collapsed classes around.
 */
class Sidebar {
  tabNames: string[] = []
  currentTab = 0
  isOpen = false

  constructor(private el: HTMLElement) {
    el.classList.add("sidebar-left")
    for (const a of Array.from(
      el.querySelectorAll<HTMLAnchorElement>(".sidebar-tabs > ul > li > a")
    )) {
      a.addEventListener("click", (e) => {
        e.preventDefault()
        const li = a.parentElement
        if (li.classList.contains("active")) this.close()
        else if (!li.classList.contains("disabled")) this.open(a.hash.slice(1))
      })
    }
    for (const btn of Array.from(el.querySelectorAll(".sidebar-close"))) {
      btn.addEventListener("click", () => this.close())
    }
  }

  open(id: string): void {
    for (const pane of Array.from(this.el.querySelectorAll(".sidebar-pane"))) {
      pane.classList.toggle("active", pane.id === id)
    }
    for (const a of Array.from(
      this.el.querySelectorAll<HTMLAnchorElement>(".sidebar-tabs > ul > li > a")
    )) {
      a.parentElement.classList.toggle("active", a.hash === `#${id}`)
    }
    const i = this.tabNames.indexOf(id)
    if (i >= 0) this.currentTab = i
    this.el.classList.remove("collapsed")
    this.isOpen = true

    // for panes that need to do something once they are visible
    document.getElementById(id)?.dispatchEvent(new Event(PANE_OPEN))
  }

  close(): void {
    for (const li of Array.from(
      this.el.querySelectorAll(".sidebar-tabs > ul > li.active")
    )) {
      li.classList.remove("active")
    }
    this.el.classList.add("collapsed")
    this.isOpen = false
  }
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

export async function renderTabs(map: MLMap, state: State, tabIds?: string[]) {
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

  const S = new Sidebar(document.getElementById("sidebar"))
  S.tabNames = tabIds

  document.addEventListener("keydown", (e) => {
    const key = e.key || e.keyCode
    if (S.isOpen) {
      switch (key) {
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
      switch (key) {
        case SPACE_KEY:
          S.open(S.tabNames[S.currentTab])
          break
      }
    }
  })

  map.on("click", () => S.isOpen && S.close())

  await nextAnimationFrame()

  const promises = [] as Promise<unknown>[]
  for (const func of setupFuncs) {
    func && promises.push(Promise.resolve(func(state)))
  }
  await Promise.all(promises)
}
