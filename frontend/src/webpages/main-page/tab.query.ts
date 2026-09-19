import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import type { QueryParameters } from "~/src/js/Model"
import { renderFromQuery, abortRender } from "~/src/js/Render"
import { OFFLINE, STRAVA_USER_URL, TRANSLATE_URL } from "~/src/js/Env"
import { LOCALES, setLocale, storedLocale, localeName, t } from "~/src/js/i18n"
import { setUnits, storedUnits, Units } from "~/src/js/Units"
import {
  TEXT_SCALE_CHANGE,
  TEXT_SCALE_MAX,
  TEXT_SCALE_MIN,
  getTextScale,
  resetTextScale,
  stepTextScale,
} from "~/src/js/TextScale"
import CONTENT from "bundle-text:./tab.query.html"
export { CONTENT }

export const ID = "QueryTab"
export const ICON = icon("bars")

/* These carried data-bind attributes that nothing processed: the only
 * [data-bind] walk in the codebase covers this tab's own form inputs and never
 * touches the header. So the avatar sat on its placeholder and the title
 * rendered the literal text "$TARGET_USER's map". SETUP fills them in by id --
 * the header is already in the DOM by the time it runs. */
export const TITLE = `
  <a id="query-user-link" href="#" target="_blank" rel="noopener">
    <img id="query-user-avatar" class="tab-avatar" alt="" />
  </a>
  <span id="query-user-title"></span>
`
/** Put the target user's name and avatar into the tab header. */
function fillHeader(appState: State): void {
  const user = appState.targetUser
  if (!user) return

  const displayName = user.name || t("common.athleteFallback", { id: user.id })
  const title = document.getElementById("query-user-title")
  if (title) title.textContent = t("tab.query.title", { name: displayName })

  const avatar = <HTMLImageElement>document.getElementById("query-user-avatar")
  if (avatar && user.profile) {
    avatar.src = user.profile
    avatar.alt = user.name || ""
  }

  const link = <HTMLAnchorElement>document.getElementById("query-user-link")
  if (link && user.id) link.href = STRAVA_USER_URL(user.id)
}

type CallbackFunction = (el: HTMLElement, S: State) => void
type CallbackDispatch = Record<string, CallbackFunction>

const OnChange: CallbackDispatch = {
  /**
   * Handle Query-Type change
   */
  queryType: (el, S) => {
    const qtype = (<HTMLSelectElement>el).value
    S.query.type = <QueryParameters["type"]>qtype

    const tabContentElement = document.getElementById(ID)
    const qelements = tabContentElement.querySelectorAll("[data-qshow]")
    for (const el of Array.from(qelements)) {
      const toShow = el.getAttribute("data-qshow").split(",")
      if (toShow.includes(qtype)) {
        el.classList.add("show")
      } else {
        el.classList.remove("show")
      }
    }
  },

  autozoom: (el, S) => {
    S.visual.autozoom = (<HTMLInputElement>el).checked
  },
}

const OnClick: CallbackDispatch = {
  "button:query": (el, S) => {
    runQuery(S)
  },
  "button:abort": () => {
    abortRender()
  },
  "button:login": (el, S) => {
    console.log("button:login", el, S)
    // const currentUrl = window.location.href
    window.location.href = "/authorize"
  },
}

/**
 * Pull the current form values into the model, then run the query.
 *
 * The [data-bind] inputs are not synced to appState as the user edits them --
 * only queryType and autozoom have change handlers -- so they are collected
 * here, at the point of use.
 */
function runQuery(S: State): void {
  const fromDom = getQparamsFromDom().query
  if (fromDom) {
    const target = <Record<string, unknown>>(<unknown>S.query)
    for (const [key, value] of Object.entries(fromDom)) {
      if (value === "" || value === null || value === undefined) continue
      target[key] = key === "quantity" ? +value : value
    }
  }
  renderFromQuery().catch((e) => console.error("query failed:", e))
}

/**
 * This runs when all sidebar HTML is in place and we have a model State
 */
