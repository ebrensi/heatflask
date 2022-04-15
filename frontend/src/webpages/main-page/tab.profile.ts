import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"

import CONTENT from "bundle-text:./tab.profile.html"
export { CONTENT }

export const ID = "profile"
export const ICON = icon("user-circle-o")
export const TITLE = `
  <a href="#"
    target="_blank"
    data-bind="strava-url"
    data-prop="href"
    data-class="current-user"
  >
  <button
    class="avatar"
    data-class="target-user"
    data-bind="avatar"
    data-attr="data-url"
  ></button
  ></a>

  <span
    data-bind="username"
    data-prop="innerText"
    data-class="current-user"
  ></span>
`

export function SETUP({ currentUser }: State) {
  /*
   * Set a listener to change user's account to public or private
   *  if they change that setting
   */
  // currentUser.onChange("private", async (status) => {
  //   const resp = await fetch(`${URLS["visibility"]}`)
  //   const response = await resp.text()
  //   console.log(`response: ${response}`)
  // })
}

// function logout() {
//   console.log(`${currentUser.id} logging out`)
//   window.location.href = currentUser.url.logout
// }

// function deleteAccount() {
//   window.location.href = currentUser.url.delete
// }

// function viewIndex() {
//   window.open(currentUser.url.index)
// }
