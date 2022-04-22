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

export function makePalette(n: number) {
  const center = 128
  const width = 127
  const steps = 10
  const freq = (2 * Math.PI) / steps
  return makeColorGradient(freq, freq, freq, 0, 2, 4, center, width, n)
}
