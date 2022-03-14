console.log(`Environment: ${process.env.NODE_ENV}`)

const runtime_json = JSON.parse(
  document.getElementById("runtime_json").innerText
)
const urls = runtime_json["urls"]
const flashes_el = document.getElementById("flashes")
const flashes = JSON.parse(flashes_el.innerText)
if (flashes && flashes.length) {
  const flashes_str = flashes.join("\n")
  flashes_el.innerText = flashes_str
  flashes_el.style = "display: block;"
}

document.querySelector("#bubbler").addEventListener("click", (e) => {
  const url = urls[e.target.id]

  if (url) {
    window.location.href = url
  }
})
