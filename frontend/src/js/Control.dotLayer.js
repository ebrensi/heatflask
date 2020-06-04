import { dotLayer } from "./mainComponents.js";
import { CAPTURE_DURATION_MAX } from "./appState.js";

// Controls for system speed, sparsity, etc
let dialfg, dialbg;

const rad = deg => deg * Math.PI/180,
      settings = {
        'angleStart': rad(0),
        'angleEnd': rad(360),
        'angleOffset': rad(-90),
        'colorFG': "rgba(0,255,255,0.4)",
        'colorBG': "rgba(255,255,255,0.2)",
        'trackWidth': 0.5,
        'valMin': 0,
        'valMax': 100,
        'needle': true,
      };

dialfg = settings["colorFG"];
dialbg = settings["colorBG"];

function makeKnob(selector, options) {
    const knob = pureknob.createKnob(options.width, options.height),
          mySettings = Object.assign({}, settings);

    Object.assign(mySettings, options);

    for ( const [property, value] of Object.entries(mySettings) ) {
        knob.setProperty(property, value);
    }

    const node = knob.node();

    Dom.el(selector).appendChild(node);

    return knob
}

function updatePeriod() {
    // Enable capture if period is less than CAPTURE_DURATION_MAX
    let cycleDuration = dotLayer.periodInSecs().toFixed(2),
        captureEnabled = controls.captureControl.enabled;

    Dom.html("#period-value", cycleDuration);
    if (cycleDuration <= CAPTURE_DURATION_MAX) {
        if (!captureEnabled) {
            controls.captureControl.addTo(map);
            controls.captureControl.enabled = true;
        }
    } else if (captureEnabled) {
        controls.captureControl.removeFrom(map);
        controls.captureControl.enabled = false;
    }
}

function listener(knob, val) {
    let period_changed;

    switch (knob['_properties']['label']) {
        case "Speed":
            newVal = val * val * SPEED_SCALE;
            dotLayer.updateDotSettings({C2: newVal});
            updatePeriod();
        break;

        case "Sparcity":
            newVal = Math.pow(2, val * SEP_SCALE.m + SEP_SCALE.b);
            dotLayer.updateDotSettings({C1: newVal});
            updatePeriod();
        break;

        case "Alpha":
            dotLayer.updateDotSettings({alphaScale: val / 10 });
            dotLayer.drawPaths();
        break;

        case "Size":
            dotLayer.updateDotSettings({dotScale: val});
        break;
    }
}


makeKnob('#dot-controls1', {
    width: "140",
    height: "140",
    "label": "Speed"
}).addListener(listener);

makeKnob('#dot-controls1', {
    width: "140",
    height: "140",
    "label": "Sparcity"
}).addListener(listener);

makeKnob('#dot-controls2', {
    width: "100",
    height: "100",
    valMin: 0,
    valMax: 10,
    "label": "Alpha"
}).addListener(listener);

makeKnob('#dot-controls2', {
    width: "100",
    height: "100",
    valMin: 0,
    valMax: 10,
    "label": "Size"
}).addListener(listener);



// set up dial-controls
// (() => {
//     $(".dotconst-dial").knob({
//         min: 0,
//         max: 100,
//         step: 0.1,
//         width: "140",
//         height: "140",
//         cursor: 20,
//         inline: true,
//         displayInput: false,
//         fgColor: dialfg,
//         bgColor : dialbg,
//         change: function (val) {
//             let newVal;
//             if (this.$[0].id == "sepConst") {
//                 newVal = Math.pow(2, val * SEP_SCALE.m + SEP_SCALE.b);
//                 dotLayer.updateDotSettings({C1: newVal});
//             } else {
//                 newVal = val * val * SPEED_SCALE;
//                 dotLayer.updateDotSettings({C2: newVal});;
//             }

//             // Enable capture if period is less than CAPTURE_DURATION_MAX
//             let cycleDuration = dotLayer.periodInSecs().toFixed(2),
//                 captureEnabled = controls.captureControl.enabled;

//             Dom.html("#period-value", cycleDuration);
//             if (cycleDuration <= CAPTURE_DURATION_MAX) {
//                 if (!captureEnabled) {
//                     controls.captureControl.addTo(map);
//                     controls.captureControl.enabled = true;
//                 }
//             } else if (captureEnabled) {
//                 controls.captureControl.removeFrom(map);
//                 controls.captureControl.enabled = false;
//             }
//         },
//         release: function() {
//             updateState();
//         }
//     });

//     $(".dotconst-dial-small").knob({
//         min: 0.01,
//         max: 10,
//         step: 0.01,
//         width: "100",
//         height: "100",
//         cursor: 20,
//         inline: true,
//         displayInput: false,
//         fgColor: dialfg,
//         bgColor : dialbg,
//         change: function (val) {
//             if (this.$[0].id == "dotScale")
//                 dotLayer.updateDotSettings({dotScale: val});
//             else {
//                 dotLayer.updateDotSettings({alphaScale: val / 10});
//                 dotLayer.drawPaths();
//             }
//         },
//         release: function() {
//             updateState();
//         }
//     });
// })();
