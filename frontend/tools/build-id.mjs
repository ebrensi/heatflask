#!/usr/bin/env node
/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * Name the frontend build by what it was built from: write dist/BUILD_ID, a
 * hash of the frontend's source. The backend hands it to the page, and an
 * open page offers a reload when /version reports a different one (see
 * src/js/UpdateCheck.ts) -- so a deploy that touched only the backend does
 * not ask anyone to reload.
 *
 * It hashes the source rather than the build because Parcel's output is not
 * reproducible: the same source can be split into shared bundles differently,
 * and named differently, from one build to the next.
 *
 * The `version` fields are left out of package.json and package-lock.json.
 * Nothing in the bundle reads them, and a release bumps them whether or not
 * the frontend changed.
 */

import { createHash } from "node:crypto"
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"

const root = join(import.meta.dirname, "..")

// Everything Parcel reads from outside node_modules
const inputs = [
  ".parcelrc",
  "tsconfig.json",
  "package.json",
  "package-lock.json",
]
for (const entry of readdirSync(join(root, "src"), {
  recursive: true,
  withFileTypes: true,
})) {
  if (entry.isFile())
    inputs.push(relative(root, join(entry.parentPath, entry.name)))
}
inputs.sort()

function contents(path) {
  const bytes = readFileSync(join(root, path))
  if (path !== "package.json" && path !== "package-lock.json") return bytes
  const json = JSON.parse(bytes)
  delete json.version
  if (json.packages?.[""]) delete json.packages[""].version
  return JSON.stringify(json)
}

const hash = createHash("sha256")
for (const path of inputs) {
  const bytes = contents(path)
  hash.update(`${path}\0${bytes.length}\0`)
  hash.update(bytes)
}
const id = hash.digest("hex").slice(0, 12)

writeFileSync(join(root, "dist", "BUILD_ID"), id + "\n")
console.log(`frontend build ${id}`)
