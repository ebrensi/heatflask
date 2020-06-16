/*
 *
 * ██╗  ██╗███████╗ █████╗ ████████╗███████╗██╗      █████╗ ███████╗██╗  ██╗
 * ██║  ██║██╔════╝██╔══██╗╚══██╔══╝██╔════╝██║     ██╔══██╗██╔════╝██║ ██╔╝
 * ███████║█████╗  ███████║   ██║   █████╗  ██║     ███████║███████╗█████╔╝
 * ██╔══██║██╔══╝  ██╔══██║   ██║   ██╔══╝  ██║     ██╔══██║╚════██║██╔═██╗
 * ██║  ██║███████╗██║  ██║   ██║   ██║     ███████╗██║  ██║███████║██║  ██╗
 * ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
 *
 * (2016-2020) Efrem Rensi
 *
 * --------------------------------------------------------------------------
 */

 /*
  * main.js -- the entry point for the heatflask browser client
  */


/*
 * Set up Google Analytics Object if
 *   the current user is not an ADMIN,
 *   we are not offline,
 *   this is not a development environment
 */
import load_google_analytics from "./google-analytics.js";
import { OFFLINE, ADMIN, DEVELOPMENT } = from "./appUtil.js";
const ga = (OFFLINE || ADMIN || DEVELOPMENT)? noop : load_google_analytics();

import "../../node_modules/leaflet/dist/leaflet.css";
import * as L from "leaflet";

import { appState } from "./UI.js";


import "../css/heatflask.css";  // This should be the last imported CSS

debugger;
