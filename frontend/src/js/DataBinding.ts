/**
 * DataBinding.ts -- Lightweight data-binding
 * Efrem Rensi 8/2020, 3/2022
 */

/**
 * Spec for binding an HTML element in the HTML code
 * @property class - the grouping of this element (which bounded object this will be part of)
 * @property bind - The name of the variable this will be bound to
 * @property prop - The property of this element that is bound
 * @property attr - The attribute of this element thatis bound
 *
 * For example we might have an HTML element
 *  <span class="foo" data-bind="name" data-class="user" prop="innerText"></span>
 *
 */
interface HTMLBindingSpec extends DOMStringMap {
  bind: string
  prop?: string
  attr?: string
  event?: string
}

interface BoundHTMLElement extends HTMLElement {
  dataset: HTMLBindingSpec
}

/**
 * An object that defines a DOM binding
 *  {@see https://javascript.info/dom-attributes-and-properties#non-standard-attributes-dataset})
 * about DOM element properties vs attributes
 *  For "data-*" bindings use attribute.
 */
type DOMBindingSpec = {
  element?: HTMLElement
  selector?: string
  attribute?: string
  property?: string
  event?: string
  DOMformat?: (x: unknown) => string
  varFormat?: (x: unknown) => string
}

// This is the binding that is stored and retreived on an event
type DOMBinding = {
  element: HTMLElement // you
  attribute?: string
  property?: string
  format: (x: unknown) => string
}

type GeneralBinding = (x: unknown) => void
type ObjectKey = string | number
type dict = Record<ObjectKey, unknown>

// A dummy function that returns its input
const str = (x: unknown): string => String(x)

function setAttribute(
  element: HTMLElement,
  attribute: string,
  value?: string
): void {
  if (value) {
    element.setAttribute(attribute, value)
  } else {
    element.removeAttribute(attribute)
  }
}

/*
 * Create a clone of defaults, replaced by truthy values (or 0) from obj
 * Kind of like Object.assign
 */
export function mergeDefaults(defaults: dict, obj: dict): dict {
  const newObj = { ...defaults }
  for (const [key, val] of Object.entries(obj)) {
    if (val || val === 0) {
      newObj[key] = obj[key]
    }
  }
  return newObj
}

/**
 * A BoundVariable object has a value that can be bound to a DOM elelment
 *   or other arbitrary obejct.  It is used to sync properties between
 *   two or more objects.  It consists of a getter and setter for the value
 *   as well as one or more two-way bindings.
 *
 * @property #value - The value of this bound variable
 */
export class BoundVariable {
  #value: unknown
  DOMbindings: DOMBinding[]
  generalBindings: GeneralBinding[]

  constructor(value?: unknown) {
    this.DOMbindings = null
    this.generalBindings = null
    this.#value = value
  }

  toString(): string {
    return `<bound ${this.#value}>`
  }

  get(): unknown {
    return this.#value
  }

  set(newValue: unknown): void {
    this.#value = newValue

    if (this.DOMbindings) {
      // Update all bound DOM elments
      for (const { element, property, attribute, format } of this.DOMbindings) {
        const newValueFormatted = format(newValue)

        if (property) {
          element[property] = newValueFormatted
        } else {
          setAttribute(element, attribute, newValueFormatted)
        }
      }
    }

    if (this.generalBindings) {
      // Call all bound hooks
      for (const onChange of this.generalBindings) {
        onChange(newValue)
      }
    }
  }

  get value(): unknown {
    return this.#value
  }

  set value(newValue: unknown) {
    this.set(newValue)
  }

