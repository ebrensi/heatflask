/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * Clusters -- markers for activities too small on the screen to be seen.
 *
 * Zoomed out far enough, an activity's path and dots shrink to a speck, or to
 * nothing: a 10 km run is a few pixels across at zoom 7. That is most often
 * met with "Zoom to selection" on and two activities selected far apart --
 * the map zooms out to fit both, and then neither can be seen.
 *
 * So from MAX_ZOOM out, any activity smaller on the screen than
 * MIN_VISIBLE_PX is marked with a bubble, and bubbles closer together than
 * CLUSTER_RADIUS_PX are merged into one. A bubble only says that there are
 * activities here; clicking it zooms to them. The paths and dots are still
 * drawn underneath.
 *
 * Only where the map would otherwise show nothing, though: a tiny activity
 * beside one that is plainly visible gets no bubble, since the bigger one
 * already draws the eye there, and a bubble would only cover it up.
 *
 * Grouping is done in world pixels at the current zoom, over every activity
 * rather than just those in view, so panning never regroups anything; only a
 * zoom does. With a selection, the selected activities are grouped apart from
 * the rest, so a selected one is never lost inside a cluster of others, and
 * the rest are faded, as their paths are.
 *
 * The bubbles are DOM elements, positioned by MapLibre, rather than drawn in
 * GL, so they do not appear in a video capture, which records only the map's
 * canvas.
 */

import { Marker } from "maplibre-gl"

import * as ActivityCollection from "./DotLayer/ActivityCollection"
import { px2lngLat, WORLD_PX } from "./DotLayer/CRS"
import { fitTo } from "./Render"
import { fromMapZoom } from "./MapAPI"

import type { Map as MLMap } from "maplibre-gl"
import type { Activity } from "./DotLayer/Activity"

/** Zoomed in past this (Leaflet's zoom, as the URL has it), there are none */
const MAX_ZOOM = 8

/** An activity whose larger side is fewer CSS px than this gets a bubble */
const MIN_VISIBLE_PX = 10

/** Bubbles whose centres are closer than this, in CSS px, are merged */
const CLUSTER_RADIUS_PX = 32

/** A tiny activity within about this many CSS px of a visible one's track
 * gets no bubble */
const COVERED_PX = 16

/** How far past the viewport to keep markers, as a fraction of its size */
const VIEWPORT_PAD = 0.5

type Cluster = {
  members: Activity[]
  /** centre, in zoom-0 world px */
  x: number
  y: number
  selected: boolean
}

let _map: MLMap
/* keyed by the cluster's first member, size and group, so a bubble whose
 * cluster survives a regrouping is moved rather than rebuilt */
let markers = new Map<string, Marker>()

export function initClusters(map: MLMap): void {
  _map = map
}

/**
 * Regroup and redraw the markers. Called whenever the layer rebuilds for a
 * new view, a new set of activities or a new selection.
 */
export function updateClusters(): void {
  if (!_map) return

  const zoom = fromMapZoom(_map.getZoom())
  const scale = 2 ** zoom // CSS px per zoom-0 world px
  const items = ActivityCollection.itemsArray()
  const anySelected = items.some((A) => A.selected)
  let small: Activity[] = []
  const visible: Activity[] = []
  for (const A of zoom > MAX_ZOOM ? [] : items) {
    if (A.pxBounds.isEmpty()) continue
    const [x0, y0, x1, y1] = A.pxBounds.data
    if (Math.max(x1 - x0, y1 - y0) * scale < MIN_VISIBLE_PX) small.push(A)
    else visible.push(A)
  }
  small = uncovered(small, visible, COVERED_PX / scale)

  const radius = CLUSTER_RADIUS_PX / scale
  const clusters = [
    ...group(
      small.filter((A) => !A.selected),
      radius,
      false
    ),
    ...group(
      small.filter((A) => A.selected),
      radius,
      true
    ),
  ]

  const inView = viewFilter()
  const next = new Map<string, Marker>()
  for (const c of clusters) {
    if (!inView(c.x, c.y)) continue
    const key = `${c.members[0].id}/${c.members.length}/${+c.selected}`
    const [lng, lat] = px2lngLat(c.x, c.y)
    let marker = markers.get(key)
    if (marker) {
      markers.delete(key)
      marker.setLngLat([lng, lat])
    } else {
      marker = new Marker({ element: makeElement() })
        .setLngLat([lng, lat])
        .addTo(_map)
    }
    render(marker.getElement(), c, anySelected && !c.selected)
    next.set(key, marker)
  }

  for (const marker of markers.values()) marker.remove()
  markers = next
}

