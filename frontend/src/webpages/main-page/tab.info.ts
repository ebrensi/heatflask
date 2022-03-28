import { icon } from "~/src/js/Icons"
import { nextAnimationFrame } from "~/src/js/appUtil"

const contact_specs = [
  ["linkedin", "https://www.linkedin.com/company/heatflask"],
  ["twitter", "https://twitter.com/heatflask"],
  ["instagram", "https://www.instagram.com/heatflask"],
  ["notification", "https://www.strava.com/clubs/271165"],
  ["github", "https://github.com/ebrensi/heatflask"],
  ["envelope-o", "mailto:info@heatflask.com"],
]

const html_tags = []
for (const [icon_name, url] of contact_specs) {
  const icon_tag = icon(icon_name, "icon-button")
  html_tags.push(`<a href="${url}" target="_blank">${icon_tag}</a>`)
}

async function onRender() {
  let contacts_el: HTMLDivElement = undefined
  while (!contacts_el) {
    await nextAnimationFrame()
    contacts_el = document.getElementById("contacts")
  }
  contacts_el.innerHTML = html_tags.join("")
}
