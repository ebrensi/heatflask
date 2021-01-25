/*
 * This module is meant to be able to run off the main thread,
 * or possibly compiled into WebAssembly.  It must have minimal
 * dependencies and use only primitive data-types.
 */

// const imports = {}

import { DEV_BUNDLE } from "../Env"
const sourceFilePath = DEV_BUNDLE? "dev.wasm" : "prod.wasm"

export let everything
export const exports = {}
export { exports as default }

/*
 * Instantiate a WebAssembly using standard API
 */
// wasmBrowserInstantiate(sourceFilePath /* { ... } */).then(resultObject => {
//     everything = ResultObject
//     Object.assign(exports, resultObject.instance.exports)
// })

/*
 * Instantiate a WebAssembly using AssemblyScript Loader.  This provides
 * more functionality than the standard WebAssembly API
 * (see https://www.assemblyscript.org/loader.html)
 * but adds some overhead.
 */
import loader from "@assemblyscript/loader"
loader.instantiate(fetch(sourceFilePath) /* { ... } */).then(resultObject => {
    everything = resultObject
    Object.assign(exports, resultObject.exports)
})

// --------------------------------------------------------------------------

type ResultObject = {
  module: WebAssembly.Module,
  instance: WebAssembly.Instance
}


/*
 * Adapted from
 * https://github.com/torch2424/wasm-by-example/blob/master/demo-util/
 */

export async function wasmBrowserInstantiate(
  wasmModuleUrl: string,
  importObject?: Object
): Promise<ResultObject> {
  let response = undefined

  if (!importObject) {
    importObject = {
      env: {
        abort: () => console.log("Abort!"),
      },
    }
  }

  // Check if the browser supports streaming instantiation
  if (WebAssembly.instantiateStreaming) {
    // Fetch the module, and instantiate it as it is downloading
    response = await WebAssembly.instantiateStreaming(
      fetch(wasmModuleUrl),
      importObject
    )
  } else {
    // Fallback to using fetch to download the entire module
    // And then instantiate the module
    const fetchAndInstantiateTask = async () => {
      const wasmArrayBuffer = await fetch(wasmModuleUrl).then((response) =>
        response.arrayBuffer()
      )
      return WebAssembly.instantiate(wasmArrayBuffer, importObject)
    }
    response = await fetchAndInstantiateTask()
  }

  return response
}
