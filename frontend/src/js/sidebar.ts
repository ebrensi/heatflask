// CSS
import "npm:sidebar-v2/css/leaflet-sidebar.css"
import "../css/leaflet-sidebar-v2-mods.css"

// HTML
import { icon } from "./Icons"

import query_html from "bundle-text:../html/main-tabs/query.html"
import actvities_html from "bundle-text:../html/main-tabs/activities.html"
import profile_html from "bundle-text:../html/main-tabs/profile.html"
import controls_html from "bundle-text:../html/main-tabs/controls.html"
import info_html from "bundle-text:../html/main-tabs/info.html"

// Code
import "npm:sidebar-v2/js/leaflet-sidebar"
import { control } from "./myLeaflet"
import pureknob from "pure-knob"

const tabSpec = [
  ["query", icon("bars"), "(Target-user)'s map", query_html],
  ["activities", icon("table2"), "Rendered Activities", actvities_html],
  ["profile", icon("user-circle-o"), "(Target-user)'s profile", profile_html],
  ["controls", icon("equalizer"), "Layer Settings", controls_html],
  ["info", icon("info"), "Info", info_html],
]
const sidebar_tablist_el = document.querySelector(".sidebar-tabs > ul")
const sidebar_content_el = document.querySelector(".sidebar-content")

const tabs = []
const contents = []

for (const spec of tabSpec) {
  const [name, ico, title, content] = spec
  const tab = `<li><a href="#${name}" role="tab">${ico}</a></li>`
  tabs.push(tab)
  const header = `
    <h1 class="sidebar-header">${title}
      <span class="sidebar-close">
        ${icon("caret-left")}
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
export const sidebar = control.sidebar("sidebar").addTo(map)

// const sidebarTabs = Array.from(document.querySelectorAll("[role=tab]")).map(
//   (el) => el.href.split("#")[1]
// )

// if (!currentUser.id) {
//   const idx = sidebarTabs.indexOf("profile")
//   sidebarTabs.splice(idx, 1)
// }

let currentTab = 0

/* key and mouse bindings to the map to control the sidebar */

sidebar.addEventListener("opening", () => (sidebar.isOpen = true))
sidebar.addEventListener("closing", () => (sidebar.isOpen = false))
sidebar.isOpen = false

document.addEventListener("keydown", (e) => {
  if (sidebar.isOpen) {
    switch (e.keyCode) {
      case 27: // ESC key
      case 32: // Space key
        sidebar.close()
        break
      case 40: // up-arrow
        currentTab = (currentTab + 1) % sidebarTabs.length
        sidebar.open(sidebarTabs[currentTab])
        break
      case 38: // down-arrow
        currentTab--
        if (currentTab < 0) currentTab = sidebarTabs.length - 1
        sidebar.open(sidebarTabs[currentTab])
        break
    }
  } else {
    switch (e.keyCode) {
      case 32: // Space key
        sidebar.open(sidebarTabs[currentTab])
        break
    }
  }
})

map.addEventListener("click", () => sidebar.isOpen && sidebar.close())

const knob = pureknob.createKnob(300, 300)
// Create element node.
const node = knob.node()

// Add it to the DOM.
const elem = document.getElementById("knob")
elem.appendChild(node)
