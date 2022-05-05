/*
 * URL.js -- Browser URL functionality
 */
import Geohash from "latlon-geohash"
import { nextTask } from "./appUtil"

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

  // Visual parameters
  //  Map
  zoom: ["zoom", "z"],
  lat: ["lat", "x"],
  lng: ["lng", "lon", "y"],
  autozoom: ["autozoom", "az"],
  geohash: ["geohash", "gh"],
  baselayer: ["baselayer", "map", "bl"],
  //  Animation
  tau: ["tau", "timescale"],
  T: ["T", "period"],
  sz: ["sz"],
  paused: ["paused", "pu"],
  shadows: ["sh", "shadows"],
  paths: ["pa", "paths"],
  alpha: ["alpha"],
}

const boolString = (x: boolean): string => (x ? "1" : "0")
const boolVal = (val: string): boolean => {
  return val !== "0" && val != "null" && !!val
}
const str = (v: unknown) => v && String(v)

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
    // Visual parameters
    autozoom: boolString(visual.autozoom),
    tau: str(visual.tau),
    T: str(visual.T),
    sz: str(visual.sz),
    geohash: visual.geohash,
    paused: boolString(visual.paused),
    shadows: boolString(visual.shadows),
    paths: boolString(visual.paths),
    alpha: str(visual.alpha),
    baselayer: visual.baselayer,
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
      qparams.before = +urlParams.before
      qparams.after = +urlParams.after
    } else if (type === "ids") qparams.ids = urlParams.ids
    else if (type === "key") qparams.key = urlParams.key
  }

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
  for (const p of ["zoom", "tau", "T", "sz", "alpha"] as URLParameter[]) {
    if (urlParams[p]) vparams[p] = +urlParams[p]
  }

  // boolean params
  for (const p of ["shadows", "paths", "paused"] as URLParameter[]) {
    if (urlParams[p]) vparams[p] = boolVal(urlParams[p])
  }

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

export function setURLfromQV(qvparams: QVParams) {
  return setURL(QVtoURL(qvparams))
}
