#!/usr/bin/env node
/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * Keep the catalogs and the source honest about each other.
 *
 * Against en.json, which is the source of truth:
 *
 *   missing   a key the source asks for that en.json has no string for; the
 *             UI would show the raw key
 *   stale     inline English in a template that has drifted from the
 *             catalog's; whoever edited the template did not edit the string
 *   unused    a string in en.json that appears nowhere in the source; dead
 *             weight a translator would otherwise be paid to translate
 *
 * And against each translation:
 *
 *   broken    a key en.json does not have, or a string that has lost a
 *             {field} or mangled the inline markup. Either one reaches the
 *             reader as a literal "{count}" or as broken HTML, and neither is
 *             visible to whoever wrote the translation.
 *
 * A translation is allowed to be incomplete -- a key it has not got to falls
 * back to English -- so that is reported, not failed.
 *
 * Run with `npm run i18n:check`.
 */

import { readFileSync, readdirSync, statSync } from "fs"
import { join, relative } from "path"
import { fileURLToPath } from "url"

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const SRC = join(ROOT, "src")
const LOCALES = join(SRC, "locales")

/** Attributes a key can target; mirrors ATTRS in src/js/i18n.ts */
const ATTRS = ["title", "value", "placeholder", "alt", "aria-label"]

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name.startsWith(".")) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...walk(path))
    else if (/\.(ts|js|html)$/.test(path)) out.push(path)
  }
  return out
}

const catalog = JSON.parse(readFileSync(join(LOCALES, "en.json"), "utf8"))
const keys = Object.keys(catalog)
/* The first segment of every key, so a dotted string literal elsewhere in the
 * source can be told apart from one of ours without guessing. */
const namespaces = new Set(keys.map((k) => k.split(".")[0]))

/* i18n.ts is the runtime, not a consumer: the keys in its doc comment are
 * illustrations, and the generated icon demo has no UI text in it. */
const files = walk(SRC).filter(
  (f) => !f.includes("icon-demo") && !f.endsWith("js/i18n.ts")
)

const missing = new Set()
const stale = []

function check(key, where) {
  if (!(key in catalog)) missing.add(`${key}  (${where})`)
}

/* Markup whitespace is not significant, and the templates are prettier-wrapped
 * while the catalog is one line per string, so compare them collapsed -- along
 * with the space prettier leaves before a wrapped tag's own ">". */
const flat = (s) => s.replace(/\s+/g, " ").replace(/\s+>/g, ">").trim()

for (const file of files) {
  const where = relative(ROOT, file)
  const text = readFileSync(file, "utf8")

  /* t("key"), in any quote */
  for (const m of text.matchAll(/\bt\(\s*["'`]([\w.]+)["'`]/g)) check(m[1], where)

  /* Keys chosen in an expression -- t(paused ? "a" : "b"), titleKey: "c".
   * A dotted lowercase literal whose first segment names a catalog namespace
   * is one of ours; "query.quantity:value" and "./i18n" are not. */
  for (const m of text.matchAll(/["'`]([a-z]\w*(?:\.\w+)+)["'`]/g)) {
    if (namespaces.has(m[1].split(".")[0])) check(m[1], where)
  }

  /* data-i18n and data-i18n-<attr>, in templates and in the tab headers that
   * Sidebar builds as HTML strings */
  for (const m of text.matchAll(/\bdata-i18n="([\w.]+)"/g)) check(m[1], where)
  for (const attr of ATTRS) {
    const re = new RegExp(`\\bdata-i18n-${attr}="([\\w.]+)"`, "g")
    for (const m of text.matchAll(re)) check(m[1], where)
  }

  /* The inline English against the catalog's. A string carrying a {field}
   * cannot match its fallback by construction -- the template shows a real
   * value where the catalog shows the field -- so those are left alone. */
  for (const m of text.matchAll(
    /<(\w+)[^>]*\bdata-i18n="([\w.]+)"[^>]*>([\s\S]*?)<\/\1\s*>/g
  )) {
    const [, , key, inline] = m
    if (!(key in catalog) || /\{\w+\}/.test(catalog[key])) continue
    if (flat(catalog[key]) !== flat(inline)) {
      stale.push(
        `${key}  (${where})\n    inline:  ${flat(inline)}\n    catalog: ${flat(catalog[key])}`
      )
    }
  }
}

/* A key composed at runtime never appears whole in the source. Name it in a
 * comment beside the code that builds it and it counts as used. */
const haystack = files.map((f) => readFileSync(f, "utf8")).join("\n")
const unused = keys.filter((k) => !haystack.includes(k))

/* ---- the translations ---- */

const fieldsOf = (s) => (s.match(/\{\w+\}/g) || []).sort()
const tagsOf = (s) => (s.match(/<[^>]+>/g) || []).sort()
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

const broken = []
const incomplete = []

for (const file of readdirSync(LOCALES)) {
  if (!file.endsWith(".json") || file === "en.json") continue
  const lang = file.slice(0, -5)
  const tr = JSON.parse(readFileSync(join(LOCALES, file), "utf8"))

  const absent = keys.filter((k) => !(k in tr))
  if (absent.length) {
    incomplete.push(`${lang}: ${absent.length} of ${keys.length} still English`)
  }

  for (const [key, value] of Object.entries(tr)) {
    if (!(key in catalog)) {
      broken.push(`${lang}  ${key}: no such key in en.json`)
      continue
    }
    if (typeof value !== "string") {
      broken.push(`${lang}  ${key}: not a string`)
      continue
    }
    if (!same(fieldsOf(value), fieldsOf(catalog[key]))) {
      broken.push(
        `${lang}  ${key}\n    fields: ${JSON.stringify(fieldsOf(value))}\n    en:     ${JSON.stringify(fieldsOf(catalog[key]))}`
      )
    }
    if (!same(tagsOf(value), tagsOf(catalog[key]))) {
      broken.push(
        `${lang}  ${key}\n    markup: ${JSON.stringify(tagsOf(value))}\n    en:     ${JSON.stringify(tagsOf(catalog[key]))}`
      )
    }
  }
}

const report = (label, list) => {
  if (!list.length) return
  console.log(`\n${label} (${list.length}):`)
  for (const line of list) console.log(`  ${line}`)
}

report("MISSING from en.json", [...missing])
report("STALE inline English", stale)
report("UNUSED in en.json", unused)
report("BROKEN translations", broken)
report("INCOMPLETE (allowed: these keys fall back to English)", incomplete)

const langs = readdirSync(LOCALES).filter((f) => f.endsWith(".json")).length

if (missing.size || stale.length || unused.length || broken.length) {
  console.log(`\n${keys.length} strings in ${langs} languages; fix the above.`)
  process.exit(1)
}
console.log(`\n${keys.length} strings in ${langs} languages, all in sync.`)
