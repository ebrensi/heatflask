import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"

import CONTENT from "bundle-text:./tab.info.html"
export { CONTENT }

export const ID = "info"
export const TITLE = "Info"
export const ICON = icon("info")

const contact_specs = [
  ["linkedin", "https://www.linkedin.com/company/heatflask"],
  ["twitter", "https://twitter.com/heatflask"],
  ["instagram", "https://www.instagram.com/heatflask"],
  [null, null],
  ["strava", "https://www.strava.com/clubs/271165"],
  ["github", "https://github.com/ebrensi/heatflask"],
  ["envelope-o", "mailto:info@heatflask.com"],
]

const html_tags: string[] = []
for (const [icon_name, url] of contact_specs) {
  if (icon_name) {
    const icon_tag = icon(icon_name, "icon-button")
    html_tags.push(`<a href="${url}" target="_blank">${icon_tag}</a>`)
  } else {
    html_tags.push("<br>")
  }
}

export function SETUP(state: State) {
  const contacts_el = document.getElementById("contacts")
  contacts_el.innerHTML = html_tags.join("")
}
