/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * Dot colours.
 *
 * A terminal-style palette: eight named hues, each in three tones -- deep,
 * middle and bright -- for 24 colours. Every colour is as saturated as sRGB
 * allows at its lightness, so they read as solid colours on any basemap
 * rather than pastels, and two activities can share a hue and still be told
 * apart by tone, as a terminal's red and bright red are.
 *
 * The colours are worked out in OKLCH, where equal lightness looks equal
 * whatever the hue. A hue's tones are TONE_STEP apart in lightness, and sit
 * wherever the least saturated of the three is most saturated. That is not
 * the same place for every hue: sRGB's purest yellow is nearly white and its
 * purest blue is dark, so yellow's tones sit high and blue's low, and none
 * of them is washed out towards white or muddied towards black.
 */

/** The hues, as OKLCH hue angles in degrees: red, orange, yellow, green,
 * cyan, blue, violet, magenta. */
const HUES = [29, 58, 106, 142, 195, 262, 300, 335]

/** OKLCH lightness between the deep, pure and bright tones of a hue */
const TONE_STEP = 0.12

/** No tone darker or lighter than this. Darker gets lost on the dark
 * basemaps; lighter has no room left for colour. */
const MIN_L = 0.5
const MAX_L = 0.94

/** Consecutive activities step this many places through HUES. It shares no
 * factor with HUES.length, so every hue comes round once per HUES.length
 * activities, and a step of 3 in 8 puts neighbours 135 degrees apart. */
const HUE_STEP = 3

/** An OKLab colour as linear-light sRGB, per Björn Ottosson. */
function oklabToLinearSrgb(L: number, a: number, b: number): number[] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const inGamut = (rgb: number[]) => rgb.every((c) => c >= -1e-6 && c <= 1 + 1e-6)

/** The most chroma sRGB can show at lightness L and hue h (radians) */
function maxChroma(L: number, h: number): number {
  const cos = Math.cos(h)
  const sin = Math.sin(h)
  let lo = 0
  let hi = 0.4
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (inGamut(oklabToLinearSrgb(L, mid * cos, mid * sin))) lo = mid
    else hi = mid
  }
  return lo
}

/** The lightness of hue h's (radians) middle tone: where the least saturated
 * of its three tones is as saturated as it can be */
function middleLightness(h: number): number {
  let best = 0
  let bestC = -1
  for (let L = MIN_L + TONE_STEP; L <= MAX_L - TONE_STEP; L += 0.005) {
    const C = Math.min(
      maxChroma(L - TONE_STEP, h),
      maxChroma(L, h),
      maxChroma(L + TONE_STEP, h)
    )
    if (C > bestC) {
      bestC = C
      best = L
    }
  }
  return best
}

/** sRGB transfer function, linear 0..1 to an 8-bit channel. */
function encode(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
  return Math.round(255 * Math.min(1, Math.max(0, v)))
}

/** Hue h's three tones, deep to bright, as CSS colours */
function tones(hueDegrees: number): string[] {
  const h = (((hueDegrees % 360) + 360) % 360) * (Math.PI / 180)
  const mid = middleLightness(h)
  return [mid - TONE_STEP, mid, mid + TONE_STEP].map((L) => {
    const C = maxChroma(L, h)
    const [r, g, b] = oklabToLinearSrgb(L, C * Math.cos(h), C * Math.sin(h))
    return `rgb(${encode(r)},${encode(g)},${encode(b)})`
  })
}

/**
 * `n` colours, the i-th going to the i-th activity.
 *
 * Activity i takes hue HUE_STEP * i and tone i, each modulo its count, so
 * neighbours differ in both, and all 24 colours are used before any repeats.
 *
 * `rotation` turns every hue by that many degrees, so 360 comes back to where
 * it started.
 */
export function makePalette(n: number, rotation = 0): string[] {
  const table = HUES.map((hue) => tones(hue + rotation))
  const palette: string[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const hue = (i * HUE_STEP) % HUES.length
    palette[i] = table[hue][i % 3]
  }
  return palette
}
