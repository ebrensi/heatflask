

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
