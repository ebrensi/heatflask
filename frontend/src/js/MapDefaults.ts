/*
 * MapDefaults -- the map style a reader starts with, if they saved one.
 *
 * Only the style: basemap, terrain and the animation settings. Where the map
 * is looking (center, zoom, pitch, bearing) belongs to a particular view, not
 * to a person, and so does whether it is paused.
 *
 * Saved defaults are a starting point, never an override. They apply only to a
 * link that sets no style of its own -- a bare /<athlete>, say. A link that sets
 * any of them is a view someone made, and the rest of it is filled in from the
 * built-in defaults in Model.ts, exactly as the sender saw it. That is what
 * lets URL.ts keep leaving out values equal to the built-in defaults: whoever
 * opens the link fills them in the same way.
 *
 * Saving is something the reader does, not something that happens as they
 * go. Remembering the last settings used would make a shared link's settings
 * the defaults of anyone who opened it and touched a dial.
 */

import { DefaultVisual } from "./Model"
import type { VisualParameters } from "./Model"

export const STYLE_PARAMS = [
  "baselayer",
  "terrain",
  "tau",
  "T",
  "sz",
  "alpha",
  "pw",
  "cr",
  "shadows",
] as const

type StyleParam = typeof STYLE_PARAMS[number]
export type Style = Pick<VisualParameters, StyleParam>

/** Fired on `document` when defaults are saved or forgotten */
export const SAVED_STYLE_CHANGE = "saved-style-change"

const KEY = "mapDefaults"

/**
 * What was saved, or {} if nothing was. Anything that is not the type its
 * built-in default is gets dropped rather than trusted: this is whatever
 * some earlier build, or someone at the console, left in storage.
 */
export function savedStyle(): Style {
  let raw: Record<string, unknown>
  try {
    raw = JSON.parse(window.localStorage.getItem(KEY) || "{}")
  } catch {
    return {}
  }
  if (!raw || typeof raw !== "object") return {}

  const style: Record<string, unknown> = {}
  for (const p of STYLE_PARAMS) {
    const v = raw[p]
    if (typeof v !== typeof DefaultVisual[p]) continue
    if (typeof v === "number" && !isFinite(v)) continue
    style[p] = v
  }
  return <Style>style
}

export function hasSavedStyle(): boolean {
  return Object.keys(savedStyle()).length > 0
}

/** Does this set of parameters, parsed from a link, set any of the style? */
export function setsStyle(visual: VisualParameters): boolean {
  return STYLE_PARAMS.some((p) => visual[p] !== undefined)
}

/** The style part of these parameters */
export function styleOf(visual: VisualParameters): Style {
  const style: Record<string, unknown> = {}
  for (const p of STYLE_PARAMS) style[p] = visual[p]
  return <Style>style
}

/** Is this the style that is saved? */
export function isSaved(visual: VisualParameters): boolean {
  const saved = savedStyle()
  return hasSavedStyle() && STYLE_PARAMS.every((p) => saved[p] === visual[p])
}

export function saveStyle(visual: VisualParameters): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(styleOf(visual)))
  } catch {
    return // nowhere to keep it; the button stays live, which says as much
  }
  document.dispatchEvent(new Event(SAVED_STYLE_CHANGE))
}

export function forgetStyle(): void {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    /* nothing was saved in the first place */
  }
  document.dispatchEvent(new Event(SAVED_STYLE_CHANGE))
}
