import flask_assets

# we bundle javascript and css dependencies to reduce client-side overhead
bundles = {
    "dependencies_css": flask_assets.Bundle(
        'css/main.css',
        'css/jquery-ui.css',
        'css/bootstrap.min.css',
        'css/font-awesome.min.css',
        'css/leaflet.css',
        'css/leaflet-sidebar.min.css',
        'css/L.Control.Window.css',
        'css/leaflet-areaselect.css',
        'css/datatables.min.css',
        'css/easy-button.css',
        '../heatflask.css',
        filters='cssmin',
        output='gen/main.css'
    ),
    "dependencies_js": flask_assets.Bundle(
        # minified dependencies
        flask_assets.Bundle(
            'js/pws.min.js', # persistent websocket https://github.com/porsager/pws
            'js/msgpack.min.js',
            'js/jquery-3.2.1.min.js',
            'js/jquery-ui.min.js',
            'js/jquery.knob.min.js',  # Anthony Terrien
            'js/datatables.min.js',
            'js/leaflet.js',
            'js/leaflet-sidebar.min.js',
            'js/download.min.js',
            'js/gif2.js',  # Johan Nordberg: http://jnordberg.github.io/gif.js/ 
        ),
        # un-minified dependencies
        flask_assets.Bundle(
            'js/L.Control.Watermark.js',
            'js/L.Control.Window.js',
            'js/leaflet-providers.js',
            'js/leaflet-image.js',  # Tom MacWright: https://github.com/mapbox/leaflet-image
            'js/leaflet-areaselect.js',
            'js/easy-button.js',
            'js/L.SwipeSelect.js',
            'js/L.BoxHook.js',
            filters=["rjsmin"],
        ),
        # Heatflask-specific code
        flask_assets.Bundle(
            flask_assets.Bundle(
                'js/BitSet.js',
                'js/Codecs.js',
                "js/MapUtil.js",
                '../DotLayer.js',
                # filters=["rjsmin"]
                filters=["closure_js"],
            ),
            # code to leave out of closure compiling
            flask_assets.Bundle(
                'js/appUtil.js',
                'js/strava.js',
                '../heatflask.js',
                filters=["rjsmin"]
            ),
        ),
        output='gen/dependencies.js'
    ),

    "gifjs_webworker_js": flask_assets.Bundle(
        'js/gif.worker.js',
        output="gen/gif.worker.js"
    ),

    "DotLayerWorker_js": flask_assets.Bundle(
        '../dotLayerWorker.js',
        'js/BitSet.js',
        'js/Codecs.js',
        "js/MapUtil.js",
        filters=["closure_js"],
        output="gen/dotLayer.worker.js"
    ),

    "splash_css": flask_assets.Bundle(
        'css/bootstrap.min.css',
        'css/cover.css',
        filters='cssmin',
        output='gen/splash.css'
    ),

    "basic_table_css": flask_assets.Bundle(
        'css/bootstrap.min.css',
        'css/font-awesome.min.css',
        'css/datatables.min.css',
        'css/table-styling.css',
        filters='cssmin',
        output='gen/basic_table.css'
    ),

    "basic_table_js": flask_assets.Bundle(
        'js/pws.min.js', # persistent websocket https://github.com/porsager/pws
        'js/msgpack.min.js',
        'js/jquery-3.2.1.min.js',
        'js/datatables.min.js',
        'js/strava.js',
        'js/appUtil.js',
        output='gen/basic_table.js'
    )

}