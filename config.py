import os
basedir = os.path.abspath(os.path.dirname(__file__))


class Config(object):
    DEBUG = False
    TESTING = False
    CSRF_ENABLED = True
    SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = "pB\xeax\x9cJ\xd6\x81\xed\xd7\xf9\xd0\x99o\xad\rM\x92\xb1\x8b{7\x02r"

    # Strava stuff
    STRAVA_CLIENT_ID = os.environ["STRAVA_CLIENT_ID"]
    STRAVA_CLIENT_SECRET = os.environ["STRAVA_CLIENT_SECRET"]

    # Leaflet stuff
    HEATMAP_DEFAULT_OPTIONS = {"radius": 9,
                               "blur": 15,
                               "gradient": {0.4: 'blue', 0.65: 'lime', 1: 'red'}
                               }

    ANTPATH_DEFAULT_OPTIONS = {"weight": 4,
                               "opacity": 0.5,
                               "color": 'red',
                               "pulseColor": 'white',
                               "delay": 2000,
                               "dashArray": [3, 10]}

    MAP_CENTER = [45.5236, -122.675]
    MAP_ZOOM = 3

    # BaseLayer definitions (supports leaflet-providers plugin)
    #  the first deined layer is the default, unless OFFLINE is set to True,
    #  in which case a blank layer is the default.
    LEAFLET_BASE_LAYERS = [
        {
            "title": "Open Street Map",
            "id": "osm",
            "url": 'http://{s}.tile.osm.org/{z}/{x}/{y}.png',
            "options":
            {"attribution": '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'}
        },
        {
            "id": "st_toner",
            "title": "Stamen Toner",
            "url": 'http://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}.{ext}',
            "options": {
                "attribution": 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                "subdomains": 'abcd',
                "minZoom": 0,
                "maxZoom": 20,
                "ext": 'png'
            }

        },
        {
            "title": "Stamen Terrain",
            "id": "st_terrain",
            "provider": "Stamen.Terrain"
        },
        {
            "id": "esri",
            "title": "Esri World Imagery",
            "url": 'http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            "options":
            {"attribution": 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'}
        }
    ]


class ProductionConfig(Config):
    DEBUG = False


class StagingConfig(Config):
    DEVELOPMENT = True
    DEBUG = True


class DevelopmentConfig(Config):
    # OFFLINE = True
    DEVELOPMENT = True
    DEBUG = True
