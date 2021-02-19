import { DEV_BUNDLE } from "../Env"

export type { setSize } from "../../assembly/wasm"

const sourceFilePath = DEV_BUNDLE ? "dev.wasm" : "prod.wasm"

let _wasmModule: WebAssembly.Module
let _ctx: CanvasRenderingContext2D

type WasmImports = Record<string, Record<string, WebAssembly.ImportValue>>
type WasmExports = Record<string, WebAssembly.ExportValue>

const defaultWasmImports: WasmImports = {
  env: {
    abort(_msg: string, _file: string, line: number, column: number): void {
      console.error("abort called at wasm.ts:" + line + ":" + column)
    },
  },

  wasm: {
    logi(v0: number, v1?: number, v2?: number, v3?: number): void {
      console.log({ v0, v1, v2, v3 })
    },
    logf(v0: number, v1?: number, v2?: number, v3?: number): void {
      console.log({ v0, v1, v2, v3 })
    },
  },
}

// https://github.com/torch2424/wasm-by-example/blob/master/demo-util/
async function wasmBrowserInstantiate(
  wasmModuleUrl: string,
  importObject?: WasmImports
): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  let response = undefined

  importObject = importObject || defaultWasmImports

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

export async function getWasm(
  memory?: WebAssembly.Memory
): Promise<WasmExports> {
  const importObject = { ...defaultWasmImports }

  if (memory) importObject.env.memory = memory

  // If we already have the compiled module, just instantiate it
  if (_wasmModule) {
    const instance = await WebAssembly.instantiate(_wasmModule, importObject)
    return instance.exports
  }

  const result = await wasmBrowserInstantiate(sourceFilePath, importObject)
  _wasmModule = result.module
  return result.instance.exports
}

export { getWasm as default }
