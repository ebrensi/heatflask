/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/* Here is where we define an API for a custom set of icons from icomoon */

export function icon(name: string, cls = ""): string {
  return `<i class="hf-${name} ${cls}"></i>`
}
