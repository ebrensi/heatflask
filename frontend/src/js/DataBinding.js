/*
 * DataBinding.js -- Lightweight data-binding
 * Efrem Rensi 8/2020
 */

const identity = (x) => x;

/**
 * @typedef {DOMbinding}
 * @param {HTMLElement} [element] - The DOM element
 * @param {String} [selector] Optionally, a selector for the DOM element
 * @param {String} [attribute="value"] - The attribute to sync
 *                 (eg. "value", "checked", "href", "innerHTML", etc.)
 * @param {String} [event] - The event on which to update the value
 *         (eg. "change", "keyup", etc). "none" is the same as not having an event.
 * @param {function} [DOMformat] - A function that converts the varible value
 *                                    to be displayed in the DOM.
 * @param {function} [varFormat] - A function that converts the DOM value to
 *                                    the variable value.
 */

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
    // console.log(newValue);

    for (let i = 0; i < this.countDB; i++) {
      const binding = this.DOMbindings[i];
      binding.element[binding.attribute] = binding.format(newValue);
    }

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
      element,
      attribute = "value",
      DOMformat = identity,
      event,
      varFormat = identity,
    } = DOMbinding;

    const binding = {
      element: element,
      attribute: attribute,
      format: DOMformat,
    };

    if (event && event !== "none") {
      element.addEventListener(
        event,
        function () {
          this.set(varFormat(element[attribute]));
        }.bind(this)
      );
    }

    this.DOMbindings.push(binding);
    this.countDB = this.DOMbindings.length;

    element[attribute] = this.#value;

    return this;
  }

  /**
   * Add a general binding. Use this to trigger a function whenever
   * this value changes.
   *
   * @param {function} onChange - A function that gets called when the
   *   value of this property changes
   */
  addGeneralBinding(onChange) {
    this.generalBindings.push(onChange);
    this.countGB = this.generalBindings.length;

    setRemote(this.#value);

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
 *  For example, for col = new {@link BoundObject} and
 *  col.add("size", new {@link BoundVariable}(23)):
 *
 *  @example col.size == 23
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
   * Create a {@link BoundVariable} and add it to this {@link BoundObject}
   *   as a property..
   * @param {String|Number} key - The "property" name
   * @param value - Initial value for the new
   *                "property" {@link BoundVariable} object.
   */
  addProperty(key, value) {
    return this.addBoundVariable(key, new BoundVariable(value));
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
   * See the
   * @param {String|Number} key
   * @param {DOMbinding} binding
   */
  addDOMbinding(key, DOMbinding) {
    return this.boundVariables[key].addDOMbinding(DOMbinding);
  }

  /**
   * Add a general binding. Use this to trigger a function whenever
   * the specified property changes.
   *
   * @param {function} onChange - A function that gets called when the
   *   value of this property changes
   */
  addGeneralBinding(key, onChange) {
    return this.boundVariables[key].addGeneralBinding(onChange);
  }

  /**
   * @return {Object} -- A regular Object "snapshot"
   * of this {@link BoundBoject}
   */
  toObject() {
    return Object.assign({}, this);
  }

  /**
   * Create a new {@BoundObject} from a regular Object,
   *  with each property possibly bound with a DOM element.
   *  i.e. if obj["key"] and a DOM element with data-bind="key" both
   *  exist then the "key" property is bound with that element.
   *
   * @param  {Object} obj
   * @param {DOMbinding} [DOMbinding] - properties here take precedence
   * @return {BoundObject}
   */
  static fromObject(obj, DOMbinding = {}) {
    const bObj = new BoundObject();

    for (const [key, val] of Object.entries(obj)) {
      const bv = bObj.addProperty(key, val),
        elements = document.querySelectorAll(`[data-bind=${key}]`);

      for (const el of elements) {
        bv.addDOMbinding(
          Object.assign(
            {
              element: el,
              attribute: el.dataset.attr,
              event: el.dataset.event,
            },
            DOMbinding[key] || DOMbinding
          )
        );
      }
    }
    return bObj;
  }

  /**
   * Create a {@link BoundObject} from DOM elements
   *
   * @param  {String} selector - DOM elements matching this selector
   *                           will be considered.
   * @param {DOMbinding} [DOMbinding] - properties here take precedence
   * @return {@BoundObject}
   */
  static fromDOMelements(selector, DOMbinding = {}) {
    const bObj = new BoundObject();

    for (const el of document.querySelectorAll(selector)) {
      const key = el.dataset.bind;

      const bv = bObj.boundVariables[key] || bObj.addProperty(key);
      const attr = el.dataset.attr;

      bv.value = bv.value || el[attr];

      bv.addDOMbinding(
        Object.assign(
          {
            element: el,
            attribute: attr,
            event: el.dataset.event,
          },
          DOMbinding[key] || DOMbinding
        )
      );
    }
    return bObj;
  }
}
