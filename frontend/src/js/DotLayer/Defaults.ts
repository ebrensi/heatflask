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

  // always on: a second, blurred pass under the dots (see HeatflaskLayer)
  dotShadows: {
    x: 0,
    y: 5,
    blur: 5,
    color: "#000000",
  },
}

type DotLayerOptions = typeof options
