import os
basedir = os.path.abspath(os.path.dirname(__file__))


class Config(object):
    APP_VERSION = "(alpha)"
    APP_NAME = "Heatflask {}".format(APP_VERSION)
    ADMIN = [15972102]
    DEBUG = False
    TESTING = False
    CSRF_ENABLED = True
    OFFLINE = False

    CONCURRENCY = 4

    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_POOL_SIZE = 16
    SQLALCHEMY_MAX_OVERFLOW = 2
    SQLALCHEMY_POOL_TIMEOUT = 10
    SQLALCHEMY_POOL_RECYCLE = 1 * 60 * 60

    MONGODB_URI = os.environ.get("MONGODB_URI")
    REDIS_URL = os.environ.get('REDIS_URL')

    # Settings for fast-cache
    # How long (seconds) we hold a user's index (in Mongo) before rebuilding it
    STORE_INDEX_TIMEOUT = 7 * 24 * 60 * 60   # 7 days

    # We daily purge activities older than this from MongoDB
    STORE_ACTIVITIES_TIMEOUT = 7 * 24 * 60 * 60  # 7 days

    # How long before a user's index is outated and needs an update
    INDEX_UPDATE_TIMEOUT = 10 * 60  # 10 minutes

    # How long we memory-cache hires activities
    CACHE_ACTIVITIES_TIMEOUT = 1 * 60 * 60  # 1 hour

    # How long we hold a User object in memory
    CACHE_USERS_TIMEOUT = 1 * 60 * 60  # 1 hour

    SECRET_KEY = "pB\xeax\x9cJ\xd6\x81\xed\xd7\xf9\xd0\x99o\xad\rM\x92\xb1\x8b{7\x02r"

    # Strava stuff
    STRAVA_CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID")
    STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET")

    # Leaflet.js stuff
    HEATMAP_DEFAULT_OPTIONS = {
        "radius": 8,
        "blur": 15,
        "gradient": {0.4: 'blue', 0.65: 'lime', 1: 'red'}
    }

    ANTPATH_DEFAULT_OPTIONS = {
        "weight": 3,
        "opacity": 0.5,
        "color": 'black',
        "pulseColor": 'white',
    }

    FLOWPATH_VARIATION_CONSTANTS = {
        "K": 12000,
        "T": 6
    }

    MAP_CENTER = [27.53, 1.58]
    MAP_ZOOM = 3

    # Maximum size of event history (for capped MongoDB collection)
    MAX_HISTORY_BYTES = 2 * 1024 * 1024  # 2MB


class ProductionConfig(Config):
    """
    These are settings specific to the production environment
    (the main app running on Heroku)
    """
    ANALYTICS = {
        'GOOGLE_UNIVERSAL_ANALYTICS': {
            'ACCOUNT': "UA-85621398-1"
        }
    }
    DEBUG = False


class StagingConfig(Config):
    """
    These are settings specific to the staging environment
     (hosted test app)
    """
    DEVELOPMENT = True
    DEBUG = True


class DevelopmentConfig(Config):
    """
    These are settings specific to the development environment
    (Developer's personal computer)
    """
    OFFLINE = True
    DEVELOPMENT = True
    DEBUG = True

    CACHE_ACTIVITIES_TIMEOUT = 120
