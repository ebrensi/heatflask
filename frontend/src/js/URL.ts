/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * URL.js -- Browser URL functionality
 */
import Geohash from "latlon-geohash"
import { nextTask } from "./appUtil"
import { STYLE_PARAMS, hasSavedStyle } from "./MapDefaults"
import type { Live } from "./DataBinding"

import {
  QueryParameters,
  DefaultQuery,
  VisualParameters,
  DefaultVisual,
  URLParameters,
} from "./Model"

type URLParameter = keyof URLParameters

/**
 * Reverse-mapping of all the possible URL argument names to their
 * associated paramters.
 */
const urlArgNames: Record<URLParameter, string[]> = {
  // Query parameters
  after: ["after", "start", "date1", "a"],
  before: ["before", "end", "date2", "b"],
  days: ["days", "preset", "d"],
  limit: ["limit", "n"],
  ids: ["id", "ids"],
  key: ["key"],
  userid: ["user", "userid"],
  sport: ["sport", "sports", "st"],
  nosport: ["nosport"],

  // Visual parameters
  //  Map
  zoom: ["zoom", "z"],
  lat: ["lat", "x"],
  lng: ["lng", "lon", "y"],
  autozoom: ["autozoom", "az"],
  geohash: ["geohash", "gh"],
  baselayer: ["baselayer", "map", "bl"],
  pitch: ["pitch", "pi"],
  bearing: ["bearing", "be"],
  terrain: ["terrain", "3d"],
  //  Animation
  tau: ["tau", "timescale"],
  T: ["T", "period"],
  sz: ["sz"],
  paused: ["paused", "pu"],
  pw: ["pw", "pathwidth"],
  cr: ["cr", "colors"],
  shadows: ["sh", "shadows"],
  paths: ["pa", "paths"],
  alpha: ["alpha"],
}

const boolString = (x: boolean): string => (x ? "1" : "0")
const boolVal = (val: string): boolean => {
  return val !== "0" && val != "null" && !!val
}
const str = (v: unknown) => v && String(v)
/** str() drops a zero, which for path width is a real setting: paths off */
const numStr = (v: number): string => (v === undefined ? undefined : String(v))

/*
 * Convert Query and Visual Parameters to URL parameters
 */
type QVParams = {
  visual: VisualParameters
  query: QueryParameters
}

function QVtoURL({ query, visual }: QVParams): URLParameters {
  const qtype = query.type
  const urlparams: URLParameters = {
    after: str(query.after),
    before: str(query.before),
    days: qtype === "days" ? str(query.quantity) : undefined,
    limit: qtype === "activities" ? str(query.quantity) : undefined,
    ids: undefined,
    key: query.key,
    userid: str(query.userid),
    sport: query.sport || undefined,
    nosport: query.nosport || undefined,
    // Visual parameters
    autozoom: boolString(visual.autozoom),
    tau: str(visual.tau),
    T: str(visual.T),
    sz: str(visual.sz),
    geohash: visual.geohash,
    paused: boolString(visual.paused),
    pw: numStr(visual.pw),
    cr: numStr(visual.cr),
    shadows: boolString(visual.shadows),
    alpha: str(visual.alpha),
    baselayer: visual.baselayer,
    pitch: str(visual.pitch),
    bearing: str(visual.bearing),
    terrain: boolString(visual.terrain),
  }
  return urlparams
}

export const DefaultURL: URLParameters = QVtoURL({
  query: DefaultQuery,
  visual: DefaultVisual,
})

/**
 * The parameter name for a given URL argument
 */
const argname: URLParameters = {}
const paramLookup: Record<string, URLParameter> = {}
let param: URLParameter
for (param in urlArgNames) {
  const argnames = urlArgNames[param]
  argname[param] = argnames[0]
  for (const name of argnames) {
    paramLookup[name] = param
  }
}

/**
 * A date from a link, as epoch seconds. This app writes epoch seconds, but an
 * older build wrote the date input's "2026-09-01" straight through, and
 * people type dates by hand.
 */
function toEpoch(val?: string): number | undefined {
  if (!val) return undefined
  if (/^\d+$/.test(val)) return +val
  const ms = Date.parse(val)
  return isNaN(ms) ? undefined : Math.round(ms / 1000)
}

