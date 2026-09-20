/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
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
  OFFLINE,
  TRANSLATE_URL,
} from "~/src/js/Env"
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
import {
  STYLE_PARAMS,
  SAVED_STYLE_CHANGE,
  forgetStyle,
  hasSavedStyle,
  isSaved,
  saveStyle,
} from "~/src/js/MapDefaults"

import CONTENT from "bundle-text:./tab.profile.html"
export { CONTENT }

export const ID = "profile"
export const ICON = icon("user-circle-o")
export const TITLE = `<span id="profile-tab-title"></span>`

function el<T extends HTMLElement>(id: string): T {
  return <T>document.getElementById(id)
}

export function SETUP(state: State): void {
  /* Preferences first: they are for everyone, logged in or not */
  buildLanguagePicker()
  buildUnitsPicker()
  buildTextSize()
  buildMapDefaults(state)

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
  el("profile-delete").hidden = false

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

/**
 * The language menu: every catalog we ship, each named in its own language so
 * that it is legible to the person looking for it, plus an Automatic entry
 * that hands the choice back to the browser.
 */
function buildLanguagePicker(): void {
  const select = <HTMLSelectElement>document.getElementById("language-select")
  if (!select) return

  const options = [
    `<option value="">${t("tab.profile.languageAuto")}</option>`,
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

/**
 * Save as my defaults / Forget. Each button is live only when it would do
 * something: Save greys out once the map is the saved style, and comes back
 * the moment a dial or the basemap moves off it.
 */
function buildMapDefaults(appState: State): void {
  const save = <HTMLButtonElement>document.getElementById("defaults-save")
  const forget = <HTMLButtonElement>document.getElementById("defaults-forget")
  if (!(save && forget)) return
  const { visual } = appState

  save.addEventListener("click", () => saveStyle(visual))
  forget.addEventListener("click", () => forgetStyle())

  const sync = () => {
    save.disabled = isSaved(visual)
    forget.disabled = !hasSavedStyle()
  }
  for (const p of STYLE_PARAMS) visual.onChange(p, sync, false)
  document.addEventListener(SAVED_STYLE_CHANGE, sync)
  sync()
}

/** Wire every element carrying data-action="<name>" to a handler. */
function onAction(action: string, fn: () => void): void {
  for (const e of Array.from(
    document.querySelectorAll(`[data-action="${action}"]`)
  )) {
    e.addEventListener("click", fn)
  }
}
