import "../css/splash-page.css";

const argstring = document.querySelector("#runtime-arguments").innerText;
const { URLS } = JSON.parse(argstring);

document.querySelector("#bubbler").addEventListener("click", (e) => {
  const action = e.target.id;
  let url = URLS[action];

  if (url) {
    window.location.href = url;
  }
});
