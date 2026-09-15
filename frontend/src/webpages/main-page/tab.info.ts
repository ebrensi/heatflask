import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import { OFFLINE, SPONSOR_URL } from "~/src/js/Env"

import CONTENT from "bundle-text:./tab.info.html"
export { CONTENT }

export const ID = "InfoTab"
export const TITLE = "Info"
export const ICON = icon("info")

const contact_specs = [
  ["strava", "https://www.strava.com/clubs/271165"],
  ["envelope-o", "mailto:info@heatflask.com"],
  ["github", "https://github.com/ebrensi/heatflask"],
  ["linkedin", "https://www.linkedin.com/company/heatflask"],
]

const html_tags: string[] = []
for (const [icon_name, url] of contact_specs) {
  if (icon_name) {
    const icon_tag = icon(icon_name, "icon-button")
    html_tags.push(`<a href="${url}" target="_blank">${icon_tag}</a>`)
  } else {
    html_tags.push(`<span class="break"></span>`)
  }
}

export function SETUP(state: State) {
  const contacts_el = document.getElementById("contacts")
  contacts_el.innerHTML = html_tags.join("")

  // A sponsor link is no use to someone running Heatflask offline
  const support_el = document.getElementById("support")
  const sponsor_link = <HTMLAnchorElement>support_el.querySelector("a")
  if (OFFLINE) support_el.remove()
  else sponsor_link.href = SPONSOR_URL
}
