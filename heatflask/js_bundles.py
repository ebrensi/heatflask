import flask_assets

min_css = flask_assets.Bundle("css/min_entireframework.min.css", filters="cssmin")

Leaflet_css = flask_assets.Bundle(
    "css/leaflet.css",
    "css/leaflet-sidebar.min.css",
    "css/L.Control.Window.css",
    "css/leaflet-areaselect.css",
    "css/easy-button.css",
)

Leaflet_js = flask_assets.Bundle(
    # Minified
    "js/leaflet.js",
    "js/heatflaskTileLayer.js",
    "js/leaflet-sidebar.min.js",
    "js/download.min.js",
    # unMinified
    "js/L.Control.fps.js",
    "js/L.Control.Watermark.js",
    "js/L.Control.Window.js",
    "js/leaflet-providers.js",
    "js/leaflet-image.js",  # Tom MacWright: https://github.com/mapbox/leaflet-image
    "js/leaflet-areaselect.js",
    "js/easy-button.js",
    "js/L.SwipeSelect.js",
    "js/L.BoxHook.js",
)

DotLayer_js = flask_assets.Bundle(
    "../_DotLayer.js",
    "../DotLayer.ViewBox.js",
    "../DotLayer.DrawBox.js",
    "../DotLayer.js",
)

# we bundle javascript and css dependencies to reduce client-side overhead
bundles = {
    "dependencies_css": flask_assets.Bundle(
        "css/font-awesome-lite.css",
        min_css,
        Leaflet_css,
        "css/datatables.css",
        "css/pikaday.css",
        "../heatflask.css",
        filters="cssmin",
        output="gen/main.css",
    ),
    "dependencies_js": flask_assets.Bundle(
        # Minified
        "js/pws.min.js",  # persistent websocket https://github.com/porsager/pws
        "js/msgpack.min.js",
        "js/jquery-3.4.1.slim.min.js",
        # 'js/cash.min.js',  # cash.js is a minimal jquery substitute,
        "js/jquery.knob.min.js",  # Anthony Terrien
        "js/datatables.js",
        "js/gif2.js",  # Johan Nordberg: http://jnordberg.github.io/gif.js/
        # unMinified
        "js/Dom.js",
        "js/pikaday.js",
        "js/idb-keyval-iife.js",
        # both
        Leaflet_js,
        # Heatflask-specific code
        flask_assets.Bundle(
            flask_assets.Bundle(
                "js/BitSet.js",
                "js/Codecs.js",
                "js/MapUtil.js",
                DotLayer_js,
            ),
            flask_assets.Bundle(
                "js/strava.js",
                "js/appUtil.js",
                "../heatflask.js",
            ),
        ),
        filters=["jsmin"],
        output="gen/dependencies.js",
    ),
    "gifjs_webworker_js": flask_assets.Bundle(
        "js/gif.worker.js", output="gen/gif.worker.js"
    ),
    #  For the Splash page
    "splash_css": flask_assets.Bundle(
        min_css, "css/cover.css", filters=["cssmin"], output="gen/splash.css"
    ),
    # For pages consisting almost entirely of a table
    "basic_table_css": flask_assets.Bundle(
        "css/font-awesome-lite.css",
        min_css,
        "css/datatables.css",
        filters=["cssmin"],
        output="gen/basic_table.css",
    ),
    "basic_table_js": flask_assets.Bundle(
        "js/pws.min.js",  # persistent websocket https://github.com/porsager/pws
        "js/msgpack.min.js",
        "js/jquery-3.4.1.slim.min.js",
        "js/datatables.js",
        "js/strava.js",
        "js/appUtil.js",
        "js/Dom.js",
        filters=["jsmin"],
        output="gen/basic_table.js",
    ),
}
