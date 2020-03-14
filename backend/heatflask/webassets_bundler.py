import flask_assets
path = "../../../frontend/"

min_css = flask_assets.Bundle(
    path + 'css/min_entireframework.min.css',
    filters='cssmin'
)

Leaflet_css = flask_assets.Bundle(
    path + 'css/leaflet.css',
    path + 'css/leaflet-sidebar.min.css',
    path + 'css/L.Control.Window.css',
    path + 'css/leaflet-areaselect.css',
    path + 'css/easy-button.css'
)

Leaflet_js = flask_assets.Bundle(
    # Minified
    # path + 'js/leaflet.js',

    # unMinified
    path + 'js/leaflet-src.js',
    path + 'js/leaflet-sidebar.js',
    path + "js/heatflaskTileLayer.js",
    path + 'js/L.Control.fps.js',
    path + 'js/L.Control.Watermark.js',
    path + 'js/L.Control.Window.js',
    path + 'js/leaflet-providers.js',
    path + 'js/leaflet-image.js',  # Tom MacWright: https://github.com/mapbox/leaflet-image
    path + 'js/leaflet-areaselect.js',
    path + 'js/easy-button.js',
    path + 'js/L.SwipeSelect.js',
    path + 'js/L.BoxHook.js'
)

DotLayer_js = flask_assets.Bundle(
    path + 'js/download.min.js',
    path + 'js/DotLayer/_DotLayer.js',
    path + "js/DotLayer/DotLayer.WorkerPool.js",
    path + "js/DotLayer/DotLayer.ViewBox.js",
    path + "js/DotLayer/DotLayer.DrawBox.js",
    path + 'js/DotLayer/DotLayer.js'
)


# we bundle javascript and css dependencies to reduce client-side overhead
bundles = {
    "dependencies_css": flask_assets.Bundle(
        path + "css/font-awesome-lite.css",
        min_css,
        Leaflet_css,
        path + "css/simple-datatables.css",
        path + 'css/pikaday.css',
        path + 'css/heatflask.css',
        filters='cssmin',
        output='bundles/heatflask.css'
    ),

    "dependencies_js": flask_assets.Bundle(
        # path + "js/setup.js",

        # Minified
        path + "js/simple-datatables.js",
        # path + "js/round-slider.min.js",
        # path + "js/round-slider.js",

        path + 'js/gif2.js',  # Johan Nordberg: http://jnordberg.github.io/gif.js/
        path + 'js/pws.js', # persistent websocket https://github.com/porsager/pws
        path + 'js/pikaday.js',

        flask_assets.Bundle(
            # unMinified
            path + "js/msgpack.js",
            path + 'js/Dom.js',

            # simple_datatables_js,

            # both
            Leaflet_js,

            # Heatflask-specific code
            path + 'js/BitSet.js',
            path + 'js/Codecs.js',
            path + 'js/MapUtil.js',
            path + "js/myIdb.js",
            DotLayer_js,

            path + 'js/strava.js',
            path + 'js/appUtil.js',
            path + 'js/heatflask.js',
            # filters=["closure_js"]
        ),
        filters=["closure_js"],
        output='bundles/heatflask.js'
    ),

    "gifjs_webworker_js": flask_assets.Bundle(
        path + 'js/gif.worker.js',
        output="bundles/gifWorker.js"
    ),

    "DotLayerWorker_js": flask_assets.Bundle(
        path + 'js/DotLayer/dotLayerWorker.js',
        path + 'js/BitSet.js',
        path + 'js/Codecs.js',
        path + "js/MapUtil.js",
        filters=["closure_js"],
        output="bundles/dotLayer.worker.js"
    ),

    #  For the Splash page
    "splash_css": flask_assets.Bundle(
        min_css,
        path + 'css/cover.css',
        filters=['cssmin'],
        output='bundles/splash.css'
    ),

    # For pages consisting almost entirely of a table
    "basic_table_css": flask_assets.Bundle(
        path + "css/font-awesome-lite.css",
        min_css,
        path + 'css/simple-datatables.css',
        filters=['cssmin'],
        output='bundles/basic_table.css'
    ),

    "basic_table_js": flask_assets.Bundle(
        path + 'js/pws.js', # persistent websocket https://github.com/porsager/pws
        path + 'js/msgpack.min.js',
        path + "js/simple-datatables.js",
        # path + simple_datatables_js,
        path + 'js/strava.js',
        path + 'js/appUtil.js',
        path + 'js/Dom.js',
        # filters=["closure_js"],
        output='bundles/basic_table.js'
    )
}
