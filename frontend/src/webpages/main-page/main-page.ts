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
import { start } from "~/src/js/UI"

/* The byline sits at the right edge of the artwork below, however long the
 * version in front of it turns out to be. */
const BYLINE = "(2016-2026) Efrem Rensi"
const versionLine = `  v${APP_VERSION} `.padEnd(75 - BYLINE.length) + BYLINE

start()
  .then((appState) => {
    console.log(`

  ██╗  ██╗███████╗ █████╗ ████████╗███████╗██╗      █████╗ ███████╗██╗  ██╗
  ██║  ██║██╔════╝██╔══██╗╚══██╔══╝██╔════╝██║     ██╔══██╗██╔════╝██║ ██╔╝
  ███████║█████╗  ███████║   ██║   █████╗  ██║     ███████║███████╗█████╔╝
  ██╔══██║██╔══╝  ██╔══██║   ██║   ██╔══╝  ██║     ██╔══██║╚════██║██╔═██╗
  ██║  ██║███████╗██║  ██║   ██║   ██║     ███████╗██║  ██║███████║██║  ██╗
  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
${versionLine}

  Want to contribute? Check out the repo at
  https://github.com/ebrensi/heatflask

  `)
    console.timeEnd("client_setup")
    console.log("appState: ", appState)
  })
  .catch((e) => console.error(e))
