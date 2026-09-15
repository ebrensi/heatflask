/*
 * GLSL for HeatflaskLayer. WebGL2 (GLSL ES 3.00).
 *
 * Positions arrive in zoom-0 world pixels (the world is 256px square)
 * relative to an origin near the viewport, and u_matrix takes them to clip
 * space. Keeping them relative is what keeps float32 precise enough at street
 * zoom levels, where absolute world coordinates would be rounded to whole
 * screen pixels and the dots would jitter.
 *
 * z is height in the same world-pixel units. u_zScale multiplies it: the
 * terrain's exaggeration when terrain is on, and 0 when the map is flat.
 */

/* ---------------------------------------------------------------------- *
 * Paths: each segment is an instanced quad, extruded in screen space so a
 * line is the same number of pixels wide however the camera is pitched.
 * WebGL's own lineWidth is 1px on nearly every platform.
 *
 * Per instance: a_p0, a_p1 are consecutive points of one interleaved buffer
 * (the same buffer bound twice, one point apart). w in a_p0 is the width of
 * the segment starting there, 0 where no segment starts -- the last point of
 * a run, which is how separate polylines share one buffer.
 * ---------------------------------------------------------------------- */
export const PATH_VS = `#version 300 es
precision highp float;

uniform mat4 u_matrix;
uniform vec2 u_viewport;   // drawing buffer size, in device pixels
uniform float u_pixelRatio;
uniform float u_zScale;

layout(location = 0) in vec2 a_corner;   // (t along the segment, side)
layout(location = 1) in vec4 a_p0;       // x, y, z, width in CSS px
layout(location = 2) in vec4 a_color0;
layout(location = 3) in vec4 a_p1;

out vec4 v_color;
out float v_side;
out float v_halfWidth;

void main() {
  float width = a_p0.w;
  if (width <= 0.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // clipped
    return;
  }

  vec4 c0 = u_matrix * vec4(a_p0.xy, a_p0.z * u_zScale, 1.0);
  vec4 c1 = u_matrix * vec4(a_p1.xy, a_p1.z * u_zScale, 1.0);

  vec2 s0 = c0.xy / c0.w * u_viewport;
  vec2 s1 = c1.xy / c1.w * u_viewport;
  vec2 d = s1 - s0;
  float len = length(d);
  vec2 dir = len > 1e-6 ? d / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);

  // one extra pixel on each side for antialiasing
  float halfWidth = 0.5 * width * u_pixelRatio + 1.0;
  float t = a_corner.x;
  vec4 c = mix(c0, c1, t);
  /* Extend past each end by half the width, so consecutive segments overlap
   * at their joins instead of leaving a notch on the outside of each bend. */
  vec2 offset = normal * a_corner.y * halfWidth + dir * (t * 2.0 - 1.0) * halfWidth;
  c.xy += offset / u_viewport * c.w;

  gl_Position = c;
  v_color = a_color0;
  v_side = a_corner.y * halfWidth;
  v_halfWidth = halfWidth;
}
`

export const PATH_FS = `#version 300 es
precision highp float;

uniform float u_opacity;

in vec4 v_color;
in float v_side;
in float v_halfWidth;
out vec4 fragColor;

void main() {
  float edge = clamp(v_halfWidth - abs(v_side), 0.0, 1.0);
  float a = v_color.a * u_opacity * edge;
  fragColor = vec4(v_color.rgb * a, a);  // premultiplied
}
`

/* ---------------------------------------------------------------------- *
 * Dots, computed entirely on the GPU.
 *
 * The model (see Activity.ts): at time `now` an activity shows a dot at every
 * activity time now - k*T that falls within the activity. Measured from the
 * activity's start ts, those times are
 *
 *     tau_k = ((now - ts) mod T) + k*T,    k = 0, 1, 2, ...
 *
 * so one frame needs only phase = now mod T; each activity's own ts mod T is
 * in its metadata. Every stream is uploaded once, resampled onto a uniform
 * time grid (u_streams), which turns "where was the athlete at tau" into two
 * texel fetches and a mix instead of a search.
 *
 * Each vertex is one dot slot (activity index, k). The slot buffer depends on
 * T and on the selection, never on time, so a frame uploads a single uniform.
 *
 * u_streams texel: x, y (world px relative to the activity's origin),
 *                  altitude in metres, 1 if valid (0 inside a GPS gap)
 * u_meta, four texels per activity:
 *   0: sample offset, sample count, samples per second, ts mod T
 *   1: origin x, origin y (relative to the view origin), px per metre, altitude offset
 *   2: colour, straight alpha
 *   3: 1 for circle (selected) else 0, duration in seconds, 0, 0
 * ---------------------------------------------------------------------- */
