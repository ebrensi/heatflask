/*
 * Small WebGL2 helpers for HeatflaskLayer.
 */

export type Mat4 = Float64Array | Float32Array | number[]

export function compileProgram(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string
): WebGLProgram {
  const program = gl.createProgram()
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertexSource],
    [gl.FRAGMENT_SHADER, fragmentSource],
  ] as [number, string][]) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`shader compile failed: ${log}`)
    }
    gl.attachShader(program, shader)
    // flagged for deletion; freed when the program is
    gl.deleteShader(shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`program link failed: ${gl.getProgramInfoLog(program)}`)
  }
  return program
}

export function uniformLocations<K extends string>(
  gl: WebGL2RenderingContext,
  program: WebGLProgram,
  names: readonly K[]
): Record<K, WebGLUniformLocation> {
  const out = <Record<K, WebGLUniformLocation>>{}
  for (const name of names) out[name] = gl.getUniformLocation(program, name)
  return out
}

/** out = a * b, for column-major 4x4 matrices. Computed in float64: the
 * model matrix carries a translation that float32 would round away at high
 * zoom. */
export function multiply(out: Float64Array, a: Mat4, b: Mat4): Float64Array {
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k]
      out[col * 4 + row] = sum
    }
  }
  return out
}

/* Parsing CSS colours: let the browser do it, once per distinct string. */
const colorCache = new Map<string, number>()
let colorCtx: CanvasRenderingContext2D

/**
 * A CSS colour as a little-endian packed RGBA uint32, which is what a
 * Uint32Array over the vertex buffer needs so that the bytes land as
 * r, g, b, a. Alpha is multiplied in from `alpha` (0..1).
 */
export function packColor(css: string, alpha = 1): number {
  let rgb = colorCache.get(css)
  if (rgb === undefined) {
    if (!colorCtx) {
      const c = document.createElement("canvas")
      c.width = c.height = 1
      colorCtx = c.getContext("2d", { willReadFrequently: true })
    }
    colorCtx.clearRect(0, 0, 1, 1)
    colorCtx.fillStyle = "#000"
    colorCtx.fillStyle = css
    colorCtx.fillRect(0, 0, 1, 1)
    const [r, g, b] = colorCtx.getImageData(0, 0, 1, 1).data
    rgb = r | (g << 8) | (b << 16)
    colorCache.set(css, rgb)
  }
  const a = Math.max(0, Math.min(255, Math.round(alpha * 255)))
  return (rgb | (a << 24)) >>> 0
}

/** A growable interleaved vertex array: float32 slots and a uint32 view over
 * the same bytes, for packing colours into a float-sized slot. */
export class VertexArray {
  buffer: ArrayBuffer
  f32: Float32Array
  u32: Uint32Array

  constructor(slots = 4096) {
    this.alloc(slots)
  }

  private alloc(slots: number): void {
    this.buffer = new ArrayBuffer(slots * 4)
    this.f32 = new Float32Array(this.buffer)
    this.u32 = new Uint32Array(this.buffer)
  }

  /** Make room for `slots` float slots, keeping the first `keep` of them */
  reserve(slots: number, keep = 0): void {
    if (slots <= this.f32.length) return
    const old = this.f32
    this.alloc(Math.max(slots, old.length * 2))
    if (keep) this.f32.set(old.subarray(0, keep))
  }
}
