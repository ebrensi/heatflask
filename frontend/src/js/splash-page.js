
import '../ext/css/min_entireframework.min.css';
import '../css/splash-page.css';

import { noop } from "./appUtil.js";

import load_ga_object from "./google-analytics.js";

import strava_button from "../images/btn_strava_connectwith_orange.svg";

const { DEVELOPMENT, URLS} = window["_args"];

const ga = DEVELOPMENT? noop : load_ga_object();

const button = document.querySelector("#strava-button");

button.src = strava_button;

document.querySelector("#bubbler")
 		.addEventListener("click", e => {
	const action = e.target.id;
	let url = URLS[action];

	if (url) {
		window.location.href = url;
	}
});
