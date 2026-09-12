/*
 * The User tab.
 *
 * Everything here used to be declarative bindings that resolved to nothing:
 * the name bound to "firstname"/"lastname", which the backend never sent (it
 * sent a single `name`, and only the first name at that), and the avatar was a
 * <button> styled with `background: attr(data-url)` -- CSS attr() applies only
 * to the `content` property, so that rule never took effect and the Strava
 * placeholder always showed. The three buttons carried data-action attributes
 * that nothing listened for, which is why "View index" did nothing.
 *
 * It is all explicit now, driven from CURRENT_USER and URLS.
 */

import { icon } from "~/src/js/Icons"
import { State } from "~/src/js/Model"
import { CURRENT_USER, URLS, ADMIN, STRAVA_PROFILE_URL } from "~/src/js/Env"

import CONTENT from "bundle-text:./tab.profile.html"
export { CONTENT }

export const ID = "profile"
export const ICON = icon("user-circle-o")
export const TITLE = `<span id="profile-tab-title"></span>`

function el<T extends HTMLElement>(id: string): T {
  return <T>document.getElementById(id)
}

export function SETUP(_state: State): void {
  const user = CURRENT_USER
  if (!user) return

  /* --- identity -------------------------------------------------------- */

  const name = el("profile-name")
  if (name) name.textContent = user.name || `athlete ${user.id}`

  const title = el("profile-tab-title")
  if (title) title.textContent = user.name || ""

  const avatar = el<HTMLImageElement>("profile-avatar")
  if (avatar && user.profile) {
    avatar.src = user.profile
    avatar.alt = user.name || ""
  }

  const stravaLink = el<HTMLAnchorElement>("profile-strava-link")
  if (stravaLink) stravaLink.href = STRAVA_PROFILE_URL

  /* --- actions --------------------------------------------------------- */

  onAction("view-index", () => {
    /* The cached-activity list, in its own tab so the map keeps running */
    window.open(URLS.index, "_blank", "noopener")
  })

  onAction("logout", () => {
    window.location.href = URLS.logout
  })

  onAction("delete", () => {
    const ok = window.confirm(
      "Delete your Heatflask account?\n\n" +
        "This removes your indexed activities and revokes Heatflask's access " +
        "to your Strava data. It cannot be undone."
    )
    if (ok) window.location.href = URLS.delete
  })

  /* --- public profile --------------------------------------------------- */

  const directoryLink = el<HTMLAnchorElement>("profile-directory-link")
  if (directoryLink && URLS.directory) directoryLink.href = URLS.directory

  const pub = el<HTMLInputElement>("profile-public")
  if (pub) {
    // `private` is the stored field; the checkbox asks the opposite question
    pub.checked = !user.private

    pub.addEventListener("change", async () => {
      const setting = pub.checked ? "on" : "off"
      try {
        const resp = await fetch(`${URLS.visibility}${setting}`)
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        /* The endpoint answers with the resulting public/not-public state, so
         * take that rather than assuming the click did what it looked like. */
        const isPublic = <boolean>await resp.json()
        pub.checked = isPublic
        user.private = !isPublic
      } catch (e) {
        console.error("could not change profile visibility", e)
        pub.checked = !pub.checked // put it back
      }
    })
  }

  /* --- admin ------------------------------------------------------------ */

  if (ADMIN && URLS.admin) {
    const box = el("profile-admin")
    const link = el<HTMLAnchorElement>("profile-admin-link")
    if (link) link.href = URLS.admin
    if (box) box.hidden = false
  }
}

/** Wire every element carrying data-action="<name>" to a handler. */
function onAction(action: string, fn: () => void): void {
  for (const e of Array.from(
    document.querySelectorAll(`[data-action="${action}"]`)
  )) {
    e.addEventListener("click", fn)
  }
}
