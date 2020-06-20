

appState.currentBaseLayer = default_baseLayer;
map.on('baselayerchange', function (e) {
    appState.currentBaseLayer = e.layer;
    appState.update();
});

import * as controls from "./Controls.js";


Object.values(controls).forEach( control =>
    control._noadd? null : control.addTo(map)
);


export { controls };

/*
 * instantiate a DotLayer object and it to the map
 */
// export const dotLayer = new DotLayer({
//     startPaused: appState.paused,
// })
// dotLayer.addTo(map);