export const DOT_VS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_pixelRatio;
uniform float u_zScale;
uniform float u_size;      // CSS px: a square's side; a circle's radius
uniform float u_blur;      // CSS px of soft edge, for the shadow pass
uniform vec2 u_shift;      // CSS px screen offset, for the shadow pass
uniform float u_T;
uniform float u_phase;     // now mod T
uniform sampler2D u_streams;
uniform sampler2D u_meta;

layout(location = 0) in uvec2 a_slot;   // activity index, k

out vec4 v_color;
out float v_pointSize;
out float v_halfSize;
flat out float v_circle;

vec4 fetch(sampler2D tex, int i) {
  int w = textureSize(tex, 0).x;
  return texelFetch(tex, ivec2(i % w, i / w), 0);
}

void clipped() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  gl_PointSize = 0.0;
}

void main() {
  int a = int(a_slot.x) * 4;
  vec4 m0 = fetch(u_meta, a);
  vec4 m3 = fetch(u_meta, a + 3);

  float tau = mod(u_phase - m0.w, u_T) + float(a_slot.y) * u_T;
  if (tau > m3.y) { clipped(); return; }

  float f = tau * m0.z;
  float i0 = floor(f);
  int base = int(m0.x) + int(i0);
  if (i0 + 1.0 >= m0.y) { clipped(); return; }

  vec4 s0 = fetch(u_streams, base);
  vec4 s1 = fetch(u_streams, base + 1);
  if (s0.w < 0.5 || s1.w < 0.5) { clipped(); return; }

  vec4 m1 = fetch(u_meta, a + 1);
  vec3 p = mix(s0.xyz, s1.xyz, f - i0);
  vec4 c = u_matrix * vec4(p.xy + m1.xy, (p.z + m1.w) * m1.z * u_zScale, 1.0);

  // screen y points down; clip y points up
  c.xy += vec2(u_shift.x, -u_shift.y) * u_pixelRatio * 2.0 / u_viewport * c.w;
  gl_Position = c;

  v_circle = m3.x;
  float size = m3.x > 0.5 ? 2.0 * u_size : u_size;
  v_halfSize = 0.5 * size * u_pixelRatio;
  v_pointSize = (size + 2.0 * u_blur) * u_pixelRatio + 2.0;
  gl_PointSize = v_pointSize;
  v_color = fetch(u_meta, a + 2);
}
`

export const DOT_FS = `#version 300 es
precision highp float;

uniform float u_blur;
uniform float u_pixelRatio;
uniform float u_shadow;    // 1 on the shadow pass
uniform float u_shadowAlpha;

in vec4 v_color;
in float v_pointSize;
in float v_halfSize;
flat in float v_circle;
out vec4 fragColor;

void main() {
  // distance from the centre, in device pixels
  vec2 p = (gl_PointCoord - 0.5) * v_pointSize;
  float d = v_circle > 0.5 ? length(p) : max(abs(p.x), abs(p.y));

  if (u_shadow > 0.5) {
    float blur = max(u_blur * u_pixelRatio, 1.0);
    float a = (1.0 - smoothstep(v_halfSize - blur, v_halfSize + blur, d))
      * u_shadowAlpha * v_color.a;
    if (a <= 0.0) discard;
    fragColor = vec4(0.0, 0.0, 0.0, a);
    return;
  }

  float a = clamp(v_halfSize + 0.5 - d, 0.0, 1.0) * v_color.a;
  if (a <= 0.0) discard;
  fragColor = vec4(v_color.rgb * a, a);  // premultiplied
}
`
