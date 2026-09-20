/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/**
 * Some declarations to keep TypeScript from complaining about
 *  Parcel URL schemes
 */

declare module "bundle-text:*" {
  const value: string
  export default value
}

declare module "url:*" {
  const value: string
  export default value
}
