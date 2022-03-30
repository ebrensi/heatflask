/* Here is where we define an API for a custom set of icons from icomoon */

export function icon(name: string, cls = ""): string {
  return `<i class="hf-${name} ${cls}"></i>`
}
