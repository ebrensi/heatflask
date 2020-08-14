import "../ext/css/min_entireframework.min.css";
import "../css/splash-page.css";

import strava_button from "url:../images/btn_strava_connectwith_orange.svg";

const { URLS } = window["_args"];

const button = document.querySelector("#strava-button");

button.src = strava_button;

document.querySelector("#bubbler").addEventListener("click", (e) => {
  const action = e.target.id;
  let url = URLS[action];

  if (url) {
    window.location.href = url;
  }
});
