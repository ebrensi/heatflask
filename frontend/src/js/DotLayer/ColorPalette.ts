/*
 * From "Making annoying rainbows in javascript"
 * A tutorial by jim bumgardner
 */
function makeColorGradient(
  freq1: number,
  freq2: number,
  freq3: number,
  phase1: number,
  phase2: number,
  phase3: number,
  center: number,
  width: number,
  len: number
) {
  const palette: string[] = new Array(len)

  if (center == undefined) center = 128
  if (width == undefined) width = 127
  if (len == undefined) len = 50

  for (let i = 0; i < len; ++i) {
    const r = Math.round(Math.sin(freq1 * i + phase1) * width + center)
    const g = Math.round(Math.sin(freq2 * i + phase2) * width + center)
    const b = Math.round(Math.sin(freq3 * i + phase3) * width + center)

    palette[i] = `rgb(${r},${g},${b})`
    // palette[i] = `#${r.toString(16)}${g.toString(16)}${b.toString(16)}`
  }
  return palette
}

/**
 * `n` colours from the gradient, the i-th going to the i-th activity.
 *
 * The gradient has a period of `steps` items whatever `n` is -- `n` is only
 * the length of the array -- so the eleventh activity gets the first colour
 * again. Which activity gets which is therefore a function of its index, and
 * the only way to change one used to be to change the query, since that
 * renumbers everything.
 *
 * `rotation` turns the whole cycle instead. It is an angle in degrees, added
 * equally to all three channels, so 360 comes back to where it started and
 * anything between puts every activity on a different colour while keeping
 * them the same distance apart.
 */
export function makePalette(n: number, rotation = 0) {
  const center = 128
  const width = 127
  const steps = 10
  const freq = (2 * Math.PI) / steps
  const phase = (2 * Math.PI * rotation) / 360
  return makeColorGradient(
    freq,
    freq,
    freq,
    phase,
    2 + phase,
    4 + phase,
    center,
    width,
    n
  )
}
