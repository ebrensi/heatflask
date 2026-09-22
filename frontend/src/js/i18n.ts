/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * i18n -- the message catalog, and the code that applies it to the DOM.
 *
 * Every language is bundled rather than fetched, English included. English is
 * the fallback for every key a translation happens to be missing, and a page
 * that had to wait for a network round-trip before it could show any words
 * would flash blank or untranslated text on every load. See CATALOGS below
 * for why the other languages are not split out.
 *
 * Markup carries keys rather than text:
 *
 *   <p data-i18n="tab.info.liveUrlDesc">The map view and ...</p>
 *   <input data-i18n-value="splash.demo" value="Demo" />
 *
 * The English left inline is what shows if the script never runs, and what
 * makes the templates readable to whoever edits them next. en.json is what the
 * app actually displays -- `npm run i18n:check` is what keeps the two honest.
 *
 * A catalog string may contain inline markup: a <kbd>, an icon <i>, a link.
 * That is deliberate, so a translator can move those through the sentence
 * rather than being handed three fragments to reassemble in English order.
 * It is also why this writes innerHTML: the catalogs are files in this repo,
 * never anything a user typed.
 *
 * ../locales/README.md is the rest of it -- adding a language, and the rules
 * a translation has to hold to.
 */

import EN_JSON from "../locales/en.json"
import AM_JSON from "../locales/am.json"
import AR_JSON from "../locales/ar.json"
import BN_JSON from "../locales/bn.json"
import CS_JSON from "../locales/cs.json"
import DE_JSON from "../locales/de.json"
import ES_JSON from "../locales/es.json"
import FA_JSON from "../locales/fa.json"
import FR_JSON from "../locales/fr.json"
import HA_JSON from "../locales/ha.json"
import HI_JSON from "../locales/hi.json"
import ID_JSON from "../locales/id.json"
import IT_JSON from "../locales/it.json"
import JA_JSON from "../locales/ja.json"
import KN_JSON from "../locales/kn.json"
import MR_JSON from "../locales/mr.json"
import NB_JSON from "../locales/nb.json"
import NL_JSON from "../locales/nl.json"
import PL_JSON from "../locales/pl.json"
import PT_BR_JSON from "../locales/pt-BR.json"
import PT_PT_JSON from "../locales/pt-PT.json"
import RU_JSON from "../locales/ru.json"
import SW_JSON from "../locales/sw.json"
import TA_JSON from "../locales/ta.json"
import TE_JSON from "../locales/te.json"
import TH_JSON from "../locales/th.json"
import TI_JSON from "../locales/ti.json"
import UK_JSON from "../locales/uk.json"
import UR_JSON from "../locales/ur.json"
import VI_JSON from "../locales/vi.json"
import ZH_HANS_JSON from "../locales/zh-Hans.json"
import ZH_HANT_JSON from "../locales/zh-Hant.json"

export type Catalog = Record<string, string>

const EN = <Catalog>EN_JSON

/**
 * Every language we ship, catalog and all. Adding one is a line here plus the
 * .json file.
 *
 * All of them are bundled rather than fetched per language. A catalog is a few
 * kB beside a megabyte of map and renderer, so splitting them buys nothing
 * measurable and costs the things that actually show: a round-trip before the
 * page has its words, a failure path when that round-trip does not land, and
 * -- since Parcel resolves an async import of a .json to a bundle id rather
 * than to a URL -- a fight with the bundler. Worth revisiting if this grows to
 * many languages or many times the strings.
 */
const CATALOGS: Record<string, Catalog> = {
  am: <Catalog>AM_JSON,
  ar: <Catalog>AR_JSON,
  bn: <Catalog>BN_JSON,
  cs: <Catalog>CS_JSON,
  de: <Catalog>DE_JSON,
  es: <Catalog>ES_JSON,
  fa: <Catalog>FA_JSON,
  fr: <Catalog>FR_JSON,
  ha: <Catalog>HA_JSON,
  hi: <Catalog>HI_JSON,
  id: <Catalog>ID_JSON,
  it: <Catalog>IT_JSON,
  ja: <Catalog>JA_JSON,
  kn: <Catalog>KN_JSON,
  mr: <Catalog>MR_JSON,
  nb: <Catalog>NB_JSON,
  nl: <Catalog>NL_JSON,
  pl: <Catalog>PL_JSON,
  "pt-BR": <Catalog>PT_BR_JSON,
  "pt-PT": <Catalog>PT_PT_JSON,
  ru: <Catalog>RU_JSON,
  sw: <Catalog>SW_JSON,
  ta: <Catalog>TA_JSON,
  te: <Catalog>TE_JSON,
  th: <Catalog>TH_JSON,
  ti: <Catalog>TI_JSON,
  uk: <Catalog>UK_JSON,
  ur: <Catalog>UR_JSON,
  vi: <Catalog>VI_JSON,
  "zh-Hans": <Catalog>ZH_HANS_JSON,
  "zh-Hant": <Catalog>ZH_HANT_JSON,
}

