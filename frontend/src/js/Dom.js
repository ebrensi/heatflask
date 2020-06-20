

export function el(selector) {
    if (selector[0] == "#") {
        return document.querySelector(selector);
    }
    else if (selector[0] == ".") {
        return document.querySelectorAll(selector);
    }
}

function doFunc (selector, func) {
    const _el = el(selector);
    if (!_el) {
        console.warn(`DOM element "${selector}" does not exist.`);
        return;
    } else if (NodeList.prototype.isPrototypeOf(_el)) {
        const elList = _el,
              result = [];

        for (const el of elList) {
            result.push(func(el));
        }
        return result;
    } else {
        return func(el);
    }
}

// get or set a property of a dom element or class of elements
export function prop(string, prop, val) {
    if (val === undefined) {
        return doFunc(string, el => el[prop]);
    }
    else {
        return doFunc(string, el => el[prop] = val);
    }
}

export function set(string, val) {
    return prop(string, "value", val);
}

export function get(string) {
    return prop(string, "value");
}

export function html(string, val) {
    return prop(string, "innerHTML", val);
}

export function addEvent(string, eventName, eventHandler) {
    doFunc(string, el => el.addEventListener(eventName, eventHandler));
}

export function trigger(string, eventType) {
    doFunc(string, el => {
        const event = document.createEvent('HTMLEvents');
        event.initEvent(eventType, true, false);
        el.dispatchEvent(event);
    });
}

export function fade(string, out) {
    let ops;
    if (out) {
        ops = {add: "hide", remove:"show"};
    } else {
        ops = {add: "show", remove: "hide"};
    }

    doFunc(string, el => {
        el.classList.add(ops.add);
        el.classList.remove(ops.remove);
    });
}

export function fadeIn(string) {
    return fade(string, false);
}

export function fadeOut(string) {
    return fade(string, true);
}

export function setDisplayStyle(string, style) {
    doFunc(string, el => el.style.display = style);
}

export function show(string) {
    setDisplayStyle(string, "");
}

export function hide(string) {
    setDisplayStyle(string, "none");
}



