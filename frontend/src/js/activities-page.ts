/*
 * This is the script for the heatflask activity-list view
 * index_page.html.
 */

// css for Bundler
import "../ext/min_entireframework.css"
// import "../css/font-awesome-lite.css"
// import "../css/activity-index.css"

// msgpack is how we encode data for transfer over websocket
import { decodeMultiStream, decodeArrayStream } from "@msgpack/msgpack"
const argstr = document.getElementById("runtime_json").innerText
const args = JSON.parse(argstr)

const body = JSON.stringify(args["query_obj"])

async function run() {
  const response = await fetch(args["query_url"], {
    method: "POST",
    headers: {
      Accept: "application/msgpack",
      "Content-Type": "application/msgpack",
    },
    body: body,
  })
  // TODO continue here

  const streamReader = response.body.getReader()
  for await (const item of decodeArrayStream(streamReader)) {
    console.log(item);
  }
}

;(async () => {
  try {
    await run()
  } catch (e) {
    console.log("oops. ", e)
  }
})()
