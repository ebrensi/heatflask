/* DotLayerAPI.js -- we define and initialize the dotLayer here */

import { map } from "./MapAPI"

import { DotLayer } from "./DotLayer/DotLayer"

import { vParams } from "./Model"

/* instantiate a DotLayer object and add it to the map */
export const dotLayer = new DotLayer({
  startPaused: vParams.paused,
}).addTo(map)