export function SETUP(appState: State) {
  const tabContentElement = document.getElementById(ID)

  fillHeader(appState)
  buildLanguagePicker()
  buildUnitsPicker()
  buildTextSize()

  // Set up change and click listeners
  tabContentElement.addEventListener("change", (e: Event) => {
    const el = <HTMLElement>e.target
    const onChangeFunc = OnChange[el.id]
    if (onChangeFunc) {
      onChangeFunc(el, appState)
    }
  })

  tabContentElement.addEventListener("click", (e: Event) => {
    const el = <HTMLElement>e.target
    const onClickFunc = OnClick[el.id]
    if (onClickFunc) {
      onClickFunc(el, appState)
    }
  })

  const afterDateEl = <HTMLInputElement>document.getElementById("date-after")
  const beforeDateEl = <HTMLInputElement>document.getElementById("date-before")
  afterDateEl.addEventListener(
    "change",
    () => (beforeDateEl.min = afterDateEl.value)
  )
  beforeDateEl.addEventListener(
    "change",
    () => (afterDateEl.max = beforeDateEl.value)
  )

  /*
   * If the user hits enter in tbe number field, make the query
   */
  document.getElementById("quantity").addEventListener("keypress", (event) => {
    if (event.key === "Enter") {
      appState.query.quantity = +(<HTMLInputElement>event.target).value
      runQuery(appState)
    }
  })

  //  Initialize DOM element values with those from appState paramters
  setDomFromParams(appState, tabContentElement)
  tabContentElement.dispatchEvent(new Event("change"))
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
    `<option value="">${t("tab.query.languageAuto")}</option>`,
    ...LOCALES.map(
      (tag) => `<option value="${tag}">${localeName(tag)}</option>`
    ),
  ]
  select.innerHTML = options.join("")

  /* Only mark a language current if it was actually chosen; on Automatic the
   * empty option stays selected, which is the honest reading of the state. */
  select.value = storedLocale() || ""

  select.addEventListener("change", () => setLocale(select.value))

  /* The instructions for adding a catalog are on GitHub, which is no use to
   * someone running Heatflask offline */
  const link = <HTMLAnchorElement>document.getElementById("translate-link")
  if (OFFLINE) document.getElementById("translate-note")?.remove()
  else if (link) link.href = TRANSLATE_URL
}

/**
 * Automatic / Metric / Imperial, the same shape as the language menu: the
 * empty option is the browser's locale deciding, and stays selected until
 * someone actually chooses.
 */
function buildUnitsPicker(): void {
  const select = <HTMLSelectElement>document.getElementById("units-select")
  if (!select) return
  select.value = storedUnits()
  select.addEventListener("change", () => setUnits(<Units | "">select.value))
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

type TT<k extends keyof State> = [k, keyof State[k]]
type ValidPair = TT<keyof State>

function setDomFromParams(appState: State, baseElement?: HTMLElement) {
  const elements = (baseElement || document).querySelectorAll("[data-bind]")
  for (const el of Array.from(elements)) {
    const key = el.getAttribute("data-bind")
    const [paramStr, propOrAttr] = key.split(":")
    const [pclass, pfield] = <ValidPair>paramStr.split(".")
    const value = appState[pclass][pfield]
    if (value !== undefined) {
      const isAttr = propOrAttr[0] === "*"
      // Depending on whether this is a property or an attribute
      if (isAttr) {
        const attr = propOrAttr.slice(1)
        el.setAttribute(attr, String(value))
      } else {
        const prop = propOrAttr
        el[prop] = value
      }
    }
  }
  const querytypeSelectorEl = document.getElementById("queryType")
  OnChange["queryType"](querytypeSelectorEl, appState)

  const fshow_elements = (baseElement || document).querySelectorAll(
    "[data-fshow$=authenticated]"
  )
  for (const el of Array.from(fshow_elements)) {
    const value = el.getAttribute("data-fshow")
    const authenticated = !!appState.currentUser
    const wantsAuthenticated = value[0] !== "!"
    if (authenticated && wantsAuthenticated) {
      el.classList.add("show")
    } else {
      el.classList.remove("show")
    }
  }
}

export function getQparamsFromDom(baseElement?: HTMLElement) {
  baseElement = baseElement || document.getElementById(ID)
  const elements = baseElement.querySelectorAll('[data-bind^="query"]')
  const result: Record<string, Record<string, any>> = {}
  for (const el of Array.from(elements)) {
    const key = el.getAttribute("data-bind")
    const [paramStr, propOrAttr] = key.split(":")
    const [pclass, pfield] = paramStr.split(".")
    const isAttr = propOrAttr[0] === "*"
    const value = isAttr
      ? el.getAttribute(propOrAttr.slice(1))
      : el[<keyof typeof el>propOrAttr]
    if (!result[pclass]) {
      result[pclass] = {}
    }
    result[pclass][pfield] = value
  }
  return result
}

// const qParams: QueryParameters = { ...S.query, ...getQparamsFromDom() }

// function renderFromQuery() {
//   const query = {
//     [qParams.userid]: getCurrentQuery(),
//   }
//   // console.log(`making query: ${JSON.stringify(query)}`)

//   makeQuery(query, () => {
//     flags.importing = false
//     const num = items.size
//     const msg = `done! ${num} activities imported`
//     document.querySelectorAll(".info-message").forEach((el) => {
//       el.innerHTML = msg
//     })
//     updateLayers()
//   })
// }
