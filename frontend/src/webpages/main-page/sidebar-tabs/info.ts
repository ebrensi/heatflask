import { icon } from "../../../js/Icons"

constact_links = [
  ["linkedin", "https://www.linkedin.com/company/heatflask"],
  ["twitter", "https://twitter.com/heatflask"],
  ["instagram", "https://www.instagram.com/heatflask"],
  ["notification", "https://www.strava.com/clubs/271165"],
  ["github", "https://github.com/ebrensi/heatflask"],
  ["envelope-o", "mailto:info@heatflask.com"],
]

html_tags = []
for (const [icon_name, url] in contact_specs) {
  const icon_tag = icon(icon_name, (cls = "icon-button"))
  html_tags.push(`<a href="${url}" target="_blank">${icon_tag}</a>`)
}
contacts_el = document.getElementById("contacts")
contacts_el.innerHTML = html_tags.join("")