/**
 * The tiny activities not near any visible activity's track. The tracks are
 * marked on a grid of `cell`-sized squares, and an activity whose centre is
 * in a marked square, or next to one, is covered. The track's points, not its
 * bounds: a long ride's bounds take in a lot of empty map, where a tiny
 * activity still needs its bubble.
 */
function uncovered(
  small: Activity[],
  visible: Activity[],
  cell: number
): Activity[] {
  if (!small.length || !visible.length) return small
  const W = Math.ceil(WORLD_PX / cell) + 2
  const marked = new Set<number>()
  for (const A of visible) {
    const px = A.streams.px
    let last = -1
    for (let i = 0; i < px.length; i += 2) {
      const k = Math.floor(px[i] / cell) * W + Math.floor(px[i + 1] / cell)
      if (k !== last) marked.add((last = k))
    }
  }
  return small.filter((A) => {
    const [x0, y0, x1, y1] = A.pxBounds.data
    const cx = Math.floor((x0 + x1) / 2 / cell)
    const cy = Math.floor((y0 + y1) / 2 / cell)
    for (let gx = cx - 1; gx <= cx + 1; gx++)
      for (let gy = cy - 1; gy <= cy + 1; gy++)
        if (marked.has(gx * W + gy)) return false
    return true
  })
}

/**
 * Greedy single-pass grouping: each activity not yet taken seeds a cluster
 * and takes every other untaken one within `radius` of it. A grid of
 * radius-sized cells means each seed looks at nine cells, not every activity.
 * The order is the collection's, which does not change with the view, so
 * neither does the grouping.
 */
function group(acts: Activity[], radius: number, selected: boolean): Cluster[] {
  const n = acts.length
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)
  const grid = new Map<string, number[]>()
  for (let i = 0; i < n; i++) {
    const [x0, y0, x1, y1] = acts[i].pxBounds.data
    xs[i] = (x0 + x1) / 2
    ys[i] = (y0 + y1) / 2
    const key = `${Math.floor(xs[i] / radius)},${Math.floor(ys[i] / radius)}`
    const cell = grid.get(key)
    if (cell) cell.push(i)
    else grid.set(key, [i])
  }

  const taken = new Uint8Array(n)
  const r2 = radius * radius
  const clusters: Cluster[] = []
  for (let i = 0; i < n; i++) {
    if (taken[i]) continue
    taken[i] = 1
    const members = [acts[i]]
    let sx = xs[i]
    let sy = ys[i]
    const cx = Math.floor(xs[i] / radius)
    const cy = Math.floor(ys[i] / radius)
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        for (const j of grid.get(`${gx},${gy}`) ?? []) {
          if (taken[j]) continue
          const dx = xs[j] - xs[i]
          const dy = ys[j] - ys[i]
          if (dx * dx + dy * dy > r2) continue
          taken[j] = 1
          members.push(acts[j])
          sx += xs[j]
          sy += ys[j]
        }
      }
    }
    const m = members.length
    clusters.push({ members, x: sx / m, y: sy / m, selected })
  }
  return clusters
}

/** Whether a point in world px is near enough the view to need a marker.
 * Zoomed out past one world's width, everything is. */
function viewFilter(): (x: number, y: number) => boolean {
  const b = _map.getBounds()
  const west = ((b.getWest() + 180) / 360) * WORLD_PX
  const east = ((b.getEast() + 180) / 360) * WORLD_PX
  if (east - west >= WORLD_PX / (1 + 2 * VIEWPORT_PAD)) return () => true
  const pad = (east - west) * VIEWPORT_PAD
  const lat2y = (lat: number) => {
    const s = Math.sin((lat * Math.PI) / 180)
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * WORLD_PX
  }
  const north = lat2y(b.getNorth())
  const south = lat2y(b.getSouth())
  const vpad = (south - north) * VIEWPORT_PAD
  return (x, y) => {
    if (y < north - vpad || y > south + vpad) return false
    /* the view can straddle the antimeridian, so test x against each copy of
     * the world it might be in */
    for (const k of [-1, 0, 1]) {
      const wx = x + k * WORLD_PX
      if (wx >= west - pad && wx <= east + pad) return true
    }
    return false
  }
}

function makeElement(): HTMLButtonElement {
  const el = document.createElement("button")
  el.type = "button"
  el.className = "cluster-marker"
  el.addEventListener("click", (e) => {
    /* not also a click on the map, which would close the sidebar */
    e.stopPropagation()
    const members = clusterOf.get(el)
    if (members) fitTo(ActivityCollection.boundsOf(members))
  })
  return el
}

/* what each marker element currently stands for */
const clusterOf = new WeakMap<HTMLElement, Activity[]>()

function render(el: HTMLElement, c: Cluster, faded: boolean): void {
  clusterOf.set(el, c.members)
  el.classList.toggle("selected", c.selected)
  el.classList.toggle("faded", faded)
}
