import "../css/splash-page.css"

console.log(`Environment: ${process.env.NODE_ENV}`)

const argstring = document.querySelector("#runtime_json").innerText
const urls = JSON.parse(argstring)

document.querySelector("#bubbler").addEventListener("click", (e) => {
  const url = urls[e.target.id]

  if (url) {
    window.location.href = url
  }
})
