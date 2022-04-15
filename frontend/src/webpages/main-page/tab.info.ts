import { icon as ico } from "~/src/js/Icons"
import { State } from "~/src/js/Model"

import content from "bundle-text:./tab.info.html"
export { content }

export const id = "info"
export const title = "Info"
export const icon = ico("info")

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
    const icon_tag = ico(icon_name, "icon-button")
    html_tags.push(`<a href="${url}" target="_blank">${icon_tag}</a>`)
  } else {
    html_tags.push("<br>")
  }
}

export function setup(state: State) {
  const contacts_el = document.getElementById("contacts")
  contacts_el.innerHTML = html_tags.join("")
}
