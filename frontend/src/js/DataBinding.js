/**
 * DataBinding.js -- Lightweight data-binding
 * Efrem Rensi 8/2020
 *
 * @module
 */

/**
 * An object that defines a DOM binding
 *  {@see https://javascript.info/dom-attributes-and-properties#non-standard-attributes-dataset})
 * about DOM element properties vs attributes
 *  For "data-*" bindings use attribute.
 *
 * @typedef {Object} DOMbinding
 *
 * @param {HTMLElement} [element] - The DOM element
 *
 * @param {String} [selector] Optionally, a selector for the DOM element.
 *
 * @param {String} [attribute] - The DOM element attribute to bind. Note that
 *    property and attribute are mutually exclusive, with attribute preferred
 *    if it is present.
 *
 * @param {String} [property="value"] - The DOM element property to bind
 *                         (eg. "value", "checked", "href", "innerHTML", etc.)
 *
 * @param {String} [event] - The event on which to update the value
 *         (eg. "change", "keyup", etc). "none" is the same as not having an event.
 *
 * @param {function} [DOMformat] - A function that converts the varible value
 *                                    to be displayed in the DOM.
 *
 * @param {function} [varFormat] - A function that converts the DOM value to
 *                                    the variable value.
 */

const identity = (x) => x;

function setAttribute(element, attribute, value) {
  if (value) {
    element.setAttribute(attribute, value);
  } else {
    element.removeAttribute(attribute);
  }
}

/* Replace any falsey values of obj with values from defaults.
 * This function possibly modifies obj.
 */
function mergeDefaults(defaults, obj) {
  const newObj = Object.assign({}, defaults);
  for (const key in obj) {
    if (obj[key]) {
      newObj[key] = obj[key];
    }
  }
  return newObj;
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
  // #value is private.  We don't want the user accessing it directly
  #value; // eslint-disable-line

  /**
   * @param value An initial value
   */
  constructor(value) {
    this.DOMbindings = [];
    this.countDB = 0;

    this.generalBindings = [];
    this.countGB = 0;

    this.#value = value;
  }

  toString() {
    return this.#value.toString();
  }

  /**
   * @return The current value of this variable
   */
  get() {
    return this.#value;
  }

  /**
   * Set a new value for this variable
   * @param newValue the new value
   */
  set(newValue) {
    this.#value = newValue;
    console.log(newValue);

    // Update all bound DOM elments
    for (let i = 0; i < this.countDB; i++) {
      const { element, property, attribute, format } = this.DOMbindings[i];
      const val = format(newValue);

      if (property) {
        element[property] = val;
      } else {
        setAttribute(element, attribute, val);
      }
    }

    // Call all bound hooks
    for (let i = 0; i < this.countGB; i++) {
      const onChange = this.generalBindings[i];
      onChange(newValue);
    }
  }

  get value() {
    return this.#value;
  }

  set value(newValue) {
    this.set(newValue);
  }

  /**
   * Sync this value with an attribute of a DOM element.
   *
   * @param {DOMbinding} DOMbinding - specs for the element to bind
   */
  addDOMbinding(DOMbinding) {
    const {
      selector,
      element,
      attribute,
      property = "value",
      DOMformat = identity,
      event,
      varFormat = identity,
    } = DOMbinding;

    const el = element || document.querySelector(selector);

    if (!(el instanceof HTMLElement)) {
      throw new TypeError("invalid HTMLElement");
    }

    // if (!el.hasAttribute(attribute)) {
    //   console.warn(`"${attribute}" is not a standard attribute for `, el);
    // }

    /* If an attribute is specified then it takes precedence over a property
     *   see https://javascript.info/dom-attributes-and-properties
     */
    const accessor = attribute ? "attribute" : "property",
      binding = {
        element: el,
        [accessor]: attribute || property,
        format: DOMformat,
      };

    if (event && event !== "none") {
      const getValue = attribute
        ? () => el.getAttribute(attribute)
        : () => el[property];

      const setValue = () => this.set(varFormat(getValue()));

      el.addEventListener(event, setValue);
    }

    this.DOMbindings.push(binding);
    this.countDB = this.DOMbindings.length;

    const val = DOMformat(this.#value);

    if (attribute) {
      setAttribute(el, attribute, val);
    } else {
      el[property] = val;
    }

    return this;
  }

  /**
   * Call a function whenever
   * this value changes.
   *
   * @param {function} func - A function that gets called when the
   *   value of this property changes
   */
  onChange(func) {
    this.generalBindings.push(func);
    this.countGB = this.generalBindings.length;

    func(this.#value);

    return this;
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
  constructor() {
    super();
    this.boundVariables = {};
    Object.defineProperty(this, "boundVariables", {
      enumerable: false,
    });
  }

  /**
   * Add a {@link BoundVariable} to this {@BoundObject}.
   * @param {String|Number} key - The "property" name
   * @param value - An existing {@link BoundVariable} object.
   */
  addBoundVariable(key, bv) {
    this.boundVariables[key] = bv;

    Object.defineProperty(this, key, {
      get: function () {
        return this.boundVariables[key].get();
      }.bind(this),

      set: function (newValue) {
        this.boundVariables[key].set(newValue);
      }.bind(this),

      enumerable: true,
    });

    return bv;
  }

  /**
   * Create a {@link BoundVariable} and add it to this {@link BoundObject}
   *   as a property.
   * @param {String|Number} key - The "property" name
   * @param value - Initial value for the new
   *                "property" {@link BoundVariable} object.
   */
  addProperty(key, value) {
    return this.addBoundVariable(key, new BoundVariable(value));
  }

  /**
   * Add a DOM binding to one of the properties
   * @param {String|Number} key
   * @param {DOMbinding} binding
   */
  addDOMbinding(key, DOMbinding) {
    return this.boundVariables[key].addDOMbinding(DOMbinding);
  }

  /**
   * Call a function with the new value whenever
   * the specified property changes.
   *
   * @param {function} func - A function that accepts one argument:
   * the new value for the specifid property. It gets called when the
   *   value of this property changes.
   */
  onChange(key, func) {
    return this.boundVariables[key].onChange(func);
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
  addFromObject(obj, defaults = {}) {
    for (const [key, val] of Object.entries(obj)) {
      const bv = this.boundVariables[key] || this.addProperty(key, val),
        elements = document.querySelectorAll(`[data-bind=${key}]`);

      for (const el of elements) {
        const { attr, prop, event } = el.dataset;
        bv.addDOMbinding(
          mergeDefaults(defaults,
            {
              element: el,
              property: prop,
              attribute: attr,
              event: event,
            }
          )
        );
      }
    }
    return this;
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
  addFromDOMelements(selector, defaults = {}) {
    for (const el of document.querySelectorAll(selector)) {
      const { bind: key, attr, prop, event } = el.dataset;
      const bv = this.boundVariables[key] || this.addProperty(key);

      bv.value = bv.value || el.getAttribute(attr) || el[prop];

      bv.addDOMbinding(
        mergeDefaults(defaults,
          {
            element: el,
            attribute: attr,
            property: prop,
            event: el.dataset.event,
          },
        )
      );
    }
    return this;
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
  static fromObject(...args) {
    const bObj = new BoundObject();
    return bObj.addFromObject(...args);
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
  static fromDOMelements(...args) {
    const bObj = new BoundObject();
    return bObj.addFromDOMelements(...args);
  }

  /**
   * @return {Object} -- A regular Object "snapshot"
   * of this {@link BoundBoject}
   */
  toObject() {
    return Object.assign({}, this);
  }
}
