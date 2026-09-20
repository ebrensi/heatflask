/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * TextScale -- how big the sidebar's text is, as a multiplier the reader sets.
 *
 * The stylesheet already steps the pane's type with the window (10pt, then
 * 17px, then 18px); this multiplies whichever of those applies, so the choice
 * survives moving between screens rather than fighting the breakpoints.
 *
 * It is one custom property on the root element, so everything in the panes
 * follows it for free -- provided it sizes in em. rem would not, being
 * root-relative, which is why the tab stylesheets no longer use it.
 *
 * Its own module rather than a corner of Sidebar.ts: the tab that carries the
 * control is one of the tabs Sidebar imports, and this way that is not a
 * cycle.
 */

/** Fired on `document` when the scale changes, after the property is set. */
export const TEXT_SCALE_CHANGE = "text-scale-change"

const KEY = "textScale"

export const TEXT_SCALE_MIN = 0.8
export const TEXT_SCALE_MAX = 1.6
const STEP = 0.1

let scale = 1

export function getTextScale(): number {
  return scale
}

/* 0.8 + 0.1 is 0.9000000000000001, and that would be written to storage and
 * shown in the UI. Two decimals is finer than the step. */
const quantize = (n: number) =>
  Math.min(TEXT_SCALE_MAX, Math.max(TEXT_SCALE_MIN, Math.round(n * 100) / 100))

function apply(): void {
  document.documentElement.style.setProperty("--text-scale", String(scale))
  document.dispatchEvent(new Event(TEXT_SCALE_CHANGE))
}

function store(): void {
  try {
    if (scale === 1) window.localStorage.removeItem(KEY)
    else window.localStorage.setItem(KEY, String(scale))
  } catch {
    /* applied for this page, just not remembered */
  }
}

/** Read the remembered size and apply it. Call before the panes are built. */
export function initTextScale(): void {
  try {
    const saved = parseFloat(window.localStorage.getItem(KEY))
    if (saved > 0) scale = quantize(saved)
  } catch {
    /* nothing remembered; the stylesheet's size stands */
  }
  apply()
}

export function setTextScale(next: number): void {
  scale = quantize(next)
  store()
  apply()
}

/** One notch up (+1) or down (-1). */
export function stepTextScale(direction: number): void {
  setTextScale(scale + direction * STEP)
}

export function resetTextScale(): void {
  setTextScale(1)
}
