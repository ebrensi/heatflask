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
import { applyTranslations } from "./i18n"
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

/**
 * Is this key meant for something other than the sidebar? Any key typed into
 * a field, space on a focused button (which presses it), and arrows on the
 * focused map (which pans with them) all have their own use. A focused link,
 * as a sidebar tab is after it's clicked, has none for these keys.
 */
function keyBelongsElsewhere(e: KeyboardEvent): boolean {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return true
  const el = e.target
  if (!(el instanceof HTMLElement)) return false
  if (el.isContentEditable || el.closest("input, textarea, select")) return true
  if (e.key === " ") return !!el.closest("button, [role=button], summary")
  if (e.key.startsWith("Arrow"))
    return !!el.closest(".maplibregl-canvas-container")
  return false
}

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

  /* Before the SETUP functions below, which look elements up by id: a
   * translated string can carry its own <a id="..."> so that the link falls
   * where the sentence needs it, and that replaces what was there. */
  applyTranslations(sidebar_tablist_el)
  applyTranslations(sidebar_content_el)

  const S = new Sidebar(document.getElementById("sidebar"))
  S.tabNames = tabIds

  /*
   *   space        open or close the sidebar, on the tab last shown
   *   escape       close it
   *   down / up    while open, the next / previous tab, wrapping around
   */
  document.addEventListener("keydown", (e) => {
    if (keyBelongsElsewhere(e)) return
    const n = S.tabNames.length

    switch (e.key) {
      case " ":
        if (S.isOpen) S.close()
        else S.open(S.tabNames[S.currentTab])
        break
      case "Escape":
        if (!S.isOpen) return
        S.close()
        break
      case "ArrowDown":
      case "ArrowUp":
        if (!S.isOpen) return
        S.currentTab = (S.currentTab + (e.key === "ArrowDown" ? 1 : n - 1)) % n
        S.open(S.tabNames[S.currentTab])
        break
      default:
        return
    }
    // a handled key shouldn't also scroll the page or the pane
    e.preventDefault()
  })

  map.on("click", () => S.isOpen && S.close())

  await nextAnimationFrame()

  const promises = [] as Promise<unknown>[]
  for (const func of setupFuncs) {
    func && promises.push(Promise.resolve(func(state)))
  }
  await Promise.all(promises)
}
