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

  normal: {
    dotOpacity: 0.7,
    pathOpacity: 0.7,
    pathWidth: 2,
  },

  selected: {
    dotOpacity: 0.9,
    pathOpacity: 0.8,
    pathWidth: 5,
  },

  unselected: {
    dotOpacity: 0.3,
    pathOpacity: 0.3,
    pathWidth: 1,
  },

  dotShadows: {
    enabled: true,
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
