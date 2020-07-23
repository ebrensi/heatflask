/**
 *  Basic DOM manipulation. This is sort of a replacement for JQuery.
 *  @module
 */

/**
 * The DOM element(s) addressed by {@link selector}
 * @param  {DOMString} selector A class or id selector
 * @return {(HTMLElement|NodeList)}
 */
export function el(selector) {
  if (selector[0] == "#") {
    return document.querySelector(selector);
  } else if (selector[0] == ".") {
    return document.querySelectorAll(selector);
  }
}

function doFunc(selector, func) {
  const _el = el(selector),
        proto = Object.prototype.isPrototypeOf.call(NodeList, _el);

  if (!_el) {
    console.warn(`DOM element "${selector}" does not exist.`);
    return;
  } else if (proto) {
    const result = [];

    for (const l of _el) {
      result.push(func(l));
    }
    return result;
  } else {
    return func(_el);
  }
}

// get or set a property of a dom element or class of elements
export function prop(string, prop, val) {
  if (val === undefined) {
    return doFunc(string, (el) => el[prop]);
  } else {
    return doFunc(string, (el) => (el[prop] = val));
  }
}

/**
 * Set the value property of a DOM element
 * @param {DOMString} string The CSS selector
 * @param {(String|Number)} val  the value to set
 */
export function set(string, val) {
  return prop(string, "value", val);
}

/**
 * Get the value property of a DOM element
 * @param  {DOMString} string The CSS selector
 * @return @param {(String|Number)} The value(s) of the selected DOM elements
 */
export function get(string) {
  return prop(string, "value");
}


/**
 * Set innerHTML attribute of DOM element(s)
 * @param  {DOMString} string [description]
 * @param  {String} html
 */
export function html(string, html) {
  return prop(string, "innerHTML", html);
}

/**
 * Add an event listener
 * @param {DOMString} string
 * @param {String} eventName
 * @param {function} eventHandler
 */
export function addEvent(string, eventName, eventHandler) {
  doFunc(string, (el) => el.addEventListener(eventName, eventHandler));
}

/**
 * Trigger an event
 * @param  {DOMString} string
 * @param  {String} eventType
 */
export function trigger(string, eventType) {
  doFunc(string, (el) => {
    const event = document.createEvent("HTMLEvents");
    event.initEvent(eventType, true, false);
    el.dispatchEvent(event);
  });
}


function fade(string, out) {
  let ops;
  if (out) {
    ops = { add: "hide", remove: "show" };
  } else {
    ops = { add: "show", remove: "hide" };
  }

  doFunc(string, (el) => {
    el.classList.add(ops.add);
    el.classList.remove(ops.remove);
  });
}

/**
 * Fade an element in with CSS
 * @param  {DOMString} string
 */
export function fadeIn(string) {
  return fade(string, false);
}

/**
 * Fade an element out with CSS
 * @param  {DOMString} string
 */
export function fadeOut(string) {
  return fade(string, true);
}

/**
 * Set the display-style for an element
 * @param {DOMString} string
 * @param {String} the CSS style setting
 */
export function setDisplayStyle(string, style) {
  doFunc(string, (el) => (el.style.display = style));
}

/**
 * Show an element
 * @param  {DOMString} string
 */
export function show(string) {
  setDisplayStyle(string, "");
}

/**
 * hide an elelment
 * @param  {DOMString} string
 */
export function hide(string) {
  setDisplayStyle(string, "none");
}
