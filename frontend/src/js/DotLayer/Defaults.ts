/*
 *  Default values
 */

export const options = {
  debug: true,
  numWorkers: 0,
  startPaused: false,
  showPaths: true,
  fps_display: false,
  outlier_filter: true,

  /* How activities are drawn when nothing is selected (normal), and, once
   * something is, how the selection (selected) and everything else
   * (unselected) are drawn. Opacity is 0..1. ActivityCollection draws the
   * unselected ones first, so the selection sits on top of them. */
  normal: {
    dotOpacity: 1,
    pathOpacity: 1,
    pathWidth: 2,
  },

  selected: {
    dotOpacity: 1,
    pathOpacity: 1,
    pathWidth: 5,
  },

  unselected: {
    dotOpacity: 0.25,
    pathOpacity: 0.2,
    pathWidth: 1,
  },

  // always on: a CSS drop-shadow filter on the dot canvas (see DotLayer.ts)
  dotShadows: {
    x: 0,
    y: 5,
    blur: 5,
    color: "#000000",
  },
}

/* DotLayer.updateDotSettings() writes all of these from the visual params on
 * every change; the values here are only a starting point, matching
 * Model.DefaultVisual. They were undeclared, so every assignment was a type
 * error -- invisible until DotLayer was finally being typechecked at all. */
export const dotSettings = {
  dotScale: 2.0,
  _timeScale: 30, // tau: activity-seconds per real second
  _period: 60, // s: activity-seconds between successive dots
  _dotSize: 1, // px, recomputed from sz and the current zoom level
  alpha: 204, // (0.8 * 256) | 0
}

type DotLayerOptions = typeof options
