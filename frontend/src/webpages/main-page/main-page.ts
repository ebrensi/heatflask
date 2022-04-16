/*
    This should be the last imported CSS so that the rules in it over-ride
    everything before.

    With ParcelJS packaging, each imported .js/.ts module
    can have its own imported .css so we import this after the modules as well
*/

/*
 * main.js -- the entry point for the heatflask browser client
 */
console.time("client_setup")

import { APP_VERSION } from "~/src/js/Env"
import { appState } from "~/src/js/UI"

setTimeout(() => {
  console.log(`

  ██╗  ██╗███████╗ █████╗ ████████╗███████╗██╗      █████╗ ███████╗██╗  ██╗
  ██║  ██║██╔════╝██╔══██╗╚══██╔══╝██╔════╝██║     ██╔══██╗██╔════╝██║ ██╔╝
  ███████║█████╗  ███████║   ██║   █████╗  ██║     ███████║███████╗█████╔╝
  ██╔══██║██╔══╝  ██╔══██║   ██║   ██╔══╝  ██║     ██╔══██║╚════██║██╔═██╗
  ██║  ██║███████╗██║  ██║   ██║   ██║     ███████╗██║  ██║███████║██║  ██╗
  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
  v${APP_VERSION}                                           (2016-2022) Efrem Rensi

  Want to contribute? Check out the repo at
  https://github.com/ebrensi/heatflask

  `)
  console.timeEnd("client_setup")
  console.log("appState: ", appState)
}, 0)
