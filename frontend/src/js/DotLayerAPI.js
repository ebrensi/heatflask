/* DotLayerAPI.js -- we define and initialize the dotLayer here */


import { map } from "./MapAPI.js";

import { DotLayer } from "./DotLayer/DotLayer.js";

import { vparams } from "./Model.js";


/* instantiate a DotLayer object and add it to the map */
export const dotLayer = new DotLayer({
    startPaused: vparams.paused
}).addTo(map);