export function parseURL(urlString: string) {
  /* parse parameters from the current url */
  const urlParams: URLParameters = {}
  const url = new URL(urlString)

  if (url.hash) {
    urlParams.geohash = url.hash.slice(1)
  }

  for (const [urlArg, value] of url.searchParams) {
    const param = paramLookup[urlArg]
    if (param) {
      urlParams[param] = <string>value
    } else {
      console.log(`unknown URL arg ${urlArg}=${value}`)
    }
  }

  /*
   * ***  Construct Query from URL args  ***
   */
  const type = urlParams.key
    ? "key"
    : urlParams.ids
    ? "ids"
    : urlParams.after || urlParams.before
    ? "dates"
    : urlParams.days
    ? "days"
    : urlParams.limit
    ? "activities"
    : undefined

  const qparams: QueryParameters = {}
  if (type) {
    qparams.type = type

    if (type === "days" && urlParams.days) qparams.quantity = +urlParams.days
    else if (type === "activities" && urlParams.limit)
      qparams.quantity = +urlParams.limit
    else if (type === "dates") {
      qparams.before = toEpoch(urlParams.before)
      qparams.after = toEpoch(urlParams.after)
    } else if (type === "ids") qparams.ids = urlParams.ids
    else if (type === "key") qparams.key = urlParams.key
  }

  /* The sport filter goes with any query type. It is one list or the other;
   * a link carrying both means the inclusive one. */
  if (urlParams.sport) qparams.sport = urlParams.sport
  else if (urlParams.nosport) qparams.nosport = urlParams.nosport

  console.log(`qparams`, qparams)
  /*
   * This will give us the endpoint name of the current url,
   *  which is the target-user's id or "global"
   *  Example:  https://heatflask.com/1324531?bar=2
   *                 =>  endpoint = "1324531"
   */
  const endpoint = window.location.pathname.substring(1)
  qparams.userid = +endpoint

  /*
   * *** Construct Visual from URL args ***
   */

  const vparams: VisualParameters = {}

  if (urlParams.lat && urlParams.lng) {
    vparams.center = { lat: +urlParams.lat, lng: +urlParams.lng }
  }

  // string params
  for (const p of ["baselayer"] as URLParameter[]) {
    if (urlParams[p]) vparams[p] = urlParams[p]
  }

  // numerical params
  for (const p of [
    "zoom",
    "tau",
    "T",
    "sz",
    "alpha",
    "pitch",
    "bearing",
    "pw",
    "cr",
  ] as URLParameter[]) {
    if (urlParams[p]) vparams[p] = +urlParams[p]
  }

  // boolean params
  for (const p of ["paused", "terrain", "shadows"] as URLParameter[]) {
    if (urlParams[p]) vparams[p] = boolVal(urlParams[p])
  }

  /* Paths were on or off before they had a width. An old link that turned
   * them off means a width of zero; one that turned them on means the
   * default width, which is what we already have. */
  if (urlParams.paths && !urlParams.pw && !boolVal(urlParams.paths))
    vparams.pw = 0

  // GeoHash takes precedence over lat, lng if both are there
  if (urlParams.geohash) {
    const gh = urlParams.geohash
    let ghObj: { lat: number; lon: number }
    try {
      ghObj = Geohash.decode(gh)
    } catch (e) {
      console.log(`can't decode geohash ${gh}`)
    }

    if (ghObj) {
      vparams.center = { lat: ghObj.lat, lng: ghObj.lon }
      vparams.zoom = gh.length
      vparams.geohash = gh
      vparams.autozoom = false
    }
  }

  return { query: qparams, visual: <VisualParameters>vparams, url: urlParams }
}

export function toString(urlParams: URLParameters): string {
  const currentURL = document.location
  const url = new URL(`${currentURL.origin}${currentURL.pathname}`)

  // urlArgs is a mapping that contains what will be the url query string
  const urlArgs = url.searchParams

  // put geohash in the url if autozoom is not enabled
  if (!boolVal(urlParams.autozoom)) {
    url.hash = urlParams.geohash
    delete urlParams.autozoom
  }

  // Filter out any paramters that are equal to their defaults
  //  or not present
  for (const [param, val] of Object.entries(urlParams) as [
    URLParameter,
    string
  ][]) {
    if (
      param !== "userid" &&
      param !== "geohash" &&
      val &&
      DefaultURL[param] !== val
    ) {
      urlArgs.set(argname[param], val)
    }
  }

  /* A link that sets no style gets the saved defaults of whoever opens it --
   * this reader included, on a reload. So if everything here is at the
   * built-in defaults and this reader has saved some, say one of them out
   * loud, or reloading would swap the map they are looking at for their
   * saved one. */
  if (
    hasSavedStyle() &&
    urlParams.baselayer &&
    !STYLE_PARAMS.some((p) => urlArgs.has(argname[p]))
  )
    urlArgs.set(argname.baselayer, urlParams.baselayer)

  return url.toString()
}

async function setURL(url: URLParameters) {
  await nextTask()
  const currentURL = document.location.toString()
  const newURL = toString(url)

  if (newURL !== currentURL) {
    window.history.replaceState("", "", newURL)
  }
}

function setURLfromQV(qvparams: QVParams) {
  return setURL(QVtoURL(qvparams))
}

/** Everything QVtoURL reads, and so everything the address bar depends on */
const URL_VISUAL: (keyof VisualParameters)[] = [
  "autozoom",
  "geohash",
  "pitch",
  "bearing",
  "baselayer",
  "terrain",
  "tau",
  "T",
  "sz",
  "alpha",
  "pw",
  "cr",
  "shadows",
  "paused",
]
const URL_QUERY: (keyof QueryParameters)[] = [
  "type",
  "quantity",
  "after",
  "before",
  "key",
  "userid",
  "sport",
  "nosport",
]

/**
 * Keep the address bar in step with the model. This is the only thing that
 * writes the URL: whatever changes a parameter -- a dial, the map moving, a
 * query run -- changes the model, and the URL follows from here. It used to be
 * written from wherever someone remembered to, which is how the dials came to
 * leave it stale until the map next moved.
 *
 * A map move changes several parameters at once; they are written once.
 */
export function bindURL({
  visual,
  query,
}: {
  visual: Live<VisualParameters>
  query: Live<QueryParameters>
}): void {
  let pending = false
  const update = () => {
    if (pending) return
    pending = true
    queueMicrotask(() => {
      pending = false
      setURLfromQV({ visual, query })
    })
  }
  for (const p of URL_VISUAL) visual.onChange(p, update, false)
  for (const p of URL_QUERY) query.onChange(p, update, false)
}
