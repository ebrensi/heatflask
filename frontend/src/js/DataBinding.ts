/**
 * DataBinding.ts -- Lightweight data-binding
 * Efrem Rensi 8/2020
 */

/**
 * An object that defines a DOM binding
 *  {@see https://javascript.info/dom-attributes-and-properties#non-standard-attributes-dataset})
 * about DOM element properties vs attributes
 *  For "data-*" bindings use attribute.
 */
interface DOMBindingSpec {
  element?: HTMLElement
  selector?: string
  attribute?: string
  property?: string
  event?: string
  DOMformat?: (x: any) => string
  varFormat?: (x: any) => string
}

interface DOMBinding {
  element: HTMLElement
  attribute?: string
  property?: string
  format: (x: any) => string
}

type ObjectKey = string | number

// A dummy function that returns its input
const identity = (x: any): any => x

function setAttribute(
  element: HTMLElement,
  attribute: string,
  value?: unknown
): void {
  if (value) {
    element.setAttribute(attribute, value)
  } else {
    element.removeAttribute(attribute)
  }
}

/*
 * Create a clone of defaults, replaced by truthy values (or 0) from obj
 */
function mergeDefaults(defaults: Object, obj: Object): Object {
  const newObj = Object.assign({}, defaults) // clone defaults
  for (const key in obj) {
    const val = obj[key]
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
 * @property value - The value of this bound variable
 */
export class BoundVariable {
  #value: any // eslint-disable-line
  DOMbindings: DOMBinding[]
  countDB: number
  generalBindings: Array<(x: any) => any>
  countGB: number

  constructor(value?: any) {
    this.DOMbindings = []
    this.countDB = 0

    this.generalBindings = []
    this.countGB = 0

    this.#value = value
  }

  toString(): string {
    return this.#value.toString()
  }

  /**
   * @return The current value of this variable
   */
  get(): any {
    return this.#value
  }

  /**
   * Set a new value for this variable
   * @param newValue the new value
   */
  set(newValue: any): void {
    this.#value = newValue

    // Update all bound DOM elments
    for (let i = 0; i < this.countDB; i++) {
      const { element, property, attribute, format } = this.DOMbindings[i]
      const val = format(newValue)

      if (property) {
        element[property] = val
      } else {
        setAttribute(element, attribute, val)
      }
    }

    // Call all bound hooks
    for (let i = 0; i < this.countGB; i++) {
      const onChange = this.generalBindings[i]
      onChange(newValue)
    }
  }

  get value(): any {
    return this.#value
  }

  set value(newValue: any): void {
    this.set(newValue)
  }

  /**
   * Sync this value with an attribute of a DOM element.
   *
   * @param {DOMbinding} DOMbindingSpec - specs for the element to bind
   */
  addDOMbinding(DOMbindingSpec: DOMBindingSpec): BoundVariable {
    const {
      selector,
      element,
      attribute,
      property = "value",
      DOMformat = identity,
      event,
      varFormat = identity,
    } = DOMbindingSpec

    const el = element || document.querySelector(selector)

    if (!(el instanceof HTMLElement)) {
      throw new TypeError("invalid HTMLElement")
    }

    // if (!el.hasAttribute(attribute)) {
    //   console.warn(`"${attribute}" is not a standard attribute for `, el);
    // }

    /* If an attribute is specified then it takes precedence over a property
     *   see https://javascript.info/dom-attributes-and-properties
     */
    const accessor = attribute ? "attribute" : "property"
    const binding = {
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

    this.DOMbindings.push(binding)
    this.countDB = this.DOMbindings.length

    const val = DOMformat(this.#value)

    if (attribute) {
      setAttribute(el, attribute, val)
    } else {
      el[property] = val
    }

    return this
  }

  /**
   * Call a specified function with the new value whenever this value changes.
   */
  onChange(func: (x: any) => any): BoundVariable {
    this.generalBindings.push(func)
    this.countGB = this.generalBindings.length
    return this
  }
}

interface BO {
  [prop: string]: BoundVariable
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
  boundVariables: BO

  constructor() {
    super()
    this.boundVariables = {}
    Object.defineProperty(this, "boundVariables", {
      enumerable: false,
    })
  }

  /**
   * Add a {@link BoundVariable} to this {@BoundObject}.
   * @param {String|Number} key - The "property" name
   * @param value - An existing {@link BoundVariable} object.
   */
  addBoundVariable(key: ObjectKey, bv: BoundVariable): BoundVariable {
    this.boundVariables[key] = bv

    Object.defineProperty(this, key, {
      get: function () {
        return this.boundVariables[key].get()
      }.bind(this),

      set: function (newValue) {
        this.boundVariables[key].set(newValue)
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
  addProperty(key: ObjectKey, value?: any): BoundVariable {
    return this.addBoundVariable(key, new BoundVariable(value))
  }

  /**
   * Add a DOM binding to one of the properties
   */
  addDOMbinding(key: ObjectKey, DOMbindingSpec: DomBindingSpec): BoundVariable {
    return this.boundVariables[key].addDOMbinding(DOMbindingSpec)
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
  onChange(key: ObjectKey, func: (x: any) => any): BoundVariable | void {
    if (func) {
      return this.boundVariables[key].onChange(func)
    } else {
      func = key
      for (const [prop, bv] of Object.entries(this.boundVariables)) {
        bv.onChange((newVal) => func(newVal))
      }
    }
  }

  /**
   * Add new properties or DOM bindings to existing properties from a regular Object.
   *  Each property possibly is bound to a DOM element.
   *  i.e. if obj["key"] and a DOM element with data-bi`nd="key" both
   *  exist then the "key" property is bound with that element.
   *
   * @param  {Object} obj
   * @param {DOMbinding} [defaults] - defaults for {@link DOMbinding} properties
   *    that are not specified in the HTML data-* attributes.
   * @return {BoundObject}
   */
  addFromObject(obj: Object, defaults: DOMBindingSpec = {}): BoundObject {
    for (const [key, val] of Object.entries(obj)) {
      const bv = this.boundVariables[key] || this.addProperty(key, val),
        elements = document.querySelectorAll(`[data-bind=${key}]`)

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
   * @param {DOMbinding} [defaults] - defaults for {@link DOMbinding} properties
   *    that are not specified in the HTML data-* attributes.
   * @return {@BoundObject}
   */
  addFromDOMelements(
    selector: string,
    defaults: DOMBindingSpec = {}
  ): BoundObject {
    for (const el of document.querySelectorAll(selector)) {
      const { bind: key, attr, prop, event } = el.dataset
      const bv = this.boundVariables[key] || this.addProperty(key)

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
  toObject(): Object {
    return Object.assign({}, this)
  }
}
