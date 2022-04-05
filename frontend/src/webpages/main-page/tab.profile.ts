import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"

export default function onload({ currentUser }: State) {
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
