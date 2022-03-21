import { icon } from "../../js/Icons"

contact_specs = [
  ["linkedin", "https://www.linkedin.com/company/heatflask"],
  ["twitter", "https://twitter.com/heatflask"],
  ["instagram", "https://www.instagram.com/heatflask"],
  ["notification", "https://www.strava.com/clubs/271165"],
  ["github", "https://github.com/ebrensi/heatflask"],
  ["envelope-o", "mailto:info@heatflask.com"],
]

html_tags = []
for (const [icon_name, url] of contact_specs) {
  const icon_tag = icon(icon_name, "icon-button")
  html_tags.push(`<a href="${url}" target="_blank">${icon_tag}</a>`)
}

document.addEventListener("DOMContentLoaded", () => {
  contacts_el = document.getElementById("contacts")
  console.log(contacts_el)
  contacts_el.innerHTML = html_tags.join("")
})
