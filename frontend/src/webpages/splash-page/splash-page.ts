/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
import { initI18n, applyTranslations, t } from "~/src/js/i18n"

console.log(`Environment: ${process.env.NODE_ENV}`)

const runtime_json = JSON.parse(
  document.getElementById("runtime_json").innerText
)
const urls = runtime_json["urls"]
const flashes_el = document.getElementById("flashes")
const flashes = JSON.parse(flashes_el.innerText)
if (flashes && flashes.length) {
  const flashes_str = flashes.join("\n")
  flashes_el.innerText = flashes_str
  flashes_el.style.display = "block"
}

/* The backend puts the app name in <title>; the rest of it is ours, and in
 * a language that may want the two the other way round. */
initI18n()
document.title = t("splash.title", { app: document.title })
applyTranslations(document)

document.querySelector("#bubbler").addEventListener("click", (e) => {
  const url = urls[(<HTMLElement>e.target).id]

  if (url) {
    window.location.href = url
  }
})
export {}
