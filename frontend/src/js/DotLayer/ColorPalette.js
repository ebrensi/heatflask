/*
 * From "Making annoying rainbows in javascript"
 * A tutorial by jim bumgardner
*/
function makeColorGradient(
  freq1,
  freq2,
  freq3,
  phase1,
  phase2,
  phase3,
  center,
  width,
  len
) {
  let palette = new Array(len)

  if (center == undefined) center = 128
  if (width == undefined) width = 127
  if (len == undefined) len = 50

  for (let i = 0; i < len; ++i) {
    let r = Math.round(Math.sin(freq1 * i + phase1) * width + center),
      g = Math.round(Math.sin(freq2 * i + phase2) * width + center),
      b = Math.round(Math.sin(freq3 * i + phase3) * width + center)

    palette[i] = `rgb(${r},${g},${b})`
    // palette[i] = `#${r.toString(16)}${g.toString(16)}${b.toString(16)}`
  }
  return palette
}

export function makePalette(n) {
  const center = 128,
    width = 127,
    steps = 10,
    freq = (2 * Math.PI) / steps
  return makeColorGradient(freq, freq, freq, 0, 2, 4, center, width, n)
}
