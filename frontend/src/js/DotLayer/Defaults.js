/**
 *
 * @module DotLayer/options
 *
 */

export const options = {
  debug: true,
  numWorkers: 0,
  startPaused: false,
  showPaths: true,
  fps_display: false,

  normal: {
    dotColor: "#000000",
    dotOpacity: 0.7,

    pathColor: "#000000",
    pathOpacity: 0.7,
    pathWidth: 1,
  },

  selected: {
    dotColor: "#FFFFFF",
    dotOpacity: 0.9,

    pathColor: "#000000",
    pathOpacity: 0.7,
    pathWidth: 5,
  },

  unselected: {
    dotColor: "#000000",
    dotOpacity: 0.3,

    pathColor: "#000000",
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

export const dotSettings = {
  C1: 1000000.0,
  C2: 200.0,
  dotScale: 2.0,
  alphaScale: 0.9
}
