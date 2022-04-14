import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"

/**
 * This runs when all sidebar HTML is in place and we have a model State
 */
export default function onload({ query, targetUser }: State) {
  const afterDateEl: HTMLInputElement =
    document.querySelector("[data-bind=after]")

  const beforeDateEl: HTMLInputElement =
    document.querySelector("[data-bind=before]")

  query.onChange(
    "after",
    (newDate: string) => (beforeDateEl.min = newDate),
    false
  )
  query.onChange(
    "before",
    (newDate: string) => (afterDateEl.max = newDate),
    false
  )

  window.query = query
  // query.onChange((newDate: string) => (beforeDateEl.min = newDate), "after")
  // query.onChange((newDate: string) => (afterDateEl.max = newDate), "before")
}

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
