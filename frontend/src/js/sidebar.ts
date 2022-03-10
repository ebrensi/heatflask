// CSS
import "../../node_modules/sidebar-v2/css/leaflet-sidebar.css"
import "../css/leaflet-sidebar-v2-mods.css"

// HTML
import { icon } from "./Icons"
import query_html from "bundle-text:../html/main-tabs/query.html"
import actvities_html from "bundle-text:../html/main-tabs/activities.html"
import profile_html from "bundle-text:../html/main-tabs/profile.html"
import controls_html from "bundle-text:../html/main-tabs/controls.html"
import info_html from "bundle-text:../html/main-tabs/info.html"

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
      </div>`)
}

sidebar_tablist_el.innerHTML = tabs.join("\n")
sidebar_content_el.innerHTML = contents.join("")
