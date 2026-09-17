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
import {
  CURRENT_USER,
  URLS,
  ADMIN,
  STRAVA_PROFILE_URL,
  PRIVACY_URL,
} from "~/src/js/Env"
import { t } from "~/src/js/i18n"

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
  if (!user) {
    /* A visitor viewing someone's shared map: offer a login, which comes back
     * to this same map, instead of account controls they have no account for.
     * (The server refuses /visibility and /delete without a session anyway.) */
    const title = el("profile-tab-title")
    if (title) title.textContent = t("tab.profile.loginTitle")
    const login = el<HTMLAnchorElement>("profile-login-link")
    if (login) {
      const here = window.location.pathname + window.location.search
      login.href = `${URLS.login}?state=${encodeURIComponent(here)}`
    }
    el("profile-anon").hidden = false
    return
  }
  el("profile-authed").hidden = false

  /* --- identity -------------------------------------------------------- */

  const name = el("profile-name")
  if (name)
    name.textContent = user.name || t("common.athleteFallback", { id: user.id })

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
    const ok = window.confirm(t("tab.profile.deleteConfirm"))
    if (!ok) return
    /* A form POST rather than navigating to the URL: /delete only accepts POST,
     * so a link on some other site cannot delete a logged-in visitor's
     * account. The server answers with a redirect to log out. */
    const form = document.createElement("form")
    form.method = "POST"
    form.action = URLS.delete
    document.body.appendChild(form)
    form.submit()
  })

  /* --- shared maps ------------------------------------------------------ */

  const privacyLink = el<HTMLAnchorElement>("profile-privacy-link")
  if (privacyLink) privacyLink.href = PRIVACY_URL

  const shared = el<HTMLInputElement>("profile-shared")
  if (shared) {
    // `private` is the stored field; the checkbox asks the opposite question
    shared.checked = !user.private

    shared.addEventListener("change", async () => {
      const setting = shared.checked ? "on" : "off"
      try {
        const resp = await fetch(`${URLS.visibility}${setting}`, {
          method: "POST",
        })
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
        /* The endpoint answers with the resulting shared/not-shared state, so
         * take that rather than assuming the click did what it looked like. */
        const isShared = <boolean>await resp.json()
        shared.checked = isShared
        user.private = !isShared
      } catch (e) {
        console.error("could not change map sharing", e)
        shared.checked = !shared.checked // put it back
      }
    })
  }

  /* --- admin ------------------------------------------------------------ */

  if (ADMIN && URLS.admin) {
    const box = el("profile-admin")
    const link = el<HTMLAnchorElement>("profile-admin-link")
    if (link) link.href = URLS.admin
    const historyLink = el<HTMLAnchorElement>("profile-history-link")
    if (historyLink && URLS.history) historyLink.href = URLS.history
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
