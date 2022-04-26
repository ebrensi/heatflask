import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import type { QueryParameters } from "~/src/js/Model"
import CONTENT from "bundle-text:./tab.query.html"
export { CONTENT }

export const ID = "QueryTab"
export const ICON = icon("bars")

export const TITLE = `
  <a href="#" data-bind="targetUser.stravaUrl:href" target="_blank">
  <button class="avatar" data-bind="targetUser.profile:*data-url"></button></a>
  <span data-bind="targetUser.name:innerText">$TARGET_USER</span>'s map
`
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
    console.log("button:query", el, S)
  },
  "button:abort": (el, S) => {
    console.log("button:abort", el, S)
  },
  "button:login": (el, S) => {
    console.log("button:login", el, S)
    // const currentUrl = window.location.href
    window.location.href = "/authorize"
  },
  "button:logout": (el, S) => {
    console.log("button:logout", el, S)
    window.location.href = "/auth/logout"
  },
}

/**
 * This runs when all sidebar HTML is in place and we have a model State
 */
export function SETUP(appState: State) {
  const tabContentElement = document.getElementById(ID)

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
      console.log("we gonna render now...")
      // renderFromQuery()
    }
  })

  //  Initialize DOM element values with those from appState paramters
  setDomFromParams(appState, tabContentElement)
  tabContentElement.dispatchEvent(new Event("change"))
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
