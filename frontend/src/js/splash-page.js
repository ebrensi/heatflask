import "../css/splash-page.css";

const { URLS } = JSON.parse(window["argstring"]);

document.querySelector("#bubbler").addEventListener("click", (e) => {
  const action = e.target.id;
  let url = URLS[action];

  if (url) {
    window.location.href = url;
  }
});
