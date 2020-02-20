import flask_assets

min_css = flask_assets.Bundle(
    'css/min_entireframework.min.css',
    # 'css/min_bootstrap-plugin.css',
    filters='cssmin'
)

frappe_datatable_js = flask_assets.Bundle(
    "frappe-datatable/Sortable.min.js",
    "frappe-datatable/clusterize.min.js",
    "frappe-datatable/frappe-datatable.min.js"
)

frappe_datatable_css = flask_assets.Bundle(
    "frappe-datatable/clusterize.css",
    # "frappe-datatable/frappe-datatable.css",
    "frappe-datatable/frappe-datatable.min.css",
    "frappe-datatable-dark.css"
)

DotLayer_js = flask_assets.Bundle(
    '../_DotLayer.js',
    "../DotLayer.WorkerPool.js",
    "../DotLayer.ViewBox.js",
    "../DotLayer.DrawBox.js",
    '../DotLayer.js'
)

# we bundle javascript and css dependencies to reduce client-side overhead
bundles = {
    "dependencies_css": flask_assets.Bundle(
        min_css,
        "css/font-awesome-lite.css",
        # 'css/font-awesome.min.css',
        'css/leaflet.css',
        'css/leaflet-sidebar.min.css',
        'css/L.Control.Window.css',
        'css/leaflet-areaselect.css',
        'css/datatables.css',
        'css/easy-button.css',
        'css/pikaday.css',
        '../heatflask.css',
        filters='cssmin',
        output='gen/main.css'
    ),

    "dependencies_js": flask_assets.Bundle(
        # minified dependencies
        flask_assets.Bundle(
            'js/pws.min.js', # persistent websocket https://github.com/porsager/pws
            'js/msgpack.min.js',
            "js/jquery-3.4.1.slim.min.js",
            # 'js/cash.min.js',  # cash.js is a minimal jquery substitute,
            # 'js/zepto.min.js',
            # 'js/cash_jquery_helper.js',
            'js/jquery.knob.min.js',  # Anthony Terrien
            'js/datatables.min.js',
            'js/leaflet.js',
            'js/leaflet-sidebar.min.js',
            'js/download.min.js',
            'js/pikaday.js',
            'js/gif2.js',  # Johan Nordberg: http://jnordberg.github.io/gif.js/ 
        ),

        # un-minified dependencies
        flask_assets.Bundle(
            'js/L.Control.fps.js',
            'js/L.Control.Watermark.js',
            'js/L.Control.Window.js',
            'js/leaflet-providers.js',
            'js/leaflet-image.js',  # Tom MacWright: https://github.com/mapbox/leaflet-image
            'js/leaflet-areaselect.js',
            'js/easy-button.js',
            'js/L.SwipeSelect.js',
            'js/L.BoxHook.js',
            'js/Dom.js',
            filters=["rjsmin"],
        ),

        # Heatflask-specific code
        flask_assets.Bundle(
            flask_assets.Bundle(
                'js/BitSet.js',
                'js/Codecs.js',
                "js/MapUtil.js",
                DotLayer_js,
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
        # 'css/bootstrap.min.css',
        min_css,
        'css/cover.css',
        filters='cssmin',
        output='gen/splash.css'
    ),

    "basic_table_css": flask_assets.Bundle(
        # 'css/bootstrap.min.css',
        min_css,
        "css/font-awesome-lite.css",
        # 'css/font-awesome.min.css',
        'css/datatables.css',
        # 'css/table-styling.css',
        filters='cssmin',
        output='gen/basic_table.css'
    ),

    "basic_table_js": flask_assets.Bundle(
        'js/pws.min.js', # persistent websocket https://github.com/porsager/pws
        'js/msgpack.min.js',
        "js/jquery-3.4.1.slim.min.js",
        'js/datatables.min.js',
        'js/strava.js',
        'js/appUtil.js',
        'js/Dom.js',
        output='gen/basic_table.js'
    )

}