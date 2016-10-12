import os
basedir = os.path.abspath(os.path.dirname(__file__))


class Config(object):
    APP_NAME = "HeatFlow (alpha)"
    APP_VERSION = "alpha"
    DEBUG = False
    TESTING = False
    CSRF_ENABLED = True
    SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = "pB\xeax\x9cJ\xd6\x81\xed\xd7\xf9\xd0\x99o\xad\rM\x92\xb1\x8b{7\x02r"

    DATE_RANGE_PRESETS = ["2", "7", "30", "60", "180", "365"]

    # Strava stuff
    STRAVA_CLIENT_ID = os.environ["STRAVA_CLIENT_ID"]
    STRAVA_CLIENT_SECRET = os.environ["STRAVA_CLIENT_SECRET"]

    # Leaflet stuff
    HEATMAP_DEFAULT_OPTIONS = {
        "radius": 9,
        "blur": 15,
        "gradient": {0.4: 'blue', 0.65: 'lime', 1: 'red'}
    }

    ANTPATH_DEFAULT_OPTIONS = {
        "weight": 3,
        "opacity": 0.5,
        "color": 'yellow',
        "pulseColor": 'white',
        "delay": 2000,
        "dashArray": [3, 10]
    }

    ANTPATH_ACTIVITY_COLORS = {
        'red': ['run', 'walk', 'hike'],
        'blue': ['ride']
    }

    MAP_CENTER = [45.5236, -122.675]
    MAP_ZOOM = 3


class ProductionConfig(Config):
    DEBUG = False


class StagingConfig(Config):
    DEVELOPMENT = True
    DEBUG = True


class DevelopmentConfig(Config):
    # OFFLINE = True
    DEVELOPMENT = True
    DEBUG = True
