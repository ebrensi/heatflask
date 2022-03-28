/*
    This should be the last imported CSS so that the rules in it over-ride
    everything before.

    With ParcelJS packaging, each imported .js/.ts module
    can have its own imported .css so we import this after the modules as well
*/

/*
 * main.js -- the entry point for the heatflask browser client
 */
console.time("client setup")

import { APP_VERSION } from "~/src/js/Env"
import "~/src/js/UI"

console.timeEnd("client setup")

console.log(`

██╗  ██╗███████╗ █████╗ ████████╗███████╗██╗      █████╗ ███████╗██╗  ██╗
██║  ██║██╔════╝██╔══██╗╚══██╔══╝██╔════╝██║     ██╔══██╗██╔════╝██║ ██╔╝
███████║█████╗  ███████║   ██║   █████╗  ██║     ███████║███████╗█████╔╝
██╔══██║██╔══╝  ██╔══██║   ██║   ██╔══╝  ██║     ██╔══██║╚════██║██╔═██╗
██║  ██║███████╗██║  ██║   ██║   ██║     ███████╗██║  ██║███████║██║  ██╗
╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
v${APP_VERSION}                                           (2016-2022) Efrem Rensi

Check out the repo at https://github.com/ebrensi/heatflask
`)
