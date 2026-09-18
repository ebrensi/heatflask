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
 *   3: 1 for sphere (selected) else 0 for cube, duration in seconds, 0, 0
 * ---------------------------------------------------------------------- */
export const DOT_VS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform mat4 u_matrix;
uniform float u_pixelRatio;
uniform float u_zScale;
uniform float u_size;      // CSS px: a cube's edge; a sphere's radius
uniform mat3 u_view;       // see DOT_FS
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
  gl_Position = u_matrix * vec4(p.xy + m1.xy, (p.z + m1.w) * m1.z * u_zScale, 1.0);

  v_circle = m3.x;
  float size = m3.x > 0.5 ? 2.0 * u_size : u_size;
  v_halfSize = 0.5 * size * u_pixelRatio;
  /* A cube's outline reaches out to its corners: along screen x, half an edge
   * times the sum of its three edges' x extents. Square sprites, so the
   * greater of x and y; top-down with no bearing that is one edge. */
  float extent = m3.x > 0.5 ? 1.0 : max(
    abs(u_view[0].x) + abs(u_view[1].x) + abs(u_view[2].x),
    abs(u_view[0].y) + abs(u_view[1].y) + abs(u_view[2].y));
  v_pointSize = size * extent * u_pixelRatio + 2.0;
  gl_PointSize = v_pointSize;
  v_color = fetch(u_meta, a + 2);
}
`

/* Selected dots are spheres, the rest cubes, shaded by one light. u_light
 * points toward it in the sprite's frame (x right, y down, z toward the
 * viewer), set against the shadow's offset so the highlights and the shadow
 * agree.
 *
 * A sphere looks the same from any direction, so the screen-aligned point
 * sprite is already its true outline, pitched or not, and each pixel's normal
 * follows from where it falls in the disc.
 *
 * A cube sits square to the map: its edges run east, south and up. u_view's
 * columns are those three directions in the sprite's frame, a rotation set by
 * the bearing and pitch. The cube is small enough on screen to treat the view
 * as orthographic, so every dot's cube looks the same, and:
 *   - its outline is the hexagon swept out by its three edges projected onto
 *     the screen, whose sides are parallel to them (cubeDistance);
 *   - the face a pixel shows is the one a ray from the eye through that pixel
 *     enters first (cubeNormal).
 * Top-down it is a square, as the dots were before. */
export const DOT_FS = `#version 300 es
precision highp float;

uniform float u_shadow;    // 1 on the shadow pass
uniform vec3 u_light;      // unit vector
uniform mat3 u_view;       // east, south, up, in the sprite's frame

in vec4 v_color;
in float v_pointSize;
in float v_halfSize;
flat in float v_circle;
out vec4 fragColor;

const float AMBIENT = 0.45;
const float DIFFUSE = 0.75;
const float SPECULAR = 0.35;
const float SHININESS = 24.0;

/* Signed distance, in device pixels, from p to the outline of a cube of half
 * edge h. For each edge direction g, the hexagon has a pair of sides parallel
 * to g, as far from the centre (along g's normal) as the three edges reach.
 * An edge seen end-on projects to nothing and has no sides; at most one can. */
float cubeDistance(vec2 p, float h) {
  float d = -1e9;
  for (int i = 0; i < 3; i++) {
    vec2 g = u_view[i].xy;
    float len = length(g);
    if (len < 1e-4) continue;
    vec2 n = vec2(-g.y, g.x) / len;
    float reach = h * (abs(dot(n, u_view[0].xy)) + abs(dot(n, u_view[1].xy))
      + abs(dot(n, u_view[2].xy)));
    d = max(d, abs(dot(n, p)) - reach);
  }
  return d;
}

/* The outward normal, in the sprite's frame, of the face seen at p. The ray
 * runs from the eye into the screen; in the cube's own frame (u_view is a
 * rotation, so its transpose undoes it) it enters each pair of faces at t,
 * and it enters the cube through the last of them. The cube is taken a pixel
 * larger here, so the antialiased fringe just outside the outline still finds
 * a face. */
