import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import type { LiveParams } from "~/src/js/DataBinding"

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
    S.query.queryType = qtype

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
    console.log("button:query")
  },
  "button:abort": (el, S) => {
    console.log("button:abort")
  },
  "button:login": (el, S) => {
    console.log("button:login")
    // const currentUrl = window.location.href
    window.location.href = "/authorize"
  },
  "button:logout": (el, S) => {
    console.log("button:logout")
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

  const afterDateEl = document.getElementById("date-after")
  const beforeDateEl = document.getElementById("date-before")

  //   Initialize DOM element values with those from appState paramters
  setDomFromParams(tabContentElement, appState)
  tabContentElement.dispatchEvent(new Event("change"))
}

function setDomFromParams(baseElement: HTMLElement, appState: State) {
  const elements = (baseElement || document).querySelectorAll("[data-bind]")
  for (const el of Array.from(elements)) {
    const key = el.getAttribute("data-bind")
    const [paramStr, propOrAttr] = key.split(":")
    const [pclass, pfield] = paramStr.split(".")
    const value = appState[pclass][pfield]
    if (value !== undefined) {
      const isAttr = propOrAttr[0] === "*"
      // Depending on whether this is a property or an attribute
      if (isAttr) {
        const attr = propOrAttr.slice(1)
        el.setAttribute(attr, value)
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

export function getQparamsFromDom(baseElement: HTMLElement) {
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

// query.onChange(
//   "after",
//   (newDate: string) => {
//     beforeDateEl.min = newDate
//   },
//   false
// )
// query.onChange(
//   "before",
//   (newDate: string) => (afterDateEl.max = newDate),
//   false
// )

// /*
//  * If the user hits enter in tbe number field, make the query
//  */
// document
//   .querySelector("[data-bind=quantity]")
//   .addEventListener("keypress", (event) => {
//     if (event.key === "Enter") {
//       qParams.quantity = event.target.value
//       renderFromQuery()
//     }
//   })

// function login() {
//   window.location.href = AUTHORIZE_URL
// }

// function logout() {
//   console.log(`${currentUser.id} logging out`)
//   window.location.href = currentUser.url.logout
// }

// function abortRender() {
//   abortQuery()
// }

//  *  Construct a query for activity data from our qParams

// function getCurrentQuery() {
//   const query = { streams: true }

//   switch (qParams.queryType) {
//     case "activities":
//       query.limit = +qParams.quantity
//       break

//     case "days": {
//       // debugger;
//       const today = new Date(),
//         before = new Date(),
//         after = new Date(),
//         n = +qParams.quantity
//       before.setDate(today.getDate() + 1) // tomorrow
//       after.setDate(today.getDate() - n) // n days ago

//       query.before = before.toISOString().split("T")[0]
//       query.after = after.toISOString().split("T")[0]

//       break
//     }

//     case "ids":
//       if (!qParams.ids) return
//       else {
//         const idSet = new Set(qParams.ids.split(/\D/).map(Number))
//         idSet.delete(0)
//         // create an array of ids (numbers) from a string
//         query.activity_ids = Array.from(idSet)
//       }
//       break

//     case "dates":
//       if (qParams.before) query.before = qParams.before
//       if (qParams.after) query.after = qParams.after
//       break

//     case "key":
//       query.key = qParams.key
//   }

//   const to_exclude = Object.keys(items).map(Number)
//   if (to_exclude.length) query["exclude_ids"] = to_exclude

//   return query
// }

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
