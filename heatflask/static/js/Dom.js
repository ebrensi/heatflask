
// This will eventually replace JQuery

const Dom = {
    el: function(selector) {
        if (selector[0] == "#")
            return document.querySelector(selector);
        else if (selector[0] = ".")
            return document.querySelectorAll(selector);
    },

    doFunc: function(selector, func) {
        const el = this.el(selector);
        if (!el) {
            console.warn(`DOM element "${selector}" does not exist.`);
            return
        } else if (NodeList.prototype.isPrototypeOf(el)) {
            const elList = el,
                  result = [];

            for (const el of elList) 
                result.push(func(el));
            return result
        } else
            return func(el);
    },

    // get or set a property of a dom element or class of elements
    prop: function prop(string, prop, val) {
        if (val === undefined)   
            return this.doFunc(string, el => el[prop]); 
        else
            return this.doFunc(string, el => el[prop] = val);
    },

    set: function set(string, val) {
        return this.prop(string, "value", val)
    },

    get: function get(string) {
        return this.prop(string, "value")
    },

    html: function html(string, val) {
        return this.prop(string, "innerHTML", val)
    },

    addEvent: function addEvent(string, eventName, eventHandler) {
        this.doFunc(string, el => {
            el.addEventListener(eventName, eventHandler)
        });
    },

    trigger: function trigger(string, eventType) {
        this.doFunc(string, el => {
            const event = document.createEvent('HTMLEvents');
            event.initEvent(eventType, true, false);
            el.dispatchEvent(event);
        });        
    },

    fade: function fade(string, out) {
        let ops;
        if (out)
            ops = {add: "hide", remove:"show"};
        else
            ops = {add: "show", remove: "hide"};

        this.doFunc(string, el => {
            el.classList.add(ops.add);
            el.classList.remove(ops.remove);
        });
    },

    fadeIn: function fadeIn(string) {
        return this.fade(string, false);
    },

    fadeOut: function fadeOut(string) {
        return this.fade(string, true);
    },

    setDisplayStyle: function(string, style) {
        this.doFunc(string, el => el.style.display = style);
    },

    show: function(string) {
        this.setDisplayStyle(string, "");
    },

    hide: function(string) {
        this.setDisplayStyle(string, "none");
    }

}
