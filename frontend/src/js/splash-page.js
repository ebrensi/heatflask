
import '../ext/css/min_entireframework.min.css';
import '../css/splash-page.css';

import { noop } from "./appUtil.js"
import load_google_analytics from "./google-analytics.js";

import strava_button from "../images/btn_strava_connectwith_orange.svg";

const { DEVELOPMENT, URL } = JSON.parse(window["args"]);

const ga = DEVELOPMENT? noop : load_google_analytics();

const button = document.querySelector("#strava-button");

button.src = strava_button;

document.querySelector("#bubbler")
 		.addEventListener("click", e => {
	const action = e.target.id;
	let url = URL[action];

	if (url)
		window.location.href = url;
});
