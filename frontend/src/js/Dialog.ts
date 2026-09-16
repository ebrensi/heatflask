/*
 * Dialog -- a small non-modal message window over the map.
 *
 * Replaces leaflet-control-window, which the import progress and the flash
 * messages used. Same shape: a title bar with a close button, and content.
 */

import { t } from "./i18n"

export class Dialog {
  readonly el: HTMLDivElement
  private titleEl: HTMLDivElement
  private contentEl: HTMLDivElement

  constructor(
    parent: HTMLElement,
    opts: { title?: string; content?: string; position?: "top" | "center" } = {}
  ) {
    const el = (this.el = document.createElement("div"))
    el.className = `control-window heatflask-dialog dialog-${
      opts.position || "center"
    }`
    el.hidden = true

    const bar = document.createElement("div")
    bar.className = "titlebar"
    this.titleEl = document.createElement("div")
    this.titleEl.className = "title"
    const close = document.createElement("button")
    close.type = "button"
    close.className = "close"
    close.innerHTML = "&times;"
    close.title = t("common.close")
    close.addEventListener("click", () => this.hide())
    bar.append(this.titleEl, close)

    this.contentEl = document.createElement("div")
    this.contentEl.className = "content"
    el.append(bar, this.contentEl)

    /* keep clicks and drags inside the dialog from reaching the map */
    for (const type of ["click", "pointerdown", "wheel", "dblclick"]) {
      el.addEventListener(type, (e) => e.stopPropagation())
    }

    if (opts.title) this.title(opts.title)
    if (opts.content) this.content(opts.content)
    parent.appendChild(el)
  }

  title(html: string): this {
    this.titleEl.innerHTML = html
    return this
  }

  content(html: string): this {
    this.contentEl.innerHTML = html
    return this
  }

  getContainer(): HTMLElement {
    return this.el
  }

  show(): this {
    this.el.hidden = false
    return this
  }

  hide(): this {
    this.el.hidden = true
    return this
  }
}