  /**
   * Sync this value with an attribute of a DOM element.
   *
   */
  addDOMbinding({
    selector,
    element,
    attribute,
    event,
    property = "value",
    DOMformat = str,
    varFormat = str,
  }: DOMBindingSpec): BoundVariable {
    const el = element || document.querySelector(selector)

    if (!(el instanceof HTMLElement)) {
      throw new TypeError("invalid HTMLElement")
    }

    if (!el.hasAttribute(attribute)) {
      console.warn(`"${attribute}" is not a standard attribute for `, el)
    }

    /* If an attribute is specified then it takes precedence over a property
     *   see https://javascript.info/dom-attributes-and-properties
     */
    const accessor = attribute ? "attribute" : "property"
    const domBinding: DOMBinding = {
      element: el,
      [accessor]: attribute || property,
      format: DOMformat,
    }

    if (event && event !== "none") {
      const getValue = attribute
        ? () => el.getAttribute(attribute)
        : () => el[property]

      const setValue = () => this.set(varFormat(getValue()))

      el.addEventListener(event, setValue)
    }

    if (this.DOMbindings) {
      this.DOMbindings.push(domBinding)
    } else {
      this.DOMbindings = [domBinding]
    }

    const formattedVal = DOMformat(this.#value)

    if (attribute) {
      setAttribute(el, attribute, formattedVal)
    } else {
      el[property] = formattedVal
    }

    return this
  }

  /**
   * Call a specified function with the new value whenever this value changes.
   */
  onChange(func: GeneralBinding): BoundVariable {
    if (this.generalBindings) {
      this.generalBindings.push(func)
    } else {
      this.generalBindings = [func]
    }
    return this
  }
}

/**
 * An object with {@link BoundVariable}s as properties.
 * The value of a {@link BoundVariable} x is accessed
 *  via x.value (the "value" property)
 *  or using accessor methods x.get() and x.set().
 *
 *  {@link BoundObject} allows us to keep a collection of
 *    {@link BoundVariable} objects and access them as if they were properties.
 *
 *  @example
 *  col = new {@link BoundObject};
 *  col.add("size", new BoundVariable(23));
 *  // col.size == 23
 *
 *  @param {Object} binds - The {@BoundVariable}s referenced by key.
 */
export class BoundObject extends Object {
  #boundVariables: { [prop: string]: BoundVariable }

  constructor() {
    super()
    this.#boundVariables = {}
    Object.defineProperty(this, "#boundVariables", {
      enumerable: false,
    })
  }

  /**
   * Add a {@link BoundVariable} to this {@BoundObject}.
   * @param {String|Number} key - The "property" name
   * @param value - An existing {@link BoundVariable} object.
   */
  addBoundVariable(key: ObjectKey, bv: BoundVariable): BoundVariable {
    this.#boundVariables[key] = bv

    Object.defineProperty(this, key, {
      get: function () {
        return this.#boundVariables[key].get()
      }.bind(this),

      set: function (newValue) {
        this.#boundVariables[key].set(newValue)
      }.bind(this),

      enumerable: true,
    })

    return bv
  }

  /**
   * Create a {@link BoundVariable} and add it to this {@link BoundObject}
   *   as a property.
   * @param {String|Number} key - The "property" name
   * @param value - Initial value for the new
   *                "property" {@link BoundVariable} object.
   */
  addProperty(key: ObjectKey, value?: unknown): BoundVariable {
    return this.addBoundVariable(key, new BoundVariable(value))
  }

  /**
   * Add a DOM binding to one of the properties
   */
  addDOMbinding(key: ObjectKey, spec: DOMBindingSpec): BoundVariable {
    return this.#boundVariables[key].addDOMbinding(spec)
  }

