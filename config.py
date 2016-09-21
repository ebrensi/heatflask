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

    ANTPATH_DEFAULT_OPTIONS = {"weight": 3,
                               "color": 'red',
                               "delay": 2000}

    MAP_CENTER = [45.5236, -122.675]
    MAP_ZOOM = 3

    LEAFLET_BASE_LAYERS = [
        {"title": "Open Street Map",
         "id": "osm",
         "url": 'http://{s}.tile.osm.org/{z}/{x}/{y}.png',
         "attribution": '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
         },

        {"id": "esri",
         "title": "Esri World Imagery",
         "url": 'http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
         "attribution": 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
         },

        {"id": "sttoner",
         "title": "Stamen Toner",
         "url": "http://tile.stamen.com/toner/{z}/{x}/{y}.png}",
         "attribution": 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, under <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a href="http://openstreetmap.org">OpenStreetMap</a>, under <a href="http://www.openstreetmap.org/copyright">ODbL</a>.'
         }
    ]

    MOVING_MARKER_TIMESCALE = 1000


class ProductionConfig(Config):
    DEBUG = False


class StagingConfig(Config):
    DEVELOPMENT = True
    DEBUG = True


class DevelopmentConfig(Config):
    OFFLINE = True
    DEVELOPMENT = True
    DEBUG = True
