import "../css/splash-page.css"

const argstring = document.querySelector("#runtime-arguments").innerText
const { URLS } = JSON.parse(argstring)

document.querySelector("#bubbler").addEventListener("click", (e) => {
  let url = URLS[e.target.id]

  if (url) {
    window.location.href = url
  }
})
