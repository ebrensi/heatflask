// main.js
import load_google_analytics from "./google-analytics.js";

// import {PersistentWebsocket} from "persistent-websocket"
import * as PersistentWebsocket from "../ext/js/pws.js";

import "../../node_modules/pikaday/css/pikaday.css";
import * as pikaday from 'pikaday';


import { decode as msgpackDecode} from "@msgpack/msgpack";

import Dom from './Dom.js'
import * as strava from './strava.js';

import "../../node_modules/leaflet/dist/leaflet.css";
import * as L from "leaflet";

import appState, * as args from "./appState.js";

import { map, controls } from "./mainComponents.js"

debugger;
