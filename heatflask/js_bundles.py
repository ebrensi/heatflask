import flask_assets

min_css = flask_assets.Bundle(
    'css/min_entireframework.min.css',
    filters='cssmin'
)

Leaflet_css = flask_assets.Bundle(
    'css/leaflet.css',
    'css/leaflet-sidebar.min.css',
    'css/L.Control.Window.css',
    'css/leaflet-areaselect.css',
    'css/easy-button.css'
)

Leaflet_js = flask_assets.Bundle(
    # Minified
    'js/leaflet.js',
    'js/leaflet-sidebar.min.js',
    'js/download.min.js',

    # unMinified
    'js/L.Control.fps.js',
    'js/L.Control.Watermark.js',
    'js/L.Control.Window.js',
    'js/leaflet-providers.js',
    'js/leaflet-image.js',  # Tom MacWright: https://github.com/mapbox/leaflet-image
    'js/leaflet-areaselect.js',
    'js/easy-button.js',
    'js/L.SwipeSelect.js',
    'js/L.BoxHook.js'
)

DotLayer_js = flask_assets.Bundle(
    '../_DotLayer.js',
    "../DotLayer.WorkerPool.js",
    "../DotLayer.ViewBox.js",
    "../DotLayer.DrawBox.js",
    '../DotLayer.js'
)


day_js = flask_assets.Bundle(
    # "simple-datatables/dayjs.min.js",
    "dayjs/constant.js",
    "dayjs/en.js",
    "dayjs/utils.js",
    "dayjs/index.js"
)

simple_datatables_js = flask_assets.Bundle(
    day_js,
    "simple-datatables/helpers.js",
    "simple-datatables/rows.js",
    "simple-datatables/columns.js",
    "simple-datatables/table.js",
    "simple-datatables/config.js",
    "simple-datatables/date.js",
    "simple-datatables/datatable.js"
)


# we bundle javascript and css dependencies to reduce client-side overhead
bundles = {
    "dependencies_css": flask_assets.Bundle(
        "css/font-awesome-lite.css",
        min_css,
        Leaflet_css,
        "css/simple-datatables.css",
        'css/pikaday.css',
        '../heatflask.css',
        filters='cssmin',
        output='gen/main.css'
    ),

    "dependencies_js": flask_assets.Bundle(
        # "js/setup.js",
        
        # Minified
        # "js/simple-datatables.js",
        'js/msgpack.min.js',
        "js/round-slider.min.js",
        'js/gif2.js',  # Johan Nordberg: http://jnordberg.github.io/gif.js/

        # unMinified
        'js/pws.js', # persistent websocket https://github.com/porsager/pws
        'js/Dom.js',
        'js/pikaday.js',
        simple_datatables_js,

        # both
        Leaflet_js,

        # Heatflask-specific code
        'js/BitSet.js',
        'js/Codecs.js',
        'js/MapUtil.js',
        DotLayer_js,

        'js/strava.js',
        'js/appUtil.js',
        '../heatflask.js',

        filters=["closure_js"],
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

    #  For the Splash page
    "splash_css": flask_assets.Bundle(
        min_css,
        'css/cover.css',
        filters=['cssmin'],
        output='gen/splash.css'
    ),

    # For pages consisting almost entirely of a table
    "basic_table_css": flask_assets.Bundle(
        "css/font-awesome-lite.css",
        min_css,
        'css/simple-datatables.css',
        filters=['cssmin'],
        output='gen/basic_table.css'
    ),

    "basic_table_js": flask_assets.Bundle(
        'js/pws.js', # persistent websocket https://github.com/porsager/pws
        'js/msgpack.min.js',
        # "js/simple-datatables.js",
        simple_datatables_js,
        'js/strava.js',
        'js/appUtil.js',
        'js/Dom.js',
        filters=["closure_js"],
        output='gen/basic_table.js'
    )

}