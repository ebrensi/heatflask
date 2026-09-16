/*
 * IconAtlas -- the activity-type icons, rasterised into one texture.
 *
 * The dots are drawn as GL points, so to draw an icon instead of a disc the
 * fragment shader needs the icon as pixels. The icons are an icon font
 * (icomoon-heatflask), and a font cannot be sampled in a shader, so every
 * glyph is drawn once into a grid on a canvas, which is uploaded as a single
 * texture. A dot then reads one cell of it.
 *
 * The glyph is white on transparent: the shader tints it with the activity's
 * own colour, exactly as it tints a disc today.
 *
 * Which character belongs to which class lives in the stylesheet, as
 * `.hf-running:before { content: "\e9xx" }`, so it is read back from the
 * stylesheet rather than duplicated here -- a new or changed icon needs no
 * change in this file.
 */

import { activity_types, activity_icon_class } from "./Strava"
import type { ActivityType } from "./Strava"

const FONT_FAMILY = '"icomoon-heatflask"'

/** Side of one cell, in px. Icons are line art, so this is plenty. */
export const CELL = 64

/** The glyph is drawn at this fraction of the cell, which leaves a margin
 * for the outline a selected dot draws around it, and keeps neighbouring
 * cells from bleeding into each other in the smaller mipmaps. */
const GLYPH_FRACTION = 0.68

const COLS = 8

export type IconAtlas = {
  canvas: HTMLCanvasElement
  /** cells across, cells down */
  grid: [number, number]
  /** activity type -> cell index, left to right, top to bottom */
  cell: Map<ActivityType, number>
}

/** The character an icon class draws, from the stylesheet */
function glyphOf(cls: string): string {
  const el = document.createElement("i")
  el.className = cls
  el.style.position = "absolute"
  el.style.visibility = "hidden"
  document.body.appendChild(el)
  const content = getComputedStyle(el, "::before").content
  el.remove()

  /* "\e9a3" reaches us as a quoted string, already unescaped by the browser;
   * "none" means the rule didn't match anything */
  const m = /^["'](.*)["']$/.exec(content)
  return m ? m[1] : ""
}

let building: Promise<IconAtlas> | undefined

/** Build the atlas, once. Later calls get the same one. */
export function iconAtlas(): Promise<IconAtlas> {
  if (!building) building = build()
  return building
}

async function build(): Promise<IconAtlas> {
  /* Rasterising before the font arrives gives a canvas of tofu boxes */
  await document.fonts.load(`${CELL}px ${FONT_FAMILY}`)

  /* One cell per distinct glyph, not per type: many types share an icon
   * (the skis, say), and a type we have no icon for falls back to the
   * same one as every other unknown type. */
  const cellOf = new Map<string, number>()
  const cell = new Map<ActivityType, number>()
  const glyphs: string[] = []

  for (const atype of activity_types) {
    const glyph = glyphOf(activity_icon_class(atype))
    if (!glyph) continue
    let i = cellOf.get(glyph)
    if (i === undefined) {
      i = glyphs.length
      glyphs.push(glyph)
      cellOf.set(glyph, i)
    }
    cell.set(atype, i)
  }

  const cols = Math.min(COLS, Math.max(1, glyphs.length))
  const rows = Math.max(1, Math.ceil(glyphs.length / cols))

  const canvas = document.createElement("canvas")
  canvas.width = cols * CELL
  canvas.height = rows * CELL
  const ctx = canvas.getContext("2d")

  ctx.font = `${Math.round(CELL * GLYPH_FRACTION)}px ${FONT_FAMILY}`
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "#fff"

  glyphs.forEach((glyph, i) => {
    const x = (i % cols) * CELL + CELL / 2
    const y = Math.floor(i / cols) * CELL + CELL / 2
    ctx.fillText(glyph, x, y)
  })

  return { canvas, grid: [cols, rows], cell }
}
