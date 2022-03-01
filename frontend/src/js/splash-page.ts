import "../css/splash-page.css"

console.log(`Environment: ${process.env.NODE_ENV}`)

const runtime_json = JSON.parse(document.getElementById("runtime_json").innerText)
const urls = runtime_json["urls"]
const flashes = runtime_json["flashes"]

if (flashes.length) {
  const flashes_str = flashes.join("\n")
  const el = document.getElementById("flashes")
  el.innerText = flashes_str
  el.style = "display: block;"

}


document.querySelector("#bubbler").addEventListener("click", (e) => {
  const url = urls[e.target.id]

  if (url) {
    window.location.href = url
  }
})
