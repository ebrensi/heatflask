/**
 *
 */
export default class Binding {
  constructor(object, property) {
    this.DOMbindings = [];
    this.countDB = 0;

    this.generalBindings = [];
    this.countGB = 0;

    this.value = object[property];

    Object.defineProperty(object, property, {
      get: this.getValue.bind(this),
      set: this.setValue.bind(this),
    });
  }

  getValue() {
    return this.value;
  }

  setValue(val) {
    this.value = val;

    for (let i = 0; i < this.countDB; i++) {
      const binding = this.DOMbindings[i];
      binding.element[binding.attribute] = val;
    }

    for (let i = 0; i < this.countGB; i++) {
      const binding = this.generalBindings[i];
      binding.set(val);
    }
  }

  addDOMbinding(element, attribute, event) {
    const binding = {
      element: element,
      attribute: attribute,
    };

    if (event) {
      element.addEventListener(event, function () {
        this.setValue(element[attribute]);
      });
      binding.event = event;
    }

    this.DOMbindings.push(binding);
    this.countDB = this.DOMbindings.length;

    element[attribute] = this.value;

    return this;
  }

  addGeneralBinding(object, setFunc) {
    const binding = {
      set: setFunc,
    };

    this.generalBindings.push(binding);
    this.countGB = this.generalBindings.length;

    setFunc(this.value);

    return function onChange(newVal) {
      this.setValue(newVal);
    };
  }
}

export class BoundVariable {
  constructor(value) {
    this.DOMbindings = [];
    this.countDB = 0;

    this.generalBindings = [];
    this.countGB = 0;

    this._value = value;
  }

  get value() {
    return this._value;
  }

  set value(newValue) {
    this._value = newValue;

    for (let i = 0; i < this.countDB; i++) {
      const binding = this.DOMbindings[i];
      binding.element[binding.attribute] = newValue;
    }

    for (let i = 0; i < this.countGB; i++) {
      const binding = this.generalBindings[i];
      binding.set(newValue);
    }
  }

  addDOMbinding(element, attribute, event) {
    const binding = {
      element: element,
      attribute: attribute,
    };

    if (event) {
      element.addEventListener(event, function () {
        this.set(element[attribute]);
      }.bind(this));
    }

    this.DOMbindings.push(binding);
    this.countDB = this.DOMbindings.length;

    element[attribute] = this._value;

    return this;
  }

  addGeneralBinding(object, setFunc) {
    const binding = {
      set: setFunc,
    };

    this.generalBindings.push(binding);
    this.countGB = this.generalBindings.length;

    setFunc(this._value);

    return function onChange(newVal) {
      this.set(newVal);
    };
  }
}
