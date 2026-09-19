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

/* The constants EXT_disjoint_timer_query_webgl2 adds; TypeScript's DOM types
 * do not have it. */
type TimerQueryExt = { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number }

/**
 * GPU time spent in labelled stretches of GL calls, for the dev readout.
 *
 * JavaScript's clock only times issuing the calls; the GPU runs them later.
 * This asks the GPU itself, with EXT_disjoint_timer_query_webgl2, where the
 * browser exposes it: not every Chrome platform does, and Firefox only behind
 * a pref. Results come back a frame or more late, so they are gathered as
 * they arrive and summed by label until taken. Timer queries cannot overlap,
 * so neither can the stretches.
 */
export class GpuTimer {
  private ext: TimerQueryExt | null
  private spare: WebGLQuery[] = []
  private pending: { query: WebGLQuery; label: string }[] = []
  private open = false
  private totals: Record<string, number> = {}

  constructor(private gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2")
  }

  get available(): boolean {
    return !!this.ext
  }

  begin(label: string): void {
    if (!this.ext || this.open) return
    const query = this.spare.pop() ?? this.gl.createQuery()
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query)
    this.pending.push({ query, label })
    this.open = true
  }

  end(): void {
    if (!this.ext || !this.open) return
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    this.open = false
  }

  /** Collect whatever results have arrived, oldest first. Results from a
   * stretch in which the GPU was disturbed (a power-state change, say) are
   * meaningless, and are dropped. */
  poll(): void {
    const { gl, ext } = this
    if (!ext) return
    const settled = this.open ? this.pending.length - 1 : this.pending.length
    let n = 0
    while (
      n < settled &&
      gl.getQueryParameter(this.pending[n].query, gl.QUERY_RESULT_AVAILABLE)
    )
      n++
    if (!n) return
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT)
    for (const { query, label } of this.pending.splice(0, n)) {
      if (!disjoint) {
        const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6
        this.totals[label] = (this.totals[label] ?? 0) + ms
      }
      this.spare.push(query)
    }
  }

  /** The totals, in ms, since the last take */
  take(): Record<string, number> {
    const totals = this.totals
    this.totals = {}
    return totals
  }

  delete(): void {
    for (const { query } of this.pending) this.gl.deleteQuery(query)
    for (const query of this.spare) this.gl.deleteQuery(query)
    this.pending = []
    this.spare = []
  }
}
