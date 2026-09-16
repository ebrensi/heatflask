import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import { OFFLINE, SPONSOR_URL, TRANSLATE_URL } from "~/src/js/Env"
import { LOCALES, setLocale, storedLocale, localeName, t } from "~/src/js/i18n"
import {
  TEXT_SCALE_CHANGE,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  getTextScale,
  resetTextScale,
  stepTextScale,
} from "~/src/js/TextScale"

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

  buildLanguagePicker()
  buildTextSize()

  /* Both links go off to GitHub, which is no use to someone running Heatflask
   * offline -- the sponsor page, and the instructions for adding a catalog.
   * They are in two sections now, so both have to go. */
  const support_el = document.getElementById("support")
  if (OFFLINE) {
    support_el?.remove()
    document.getElementById("translate-note")?.remove()
    return
  }
  const sponsor_link = <HTMLAnchorElement>(
    document.getElementById("sponsor-link")
  )
  if (sponsor_link) sponsor_link.href = SPONSOR_URL
  const translate_link = <HTMLAnchorElement>(
    document.getElementById("translate-link")
  )
  if (translate_link) translate_link.href = TRANSLATE_URL
}

/**
 * The language menu: every catalog we ship, each named in its own language so
 * that it is legible to the person looking for it, plus an Automatic entry
 * that hands the choice back to the browser.
 */
function buildLanguagePicker(): void {
  const select = <HTMLSelectElement>document.getElementById("language-select")
  if (!select) return

  const options = [
    `<option value="">${t("tab.info.languageAuto")}</option>`,
    ...LOCALES.map(
      (tag) => `<option value="${tag}">${localeName(tag)}</option>`
    ),
  ]
  select.innerHTML = options.join("")

  /* Only mark a language current if it was actually chosen; on Automatic the
   * empty option stays selected, which is the honest reading of the state. */
  select.value = storedLocale() || ""

  select.addEventListener("change", () => setLocale(select.value))
}

/**
 * Smaller / Normal / Larger.
 *
 * A stepper rather than a menu of sizes: what the reader wants is this a bit
 * bigger, and the answer to that is one more press, not a list of numbers
 * none of which means anything until it is tried.
 */
function buildTextSize(): void {
  const smaller = document.getElementById("text-smaller")
  const larger = document.getElementById("text-larger")
  const reset = document.getElementById("text-reset")
  if (!(smaller && larger && reset)) return

  smaller.addEventListener("click", () => stepTextScale(-1))
  larger.addEventListener("click", () => stepTextScale(1))
  reset.addEventListener("click", () => resetTextScale())

  /* Nothing happens at the ends, so say so rather than letting the button
   * look live and do nothing. */
  const sync = () => {
    const scale = getTextScale()
    ;(<HTMLButtonElement>smaller).disabled = scale <= TEXT_SCALE_MIN
    ;(<HTMLButtonElement>larger).disabled = scale >= TEXT_SCALE_MAX
    ;(<HTMLButtonElement>reset).disabled = scale === 1
  }
  document.addEventListener(TEXT_SCALE_CHANGE, sync)
  sync()
}
