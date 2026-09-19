/*
 * Units -- whether distances read in kilometres or miles.
 *
 * Strava has the athlete's own preference (measurement_preference), but only
 * gives it to a token with profile:read_all, and asking every athlete for their
 * whole profile -- weight, zones, gear -- to learn which way they measure a run
 * is a poor trade. So the default comes from the browser's locale instead, and
 * the Info tab lets anyone who disagrees say so. That choice is remembered in
 * this browser under "units", the key the activity tables have always read.
 */

/** Fired on `document` when the units change. */
export const UNITS_CHANGE = "units-change"

export type Units = "metric" | "imperial"

const KEY = "units"

/* The countries that still measure distance in miles and feet, by region
 * subtag. The UK signposts roads in miles but runs and races in kilometres,
 * so it gets metric; the Info tab is there for anyone who would rather not. */
const IMPERIAL_REGIONS = new Set(["US", "LR", "MM"])

/**
 * Metric unless the browser's first language places it in one of the
 * countries above. A bare "en" carries no region, so it is maximized to its
 * likeliest one -- en-US -- rather than guessed at.
 */
function localeUnits(): Units {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    return IMPERIAL_REGIONS.has(region) ? "imperial" : "metric"
  } catch {
    return "metric"
  }
}

/* localStorage throws rather than no-ops in some privacy modes */
function read(): string {
  try {
    return window.localStorage.getItem(KEY) || ""
  } catch {
    return ""
  }
}

/** The units chosen in the Info tab, or "" if they were left to the locale. */
export function storedUnits(): Units | "" {
  const saved = read()
  return saved === "metric" || saved === "imperial" ? saved : ""
}

export function getUnits(): Units {
  return storedUnits() || localeUnits()
}

export function isMetric(): boolean {
  return getUnits() === "metric"
}

/** Choose units, or pass "" to go back to the locale's. */
export function setUnits(units: Units | ""): void {
  try {
    if (units) window.localStorage.setItem(KEY, units)
    else window.localStorage.removeItem(KEY)
  } catch {
    /* applied for this page, just not remembered */
  }
  document.dispatchEvent(new Event(UNITS_CHANGE))
}

/** Metres to the reader's distance unit, and its label */
export function distance(meters: number): { value: number; label: string } {
  return isMetric()
    ? { value: meters / 1000, label: "km" }
    : { value: meters / 1609.34, label: "mi" }
}

/** Metres to the reader's elevation unit, and its label */
export function elevation(meters: number): { value: number; label: string } {
  return isMetric()
    ? { value: meters, label: "m" }
    : { value: meters * 3.28084, label: "ft" }
}