  /**
   * Call a function with the new value whenever the specified property
   * (or any property) changes.
   *
   * @param {String} [key] - (optional) property name to which we
   *             add this hook
   * @param {function} func - If key is specified, func is a function that
   * accepts one argument: the new value for the specified property.
   * It gets called when the value assoicated with key changes.
   * If key is not specified, func takes two arguments, the property
   * that has changed, and the new value.
   */
  onChange(func: GeneralBinding, key?: ObjectKey): BoundObject {
    if (key) {
      this.#boundVariables[key].onChange(func)
    } else {
      for (const bv of Object.values(this.#boundVariables)) {
        bv.onChange((newVal) => func(newVal))
      }
    }
    return this
  }

  /**
   * Add new properties or DOM bindings to existing properties from a regular Object.
   *  Each property possibly is bound to a DOM element.
   *  i.e. if obj["key"] and a DOM element with data-bind="key" both
   *  exist then the "key" property is bound with that element.
   *
   * @param  {Object} obj
   * @param {DOMbinding} [defaults] - defaults for {@link DOMbinding} properties
   *    that are not specified in the HTML data-* attributes.
   * @return {BoundObject}
   */
  addFromObject(obj: dict, defaults: DOMBindingSpec = {}): BoundObject {
    for (const [key, val] of Object.entries(obj)) {
      const bv = this.#boundVariables[key] || this.addProperty(key, val)
      const elements: NodeListOf<HTMLElement> = document.querySelectorAll(
        `[data-bind=${key}]`
      )

      for (const el of elements) {
        const { attr, prop, event } = el.dataset
        bv.addDOMbinding(
          mergeDefaults(defaults, {
            element: el,
            property: prop,
            attribute: attr,
            event: event,
          })
        )
      }
    }
    return this
  }

  /**
   * Add new properites or DOM bindings to existing properties from DOM elements.
   *
   * @param  {String} selector - DOM elements matching this selector
   *            will be considered.
   * @param {DOMBindingSpec} [defaults] - defaults for {@link DOMBindingSpec} properties
   *    that are not specified in the HTML data-* attributes.
   * @return {@BoundObject}
   */
  addFromDOMelements(
    selector: string,
    defaults: DOMBindingSpec = {}
  ): BoundObject {
    const elements: NodeListOf<BoundHTMLElement> =
      document.querySelectorAll(selector)
    for (const el of elements) {
      const { bind: key, attr, prop, event } = <HTMLBindingSpec>el.dataset
      const bv = this.#boundVariables[key] || this.addProperty(key)

      bv.value = bv.value || el.getAttribute(attr) || el[prop]

      bv.addDOMbinding(
        mergeDefaults(defaults, {
          element: el,
          attribute: attr,
          property: prop,
          event: event,
        })
      )
    }
    return this
  }

  /**
   * Create a new {@BoundObject} from a regular Object,
   *  with each property possibly bound to a DOM element.
   *  i.e. if obj["key"] and a DOM element with data-bind="key" both
   *  exist then the "key" property is bound with that element.
   *
   * @param  {Object} obj
   * @param {DOMbinding} [defaults] - defaults for {@link DOMbinding} properties
   *    that are not specified in the HTML data-* attributes.
   * @return {BoundObject}
   */
  static fromObject(...args): BoundObject {
    const bObj = new BoundObject()
    return bObj.addFromObject(...args)
  }

  /**
   * Create a {@link BoundObject} from DOM elements
   *
   * @param  {String} selector - DOM elements matching this selector
   *                           will be considered.
   * @param {DOMbinding} [defaults] - defaults for {@link DOMbinding} properties
   *    that are not specified in the HTML data-* attributes.
   * @return {@BoundObject}
   */
  static fromDOMelements(...args): BoundObject {
    const bObj = new BoundObject()
    return bObj.addFromDOMelements(...args)
  }

  /**
   * @return {Object} -- A regular Object "snapshot"
   * of this {@link BoundBoject}
   */
  toObject(): dict {
    const output = {}
    for (const [k, v] of Object.entries(this.#boundVariables)) {
      output[k] = v.value
    }
    return output
  }
}

type CallbackFunction<T> = (newval: T) => void
type Binding<T> = [T, CallbackFunction<T>[]]

export type Evented<T> = T & {
  onChange: <T, K extends keyof T>(
    key: K,
    callback: CallbackFunction<T[K]>,
    trigger?: boolean
  ) => void
}

/**
 * A JavaScript Object with an onChange method
 */
export class EventedObject {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #bindings: any

  constructor(obj: unknown) {
    Object.assign(this, obj)
    this.#bindings = {}
  }

  static from<T extends typeof EventedObject, O>(this: T, obj?: O) {
    return new this(obj) as O & InstanceType<T>
  }

  onChange<O, K extends keyof O>(
    this: O & EventedObject,
    key: K,
    callback: CallbackFunction<O[K]>,
    trigger = true
  ): void {
    type V = O[K]
    let binding: Binding<V> = this.#bindings[key]

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
            const listeners = binding[1]
            for (const callback of listeners) callback(newValue)
          }, DEBOUNCE_DELAY)
        },
        enumerable: true,
      })

      if (trigger) callback(val)
    }
  }
}

const DEBOUNCE_DELAY = 20
function debounce(func: () => void, timeout: number) {
  let timer: number
  return () => {
    clearTimeout(timer)
    timer = setTimeout(() => func(), timeout)
  }
}
