import os
basedir = os.path.abspath(os.path.dirname(__file__))


class Config(object):
    # Flask settings
    DEBUG = False
    TESTING = False
    CSRF_ENABLED = True

    # Heatflask settings
    OFFLINE = False
    APP_VERSION = "(alpha)"
    APP_NAME = "Heatflask {}".format(APP_VERSION)
    ADMIN = [15972102]

    # Leaflet.js stuff
    HEATMAP_DEFAULT_OPTIONS = {
        "radius": 8,
        "blur": 15,
        "gradient": {0.4: 'blue', 0.65: 'lime', 1: 'red'}
    }

    ANTPATH_DEFAULT_OPTIONS = {
        "weight": 3,
        "opacity": 0.3,
        "color": 'black',
        "pulseColor": 'white',
    }

    FLOWPATH_VARIATION_CONSTANTS = {
        "K": 12000,
        "T": 6
    }

    MAP_CENTER = [27.53, 1.58]
    MAP_ZOOM = 3

    # SSLIFY Settings
    SSLIFY_PERMANENT = True

    # We make Flask-Assets Default to manual build without caching
    # ASSETS_AUTO_BUILD = False
    ASSETS_DEBUG = False
    # ASSETS_CACHE = False
    # ASSETS_MANIFEST = None

    # Concurrency for Web-API fetching
    CONCURRENCY = 5

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

    # We purge activities older than this from MongoDB
    STORE_ACTIVITIES_TIMEOUT = 5 * 24 * 60 * 60  # 5 days

    # How long before a user's index is outated and needs an update
    INDEX_UPDATE_TIMEOUT = 24 * 60 * 60  # 1 day

    # How long we memory-cache hires activities
    CACHE_ACTIVITIES_TIMEOUT = 30 * 60  # 30 minutes

    # How long we hold a User object in memory
    CACHE_USERS_TIMEOUT = 30 * 60  # 30 minutes

    SECRET_KEY = "pB\xeax\x9cJ\xd6\x81\xed\xd7\xf9\xd0\x99o\xad\rM\x92\xb1\x8b{7\x02r"

    # Strava stuff
    STRAVA_CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID")
    STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET")

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
    ASSETS_DEBUG = False


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
    OFFLINE = False
    DEVELOPMENT = True
    DEBUG = True
    CACHE_ACTIVITIES_TIMEOUT = 2 * 60 * 60

    # SSLIFY Settings
    SSLIFY_PERMANENT = False

    # Flask-Assets settings
    # ASSETS_DEBUG = "merge"
    # ASSETS_AUTO_BUILD = True
    # ASSETS_CACHE = True
    # ASSETS_MANIFEST = 'cache'
    # ASSETS_UPDATER = 'timestamp'
