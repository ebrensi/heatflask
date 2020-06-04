import * as L from "leaflet";
import appState from "./appState.js"
import { dotLayer } from "./mainComponents.js";
import "../../node_modules/leaflet-easybutton/src/easy-button.js";
import "../../node_modules/leaflet-easybutton/src/easy-button.css";

const button_states = [
    {
        stateName: 'animation-running',
        icon:      'fa-pause',
        title:     'Pause Animation',
        onClick: function(btn, map) {
            pauseFlow();
            dotLayer.pause();
            appState.paused = true;
            appState.update();
            btn.state('animation-paused');
            }
    },

    {
        stateName: 'animation-paused',
        icon:      'fa-play',
        title:     'Resume Animation',
        onClick: function(btn, map) {
            appState.paused = false;
            dotLayer.animate();
            appState.update();
            btn.state('animation-running');
        }
    }
];

// Animation play/pause button
const animationControl =  L.easyButton({
    states: appState.paused? button_states.reverse() : button_states
});

export default animationControl;
