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
        path + "dist/main.js",
        # filters=["closure_js"],
        output='bundles/heatflask.js'
    ),

    "gifjs_webworker_js": flask_assets.Bundle(
        path + 'js/gif.worker.js',
        output="bundles/gifWorker.js"
    ),

    # "DotLayerWorker_js": flask_assets.Bundle(
    #     path + 'js/DotLayer/dotLayerWorker.js',
    #     path + 'js/BitSet.js',
    #     path + 'js/Codecs.js',
    #     path + "js/CRS.js",
    #     path + 'js/Simplifier.js',
    #     filters=["closure_js"],
    #     output="bundles/dotLayer.worker.js"
    # ),

    #  For the Splash page
    "splash_css": flask_assets.Bundle(
        min_css,
        path + 'css/cover.css',
        filters=['cssmin'],
        output='bundles/splash.css'
    ),

    # # For pages consisting almost entirely of a table
    # "basic_table_css": flask_assets.Bundle(
    #     path + "css/font-awesome-lite.css",
    #     min_css,
    #     path + 'css/simple-datatables.css',
    #     filters=['cssmin'],
    #     output='bundles/basic_table.css'
    # ),

    # "basic_table_js": flask_assets.Bundle(
    #     path + 'js/pws.js', # persistent websocket https://github.com/porsager/pws
    #     path + 'js/msgpack.min.js',
    #     path + "js/simple-datatables.js",
    #     path + 'js/strava.js',
    #     path + 'js/appUtil.js',
    #     path + 'js/Dom.js',
    #     # filters=["closure_js"],
    #     output='bundles/basic_table.js'
    # )
}