vec3 cubeNormal(vec2 p, float h) {
  vec3 o = vec3(p, 0.0) * u_view;
  vec3 dir = vec3(0.0, 0.0, -1.0) * u_view;
  vec3 s = vec3(dir.x < 0.0 ? -1.0 : 1.0, dir.y < 0.0 ? -1.0 : 1.0,
    dir.z < 0.0 ? -1.0 : 1.0);
  vec3 t = (-s * (h + 1.0) - o) * s / max(abs(dir), 1e-6);
  if (t.x >= t.y && t.x >= t.z) return -s.x * u_view[0];
  if (t.y >= t.z) return -s.y * u_view[1];
  return -s.z * u_view[2];
}

void main() {
  // position from the centre, in device pixels
  vec2 p = (gl_PointCoord - 0.5) * v_pointSize;
  float h = v_halfSize;
  float d = v_circle > 0.5 ? length(p) - h : cubeDistance(p, h);

  float a = clamp(0.5 - d, 0.0, 1.0) * v_color.a;
  if (a <= 0.0) discard;
  /* The shadow pass wants only coverage, in a one-channel buffer: see
   * SHADOW_FS */
  if (u_shadow > 0.5) {
    fragColor = vec4(a);
    return;
  }

  vec3 rgb = v_color.rgb;
  if (v_circle > 0.5) {
    vec2 q = p / h;
    vec3 n = vec3(q, sqrt(max(0.0, 1.0 - dot(q, q))));
    float diffuse = max(dot(n, u_light), 0.0);
    vec3 half_ = normalize(u_light + vec3(0.0, 0.0, 1.0));
    float specular = pow(max(dot(n, half_), 0.0), SHININESS);
    rgb = min(rgb * (AMBIENT + DIFFUSE * diffuse) + SPECULAR * specular, 1.0);
  } else {
    float diffuse = max(dot(cubeNormal(p, h), u_light), 0.0);
    rgb = min(rgb * (AMBIENT + DIFFUSE * diffuse), 1.0);
  }
  fragColor = vec4(rgb * a, a);  // premultiplied
}
`

/* ---------------------------------------------------------------------- *
 * Shadows: one for all the dots together, not one per dot.
 *
 * Drawn per dot straight over the map, n overlapping shadows of opacity a
 * leave (1 - a)^n of what is under them, and a cluster of dots goes black. A
 * real shadow does not work like that: the shade behind two opaque objects is
 * no darker than behind one, only larger.
 *
 * So the shadow is cast by the dots' combined silhouette, as the CSS
 * drop-shadow on the 2D canvas was:
 *
 *   1. The dots are drawn, hard-edged, into an offscreen one-channel buffer
 *      with blendEquation(MAX), so overlapping dots cover a pixel once.
 *   2. That silhouette is blurred horizontally into a second buffer.
 *   3. It is blurred vertically on the way onto the map, offset, and the map
 *      is darkened by the result.
 *
 * The blur is a Gaussian of standard deviation u_sigma source texels, as
 * CSS's drop-shadow blur radius is twice the standard deviation. Both blur
 * passes use this shader, on one oversized triangle that covers the viewport;
 * no vertex buffer is needed.
 * ---------------------------------------------------------------------- */
export const SHADOW_VS = `#version 300 es
precision highp float;

void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`

export const SHADOW_FS = `#version 300 es
precision highp float;

const int MAX_RADIUS = 16;

uniform sampler2D u_source;
uniform vec2 u_viewport;   // the target's size, in its pixels
uniform vec2 u_offset;     // target pixels to shift the source by
uniform vec2 u_step;       // one source texel along the blur, in uv
uniform float u_sigma;     // in source texels
uniform float u_final;     // 1 for the pass onto the map
uniform vec4 u_color;      // the shadow's, premultiplied

out vec4 fragColor;

void main() {
  vec2 uv = (gl_FragCoord.xy - u_offset) / u_viewport;
  float sigma = max(u_sigma, 0.01);
  int radius = min(int(ceil(3.0 * sigma)), MAX_RADIUS);
  float sum = 0.0;
  float weights = 0.0;
  for (int i = -MAX_RADIUS; i <= MAX_RADIUS; i++) {
    if (abs(i) > radius) continue;
    float x = float(i);
    float w = exp(-0.5 * x * x / (sigma * sigma));
    sum += w * texture(u_source, uv + x * u_step).r;
    weights += w;
  }
  float a = sum / weights;

  if (u_final < 0.5) {
    fragColor = vec4(a);
    return;
  }
  if (a <= 0.0) discard;
  fragColor = u_color * a;
}
`
