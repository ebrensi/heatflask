/*
 * main.js -- the entry point for the heatflask browser client
 */

import { DEV_BUNDLE } from "./Env"
if (DEV_BUNDLE) import("./UnitTests")

import "./UI"

import "../css/main.css" // This should be the last imported CSS



const string = `

██╗  ██╗███████╗ █████╗ ████████╗███████╗██╗      █████╗ ███████╗██╗  ██╗
██║  ██║██╔════╝██╔══██╗╚══██╔══╝██╔════╝██║     ██╔══██╗██╔════╝██║ ██╔╝
███████║█████╗  ███████║   ██║   █████╗  ██║     ███████║███████╗█████╔╝
██╔══██║██╔══╝  ██╔══██║   ██║   ██╔══╝  ██║     ██╔══██║╚════██║██╔═██╗
██║  ██║███████╗██║  ██║   ██║   ██║     ███████╗██║  ██║███████║██║  ██╗
╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚══════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝

(2016-2021) Efrem Rensi
`

console.log(string)
console.log("Are you a developer? Want to contribute?")
console.log("Check out the repo at https://github.com/ebrensi/heatflask")
