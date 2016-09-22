!function(t, e) {
    "object" == typeof exports && "object" == typeof module ? module.exports = e(require("leaflet")) : "function" == typeof define && define.amd ? define(["leaflet"], e) : "object" == typeof exports ? exports["leaflet-ant-path"] = e(require("leaflet")) : t["leaflet-ant-path"] = e(t.L)
}(this, function(t) {
    return function(t) {
        function e(i) {
            if (n[i])
                return n[i].exports;
            var a = n[i] = {
                exports: {},
                id: i,
                loaded: !1
            };
            return t[i].call(a.exports, a, a.exports, e),
            a.loaded = !0,
            a.exports
        }
        var n = {};
        return e.m = t,
        e.c = n,
        e.p = "",
        e(0)
    }([function(t, e, n) {
        "use strict";
        function i(t) {
            return t && t.__esModule ? t : {
                "default": t
            }
        }
        Object.defineProperty(e, "__esModule", {
            value: !0
        }),
        e.multiAntPath = e.MultiAntPath = e.antPath = e.AntPath = void 0;
        var a = n(1)
          , o = n(2)
          , r = i(o)
          , s = n(3)
          , u = i(s)
          , l = n(4)
          , f = i(l)
          , d = n(5)
          , h = i(d);
        n(6),
        a.Polyline.AntPath = r["default"],
        a.polyline.antPath = u["default"],
        a.MultiPolyline.MultiAntPath = f["default"],
        a.multiPolyline.multiAntPat = h["default"],
        e.AntPath = r["default"],
        e.antPath = u["default"],
        e.MultiAntPath = f["default"],
        e.multiAntPath = h["default"]
    }
    , function(e, n) {
        e.exports = t
    }
    , function(t, e, n) {
        "use strict";
        Object.defineProperty(e, "__esModule", {
            value: !0
        });
        var i = n(1)
          , a = i.FeatureGroup.extend({
            _path: null ,
            _animatedPathId: null ,
            _animatedPathClass: "leaflet-ant-path",
            options: {
                paused: !1,
                delay: 400,
                dashArray: [10, 20],
                pulseColor: "#FFFFFF"
            },
            initialize: function(t, e) {
                i.LayerGroup.prototype.initialize.call(this),
                i.Util.setOptions(this, e),
                this._map = null ,
                this._path = t,
                this._animatedPathId = "ant-path-" + (new Date).getTime(),
                this._draw()
            },
            onAdd: function(t) {
                this._map = t,
                this._map.on("zoomend", this._calculateAnimationSpeed, this),
                this._draw(),
                this._calculateAnimationSpeed()
            },
            onRemove: function(t) {
                this._map.off("zoomend", this._calculateAnimationSpeed, this),
                this._map = null ,
                i.LayerGroup.prototype.onRemove.call(this, t)
            },
            pause: function() {
                if (this.options.paused)
                    return !1;
                for (var t = document.getElementsByClassName(this._animatedPathId), e = 0; e < t.length; e++)
                    t[e].removeAttribute("style"),
                    t[e].removeAttribute("style"),
                    t[e].removeAttribute("style");
                return this.options.paused = !0
            },
            resume: function() {
                this._calculateAnimationSpeed()
            },
            _draw: function() {
                var t = {}
                  , e = {};
                (0,
                i.extend)(e, this.options),
                (0,
                i.extend)(t, this.options),
                e.color = e.pulseColor || this.options.pulseColor,
                e.className = this._animatedPathClass + " " + this._animatedPathId,
                delete t.dashArray,
                this.addLayer(new i.Polyline(this._path,t)),
                this.addLayer(new i.Polyline(this._path,e))
            },
            _calculateAnimationSpeed: function() {
                if (!this.options.paused && this._map)
                    for (var t = this._map.getZoom(), e = document.getElementsByClassName(this._animatedPathId), n = 1 + this.options.delay / 3 / t + "s", i = 0; i < e.length; i++)
                        e[i].setAttribute("style", "-webkit-animation-duration:" + n),
                        e[i].setAttribute("style", "-moz-animation-duration:" + n),
                        e[i].setAttribute("style", "animation-duration:" + n)
            }
        });
        e["default"] = a
    }
    , function(t, e, n) {
        "use strict";
        function i(t) {
            return t && t.__esModule ? t : {
                "default": t
            }
        }
        function a(t, e) {
            return new r["default"](t,e)
        }
        Object.defineProperty(e, "__esModule", {
            value: !0
        });
        var o = n(2)
          , r = i(o);
        e["default"] = a
    }
    , function(t, e, n) {
        "use strict";
        function i(t) {
            return t && t.__esModule ? t : {
                "default": t
            }
        }
        Object.defineProperty(e, "__esModule", {
            value: !0
        });
        var a = n(1)
          , o = n(2)
          , r = i(o)
          , s = a.FeatureGroup.extend({
            initialize: function(t, e) {
                this._layers = {},
                this._options = e,
                this.setLatLngs(t)
            },
            setLatLngs: function(t) {
                var e = 0
                  , n = t.length;
                for (this.eachLayer(function(i) {
                    n > e ? i.setLatLngs(t[e++]) : this.removeLayer(i)
                }, this); n > e; )
                    this.addLayer(new r["default"](t[e++],this._options));
                return this
            },
            getLatLngs: function() {
                var t = [];
                return this.eachLayer(function(e) {
                    t.push(e.getLatLngs())
                }),
                t
            },
            pause: function() {
                this.eachLayer(function(t) {
                    t.pause()
                })
            },
            resume: function() {
                this.eachLayer(function(t) {
                    t.resume()
                })
            }
        });
        e["default"] = s
    }
    , function(t, e, n) {
        "use strict";
        function i(t, e) {
            return new a.MultiAntPath(t,e)
        }
        Object.defineProperty(e, "__esModule", {
            value: !0
        });
        var a = n(4);
        e["default"] = i
    }
    , function(t, e, n) {
        var i = n(7);
        "string" == typeof i && (i = [[t.id, i, ""]]);
        n(9)(i, {});
        i.locals && (t.exports = i.locals)
    }
    , function(t, e, n) {
        e = t.exports = n(8)(),
        e.push([t.id, "@-webkit-keyframes leaflet-ant-path-animation{0%{stroke-dashoffset:100%}to{stroke-dashoffset:0%}}@keyframes leaflet-ant-path-animation{0%{stroke-dashoffset:100%}to{stroke-dashoffset:0%}}path.leaflet-ant-path{fill:none;-webkit-animation:linear infinite leaflet-ant-path-animation;animation:linear infinite leaflet-ant-path-animation}", ""])
    }
    , function(t, e) {
        t.exports = function() {
            var t = [];
            return t.toString = function() {
                for (var t = [], e = 0; e < this.length; e++) {
                    var n = this[e];
                    n[2] ? t.push("@media " + n[2] + "{" + n[1] + "}") : t.push(n[1])
                }
                return t.join("")
            }
            ,
            t.i = function(e, n) {
                "string" == typeof e && (e = [[null , e, ""]]);
                for (var i = {}, a = 0; a < this.length; a++) {
                    var o = this[a][0];
                    "number" == typeof o && (i[o] = !0)
                }
                for (a = 0; a < e.length; a++) {
                    var r = e[a];
                    "number" == typeof r[0] && i[r[0]] || (n && !r[2] ? r[2] = n : n && (r[2] = "(" + r[2] + ") and (" + n + ")"),
                    t.push(r))
                }
            }
            ,
            t
        }
    }
    , function(t, e, n) {
        function i(t, e) {
            for (var n = 0; n < t.length; n++) {
                var i = t[n]
                  , a = p[i.id];
                if (a) {
                    a.refs++;
                    for (var o = 0; o < a.parts.length; o++)
                        a.parts[o](i.parts[o]);
                    for (; o < i.parts.length; o++)
                        a.parts.push(l(i.parts[o], e))
                } else {
                    for (var r = [], o = 0; o < i.parts.length; o++)
                        r.push(l(i.parts[o], e));
                    p[i.id] = {
                        id: i.id,
                        refs: 1,
                        parts: r
                    }
                }
            }
        }
        function a(t) {
            for (var e = [], n = {}, i = 0; i < t.length; i++) {
                var a = t[i]
                  , o = a[0]
                  , r = a[1]
                  , s = a[2]
                  , u = a[3]
                  , l = {
                    css: r,
                    media: s,
                    sourceMap: u
                };
                n[o] ? n[o].parts.push(l) : e.push(n[o] = {
                    id: o,
                    parts: [l]
                })
            }
            return e
        }
        function o(t, e) {
            var n = v()
              , i = b[b.length - 1];
            if ("top" === t.insertAt)
                i ? i.nextSibling ? n.insertBefore(e, i.nextSibling) : n.appendChild(e) : n.insertBefore(e, n.firstChild),
                b.push(e);
            else {
                if ("bottom" !== t.insertAt)
                    throw new Error("Invalid value for parameter 'insertAt'. Must be 'top' or 'bottom'.");
                n.appendChild(e)
            }
        }
        function r(t) {
            t.parentNode.removeChild(t);
            var e = b.indexOf(t);
            e >= 0 && b.splice(e, 1)
        }
        function s(t) {
            var e = document.createElement("style");
            return e.type = "text/css",
            o(t, e),
            e
        }
        function u(t) {
            var e = document.createElement("link");
            return e.rel = "stylesheet",
            o(t, e),
            e
        }
        function l(t, e) {
            var n, i, a;
            if (e.singleton) {
                var o = _++;
                n = y || (y = s(e)),
                i = f.bind(null , n, o, !1),
                a = f.bind(null , n, o, !0)
            } else
                t.sourceMap && "function" == typeof URL && "function" == typeof URL.createObjectURL && "function" == typeof URL.revokeObjectURL && "function" == typeof Blob && "function" == typeof btoa ? (n = u(e),
                i = h.bind(null , n),
                a = function() {
                    r(n),
                    n.href && URL.revokeObjectURL(n.href)
                }
                ) : (n = s(e),
                i = d.bind(null , n),
                a = function() {
                    r(n)
                }
                );
            return i(t),
            function(e) {
                if (e) {
                    if (e.css === t.css && e.media === t.media && e.sourceMap === t.sourceMap)
                        return;
                    i(t = e)
                } else
                    a()
            }
        }
        function f(t, e, n, i) {
            var a = n ? "" : i.css;
            if (t.styleSheet)
                t.styleSheet.cssText = g(e, a);
            else {
                var o = document.createTextNode(a)
                  , r = t.childNodes;
                r[e] && t.removeChild(r[e]),
                r.length ? t.insertBefore(o, r[e]) : t.appendChild(o)
            }
        }
        function d(t, e) {
            var n = e.css
              , i = e.media;
            if (i && t.setAttribute("media", i),
            t.styleSheet)
                t.styleSheet.cssText = n;
            else {
                for (; t.firstChild; )
                    t.removeChild(t.firstChild);
                t.appendChild(document.createTextNode(n))
            }
        }
        function h(t, e) {
            var n = e.css
              , i = e.sourceMap;
            i && (n += "\n/*# sourceMappingURL=data:application/json;base64," + btoa(unescape(encodeURIComponent(JSON.stringify(i)))) + " */");
            var a = new Blob([n],{
                type: "text/css"
            })
              , o = t.href;
            t.href = URL.createObjectURL(a),
            o && URL.revokeObjectURL(o)
        }
        var p = {}
          , c = function(t) {
            var e;
            return function() {
                return "undefined" == typeof e && (e = t.apply(this, arguments)),
                e
            }
        }
          , m = c(function() {
            return /msie [6-9]\b/.test(window.navigator.userAgent.toLowerCase())
        })
          , v = c(function() {
            return document.head || document.getElementsByTagName("head")[0]
        })
          , y = null
          , _ = 0
          , b = [];
        t.exports = function(t, e) {
            e = e || {},
            "undefined" == typeof e.singleton && (e.singleton = m()),
            "undefined" == typeof e.insertAt && (e.insertAt = "bottom");
            var n = a(t);
            return i(n, e),
            function(t) {
                for (var o = [], r = 0; r < n.length; r++) {
                    var s = n[r]
                      , u = p[s.id];
                    u.refs--,
                    o.push(u)
                }
                if (t) {
                    var l = a(t);
                    i(l, e)
                }
                for (var r = 0; r < o.length; r++) {
                    var u = o[r];
                    if (0 === u.refs) {
                        for (var f = 0; f < u.parts.length; f++)
                            u.parts[f]();
                        delete p[u.id]
                    }
                }
            }
        }
        ;
        var g = function() {
            var t = [];
            return function(e, n) {
                return t[e] = n,
                t.filter(Boolean).join("\n")
            }
        }()
    }
    ])
});
//# sourceMappingURL=leaflet-ant-path.js.map