/**
 * Where a tag goes when it does not name a catalog outright.
 *
 * Chinese needs this: the split is by script, which the region implies but
 * does not say -- zh-TW and zh-HK are written in Traditional, zh-CN and zh-SG
 * in Simplified, and bare zh is conventionally Simplified. Matching on the
 * base language alone would hand a Taiwanese reader the mainland catalog,
 * which is the thing this is here to prevent.
 *
 * Portuguese needs it only to break a tie: both catalogs are real, and
 * somebody asking for plain pt is likelier to be in Brazil.
 *
 * Norwegian has two written standards and a macrolanguage tag over both. The
 * catalog is Bokmål (nb), which most Norwegians write; a browser may send `no`
 * instead, and a Nynorsk (nn) reader reads Bokmål far more easily than
 * English. Neither shares a base subtag with nb, so neither would get there
 * on its own.
 *
 * Slovak goes to Czech for the same reason Nynorsk goes to Bokmål: the two
 * are close enough that a Slovak reader is better off in Czech than English.
 * `in` is the tag ISO withdrew for Indonesian in 1989, which old Android and
 * Java stacks still send.
 *
 * Dari (prs) is Afghan Persian: same script, same written standard near
 * enough, so it goes to fa, and so does pes, the ISO 639-3 code for the
 * Persian of Iran, which a few stacks send instead of fa. swh is 639-3 for
 * Swahili proper. Arabic needs no aliases: the catalog is Modern Standard
 * Arabic, the written language of every ar-XX region, and base-language
 * matching already sends them all to it.
 */
const ALIASES: Record<string, string> = {
  zh: "zh-Hans",
  "zh-cn": "zh-Hans",
  "zh-sg": "zh-Hans",
  "zh-my": "zh-Hans",
  "zh-tw": "zh-Hant",
  "zh-hk": "zh-Hant",
  "zh-mo": "zh-Hant",
  pt: "pt-BR",
  no: "nb",
  nn: "nb",
  sk: "cs",
  in: "id",
  prs: "fa",
  pes: "fa",
  swh: "sw",
}

/**
 * Catalogs written right to left. `dir` goes on <html>, which is all the pages
 * that are only text and tables need. The map page is not only text: it keeps
 * its frame -- sidebar on the left, map controls where they are -- and turns
 * back to RTL only inside the panes, dialogs and pop-ups (css/rtl.css).
 *
 * A list rather than Intl.Locale's textInfo, which Firefox does not have.
 */
const RTL = new Set(["ar", "fa", "ur"])

function isRTL(tag: string): boolean {
  return RTL.has(tag.split("-")[0])
}

/** Language tags a reader can actually be given. */
export const LOCALES: string[] = ["en", ...Object.keys(CATALOGS)]

/** The URL argument, and the localStorage key, that carry a language choice */
const LANG_KEY = "lang"

const DEV = process.env.NODE_ENV !== "production"

let locale = "en"
let catalog: Catalog = EN
let globalParams: Record<string, string | number> = {}

/** The active language tag, for Intl and for anything that asks. */
export function getLocale(): string {
  return locale
}

/*
 * Values that appear in more than one string and belong to no single call
 * site -- the video length Strava accepts, say. Set before applyTranslations.
 */
export function setGlobalParams(p: Record<string, string | number>): void {
  globalParams = { ...globalParams, ...p }
}

const FIELD = /\{(\w+)\}/g

/**
 * The string for `key` in the active language, with {placeholders} filled.
 *
 * An unknown key returns itself rather than an empty string: a stray key is
 * then visible in the UI instead of silently deleting a label.
 */
export function t(
  key: string,
  params?: Record<string, string | number>
): string {
  const template = catalog[key] ?? EN[key]
  if (template === undefined) {
    if (DEV) console.warn(`i18n: no string for "${key}"`)
    return key
  }
  return template.replace(FIELD, (whole, name) => {
    const val = params?.[name] ?? globalParams[name]
    return val === undefined ? whole : String(val)
  })
}

/** Attributes a key can target, written as data-i18n-<attribute>. */
const ATTRS = ["title", "value", "placeholder", "alt", "aria-label"] as const

const SELECTOR = ["[data-i18n]", ...ATTRS.map((a) => `[data-i18n-${a}]`)].join(
  ","
)

