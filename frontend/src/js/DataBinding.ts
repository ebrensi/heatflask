/**
 * DataBinding.ts -- Lightweight data-binding
 * Efrem Rensi 8/2020, 3/2022
 */

type CallbackFunction<V> = (newval: V) => void
type Binding<V> = [V, CallbackFunction<V>[]]
type Bindings<T> = {
  [K in keyof T]?: [T[K], CallbackFunction<T[K]>[]]
}

/**
 * A JavaScript Object with an onChange method
 */
export class LiveParams<Params> {
  #bindings: Bindings<Params>

  constructor(obj: Params) {
    Object.assign(this, obj)
    this.#bindings = {}
  }

  onChange<K extends keyof Params>(
    this: Params & LiveParams<Params>,
    key: K,
    callback: CallbackFunction<Params[K]>,
    trigger = true
  ): void {
    type V = Params[K]
    let binding = this.#bindings[key]

    if (binding) {
      const [val, callbacks] = binding
      callbacks.push(callback)
      if (trigger) callback(val)
    } else {
      const val = this[key]
      delete this[key]

      binding = this.#bindings[key] = <Binding<V>>[val, [callback]]

      Object.defineProperty(this, key, {
        get: () => this.#bindings[key][0],

        set: (newValue: V) => {
          const binding: Binding<V> = this.#bindings[key]
          binding[0] = newValue

          debounce(() => {
            const callbacks = binding[1]
            for (let i = 0; i < callbacks.length; i++) callbacks[i](newValue)
          }, CALLBACK_DEBOUNCE_DELAY)
        },
        enumerable: true,
      })

      if (trigger) callback(val)
    }
  }
}

const CALLBACK_DEBOUNCE_DELAY = 20
function debounce(func: () => void, timeout: number) {
  let timer: number
  return () => {
    clearTimeout(timer)
    timer = setTimeout(() => func(), timeout)
  }
}

export type Live<T> = T & LiveParams<T>
export function watch<T>(obj: T) {
  return new LiveParams<T>(obj) as Live<T>
}

/*
 *  Sandbox
 */
type PPP = {
  a?: string
  b?: number
  c?: Date
}

const obj: PPP = {
  a: "hello",
  b: 4,
}
const jjj = new LiveParams<PPP>(obj)
const uuu = watch<PPP>(obj)
const fff = watch<PPP>(obj)
const foop = jjj.a
const foop2 = uuu.c
