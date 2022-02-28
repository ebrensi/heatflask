/*
 * This is the script for the heatflask activity-list view
 * index_page.html.
 */

// css for Bundler
import "../ext/min_entireframework.css"
// import "../css/font-awesome-lite.css"
// import "../css/activity-index.css"

// msgpack is how we encode data for transfer over websocket
// import { decodeMultiStream, decodeArrayStream } from "@msgpack/msgpack"

async function run() {
  const response = await fetch(query_url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: query_obj_str,
  })
  console.log(response)
  // const tot = await response.body()
  // console.log(tot)
  // const streamReader = response.body.getReader()
  // for await (const item of decodeArrayStream(streamReader)) {
  //   console.log(item);
  // }
}

;(async () => {
  try {
    await run()
  } catch (e) {
    console.log("oops. ", e)
  }
})()