/**
 * Translate everything under `root` that carries a key.
 *
 * Call it on whatever was just put into the DOM, and before any code that
 * looks elements up by id inside it: a translated string can carry its own
 * <a id="..."> so the translator controls where in the sentence it falls, and
 * that replaces the element the previous pass left there.
 */
export function applyTranslations(root: ParentNode = document): void {
  const els = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))
  if (root instanceof HTMLElement && root.matches(SELECTOR)) els.unshift(root)

  for (const el of els) {
    const key = el.getAttribute("data-i18n")
    if (key) el.innerHTML = t(key)

    for (const attr of ATTRS) {
      const attrKey = el.getAttribute(`data-i18n-${attr}`)
      if (attrKey) el.setAttribute(attr, t(attrKey))
    }
  }
}

/* localStorage throws rather than no-ops in some privacy modes, and a language
 * we cannot remember is not worth failing a page load over. */
function read(key: string): string {
  try {
    return window.localStorage.getItem(key) || ""
  } catch {
    return ""
  }
}

function store(key: string, val: string): void {
  try {
    window.localStorage.setItem(key, val)
  } catch {
    /* not remembered, still applied for this page */
  }
}

function forget(key: string): void {
  try {
    window.localStorage.removeItem(key)
  } catch {
    /* nothing was remembered in the first place */
  }
}

/**
 * The closest language we ship to a BCP-47 tag, in its canonical spelling, or
 * "" for none.
 *
 * Subtags are dropped one at a time, and at each length the tag is looked for
 * among the catalogs and then among the ALIASES, so zh-Hant-TW finds the
 * zh-Hant catalog by its script and zh-TW finds it by its region. Comparison
 * is case-insensitive throughout: a browser sends "pt-BR" and the catalog is
 * registered as "pt-BR", but neither spelling is guaranteed.
 *
 * What is left over is a reader whose region we have never heard of, in a
 * language we do have -- de-CH, say. Any catalog in that language beats
 * English for them.
 */
function bestMatch(tag: string | null): string {
  if (!tag) return ""
  const parts = tag.toLowerCase().split("-")

  for (let n = parts.length; n > 0; n--) {
    const prefix = parts.slice(0, n).join("-")
    const exact = LOCALES.find((l) => l.toLowerCase() === prefix)
    if (exact) return exact
    if (ALIASES[prefix]) return ALIASES[prefix]
  }

  return LOCALES.find((l) => l.toLowerCase().split("-")[0] === parts[0]) || ""
}

/**
 * ?lang=ja wins, and is remembered -- a link can hand someone the app in their
 * language, and the choice outlives the argument, which it has to: URL.ts
 * rebuilds the query string from the model on every map move, so `lang` is
 * gone from the address bar by the time the map first settles.
 */
function resolveLocale(): string {
  const params = new URLSearchParams(window.location.search)
  const asked = bestMatch(params.get(LANG_KEY))
  if (asked) {
    store(LANG_KEY, asked)
    return asked
  }

  const saved = bestMatch(read(LANG_KEY))
  if (saved) return saved

  for (const tag of navigator.languages || [navigator.language]) {
    const m = bestMatch(tag)
    if (m) return m
  }
  return "en"
}

/** The language the reader chose outright, or "" if they never did. */
export function storedLocale(): string {
  return bestMatch(read(LANG_KEY))
}

/**
 * What to call a language in a menu: its own name for itself, so that whoever
 * is looking for it can read it. Falls back to the tag if the browser has no
 * name for it.
 */
export function localeName(tag: string): string {
  try {
    return new Intl.DisplayNames([tag], { type: "language" }).of(tag) || tag
  } catch {
    return tag
  }
}

/**
 * Switch language, or pass "" to hand the choice back to the browser.
 *
 * It reloads rather than re-translating in place. Half the UI is built from
 * t() at the moment it is rendered -- table rows, tab headers, the controls a
 * SETUP wired up -- so a live switch would mean re-running all of it, and the
 * map view survives a reload anyway: URL.ts keeps it in the address bar.
 */
export function setLocale(tag: string): void {
  const chosen = bestMatch(tag)
  if (chosen) store(LANG_KEY, chosen)
  else forget(LANG_KEY)
  window.location.reload()
}

/**
 * Pick the language. Call this before the first applyTranslations or t() on a
 * page -- which is all it takes, since every catalog is already here.
 */
export function initI18n(): string {
  locale = resolveLocale()

  // English underneath, so a key the translation lacks still says something
  if (locale !== "en") catalog = { ...EN, ...CATALOGS[locale] }

  /* Drives CJK font selection and line breaking, so it matters well beyond
   * being correct markup. */
  document.documentElement.lang = locale
  document.documentElement.dir = isRTL(locale) ? "rtl" : "ltr"
  return locale
}
