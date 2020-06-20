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

import { OFFLINE, ADMIN, DEVELOPMENT } from "./Constants.js";
import { noop } from "./appUtil.js";
import load_ga_object from "./google-analytics.js";

const ga = (OFFLINE || ADMIN || DEVELOPMENT)? noop : load_ga_object();


import { appState } from "./UI.js";


import "../css/heatflask.css";  // This should be the last imported CSS


// debugger;

