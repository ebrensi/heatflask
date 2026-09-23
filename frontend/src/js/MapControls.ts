/*
 * Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * This file is part of Heatflask. See /LICENSE for terms.
 */
/*
 * MapControls -- small MapLibre controls: a button, and the basemap/terrain
 * picker.
 */

import { icon } from "./Icons"
import { baselayers } from "./MapAPI"
import { t } from "./i18n"

import type { IControl, Map as MLMap } from "maplibre-gl"
import type { State } from "./Model"

/** A single map button whose icon and title the caller keeps up to date. */
export class ButtonControl implements IControl {
  container: HTMLDivElement
  button: HTMLButtonElement

  constructor(className: string, onClick: (e: MouseEvent) => void) {
    this.container = document.createElement("div")
    this.container.className = `maplibregl-ctrl maplibregl-ctrl-group ${className}`
    this.button = document.createElement("button")
    this.button.type = "button"
    this.button.addEventListener("click", (e) => {
      e.stopPropagation()
      onClick(e)
    })
    this.container.appendChild(this.button)
  }

  set(iconHTML: string, title: string): void {
    this.button.innerHTML = iconHTML
    this.button.title = title
    this.button.setAttribute("aria-label", title)
  }

  onAdd(): HTMLElement {
    return this.container
  }

  onRemove(): void {
    this.container.remove()
  }
}

/**
 * The basemap list, and the 3D terrain and globe switches. Replaces Leaflet's
 * Control.Layers: a button that opens a panel of radio buttons.
 */
export class LayerPicker implements IControl {
  private container: HTMLDivElement

  constructor(private state: State) {}

  onAdd(map: MLMap): HTMLElement {
    const { visual } = this.state
    const c = (this.container = document.createElement("div"))
    c.className = "maplibregl-ctrl maplibregl-ctrl-group layer-picker"

    const toggle = document.createElement("button")
    toggle.type = "button"
    toggle.innerHTML = icon("stack")
    toggle.title = t("map.basemapAndTerrain")
    c.appendChild(toggle)

    const panel = document.createElement("div")
    panel.className = "layer-picker-panel"
    panel.hidden = true
    c.appendChild(panel)

    const switches = document.createElement("div")
    switches.className = "layer-picker-switches"
    panel.appendChild(switches)

    const terrainLabel = document.createElement("label")
    const terrainBox = document.createElement("input")
    terrainBox.type = "checkbox"
    terrainBox.checked = !!visual.terrain
    terrainBox.addEventListener(
      "change",
      () => (visual.terrain = terrainBox.checked)
    )
    terrainLabel.append(terrainBox, " 3D terrain")
    switches.appendChild(terrainLabel)

    const globeLabel = document.createElement("label")
    const globeBox = document.createElement("input")
    globeBox.type = "checkbox"
    globeBox.checked = !!visual.globe
    globeBox.addEventListener("change", () => (visual.globe = globeBox.checked))
    globeLabel.append(globeBox, " Globe")
    switches.appendChild(globeLabel)

    const list = document.createElement("div")
    list.className = "layer-picker-list"
    for (const [name, basemap] of Object.entries(baselayers)) {
      const label = document.createElement("label")
      const radio = document.createElement("input")
      radio.type = "radio"
      radio.name = "baselayer"
      radio.value = name
      radio.checked = name === visual.baselayer
      radio.addEventListener("change", () => {
        if (radio.checked) visual.baselayer = name
      })
      label.append(radio, ` ${basemap.label}`)
      list.appendChild(label)
    }
    panel.appendChild(list)

    toggle.addEventListener("click", (e) => {
      e.stopPropagation()
      panel.hidden = !panel.hidden
    })
    panel.addEventListener("click", (e) => e.stopPropagation())
    map.on("click", () => (panel.hidden = true))

    visual.onChange(
      "terrain",
      (on: boolean) => (terrainBox.checked = !!on),
      false
    )
    visual.onChange("globe", (on: boolean) => (globeBox.checked = !!on), false)
    return c
  }

  onRemove(): void {
    this.container.remove()
  }
}
