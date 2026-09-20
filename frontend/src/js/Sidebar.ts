/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
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
import { TEXT_SCALE_CHANGE, getTextScale } from "./TextScale"
import { State } from "./Model"

/** The event a sidebar pane gets when it is opened */
export const PANE_OPEN = "sidebar-pane-open"

/* How wide the reader last dragged the sidebar. Their choice, on their
 * machine, for their language -- so it lives beside the language choice
 * rather than in the URL, which is for what a link should carry. */
const WIDTH_KEY = "sidebarWidth"
/* Narrower than this and something spills in some language. Measured across
 * all eleven, a pane at a time: English, Spanish, French, Japanese and both
 * Chinese are clean at 270, Portuguese wants 280, Italian and Russian 290,
 * and German 320 -- the dials, whose knob is a 140px canvas drawn once and
 * so cannot give, beside "Abspielgeschwindigkeit". Re-measure if the dials
 * change size or a longer-winded language arrives. */
const MIN_WIDTH = 320

/** The floor, at whatever size the reader has set the text to. */
function minWidth(): number {
  return Math.round(MIN_WIDTH * getTextScale())
}
/** Always leave this much map showing, however hard the handle is pulled. */
const MAP_MIN = 160

function widthLimit(): number {
  return Math.max(minWidth(), window.innerWidth - MAP_MIN)
}

function applyWidth(px: number): void {
  const w = Math.round(Math.min(Math.max(px, minWidth()), widthLimit()))
  document.documentElement.style.setProperty("--sidebar-width", `${w}px`)
}

/** Drop back to the width the stylesheet picks for this screen. */
function clearWidth(): void {
  document.documentElement.style.removeProperty("--sidebar-width")
  try {
    window.localStorage.removeItem(WIDTH_KEY)
  } catch {
    /* nothing was stored */
  }
}

/**
 * A grip on the sidebar's open edge.
 *
 * No single width suits eleven languages: a German compound runs half again
 * as long as its English and Japanese rather shorter, and the info tab is
 * prose either way. The stylesheet's width is a starting point; this is the
 * last word, and it is remembered. Double-click gives the stylesheet its
 * width back.
 */
function addResizeHandle(el: HTMLElement): void {
  try {
    const saved = parseInt(window.localStorage.getItem(WIDTH_KEY), 10)
    /* Re-clamped rather than trusted: the window it was chosen in may have
     * been wider than this one. */
    if (saved > 0) applyWidth(saved)
  } catch {
    /* no stored width; the stylesheet's stands */
  }

  const handle = document.createElement("div")
  handle.className = "sidebar-resize"
  el.appendChild(handle)

  handle.addEventListener("pointerdown", (e: PointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    const startWidth = el.getBoundingClientRect().width
    handle.setPointerCapture(e.pointerId)
    handle.classList.add("dragging")
    /* Otherwise the pointer sweeping over the panes selects their text */
    document.body.style.userSelect = "none"

    const onMove = (ev: PointerEvent) =>
      applyWidth(startWidth + ev.clientX - startX)

    const onUp = () => {
      handle.removeEventListener("pointermove", onMove)
      handle.removeEventListener("pointerup", onUp)
      handle.removeEventListener("pointercancel", onUp)
      handle.classList.remove("dragging")
      document.body.style.userSelect = ""
      try {
        window.localStorage.setItem(WIDTH_KEY, String(el.offsetWidth))
      } catch {
        /* applied for this session, just not remembered */
      }
    }

    /* On the captured element, so a pointer that leaves the window still
     * reports its moves and its release */
    handle.addEventListener("pointermove", onMove)
    handle.addEventListener("pointerup", onUp)
    handle.addEventListener("pointercancel", onUp)
  })

  handle.addEventListener("dblclick", (e) => {
    e.preventDefault()
    clearWidth()
  })

  /* A width chosen on a wider window would otherwise leave no map on this
   * one; bigger text can likewise outgrow a width chosen for smaller. */
  const reclamp = () => applyWidth(el.getBoundingClientRect().width)
  window.addEventListener("resize", reclamp)
  document.addEventListener(TEXT_SCALE_CHANGE, reclamp)
}

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

  const sidebar_el = document.getElementById("sidebar")
  const S = new Sidebar(sidebar_el)
  S.tabNames = tabIds
  addResizeHandle(sidebar_el)

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
