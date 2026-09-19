import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import { OFFLINE, SPONSOR_URL } from "~/src/js/Env"

import CONTENT from "bundle-text:./tab.info.html"
export { CONTENT }

export const ID = "InfoTab"
export const TITLE = `<span data-i18n="tab.info.title">Info</span>`
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

  /* The sponsor page is on GitHub, which is no use to someone running
   * Heatflask offline */
  const support_el = document.getElementById("support")
  if (OFFLINE) {
    support_el?.remove()
    return
  }
  const sponsor_link = <HTMLAnchorElement>(
    document.getElementById("sponsor-link")
  )
  if (sponsor_link) sponsor_link.href = SPONSOR_URL
}
