/* Here is where we define an API for a custom set of icons from icomoon */
import "../css/icomoon-heatflask.css"

export function icon(name, cls = "") {
  return `<i class="hf-${name} ${cls}"></span>`
}
