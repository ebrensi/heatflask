import os
basedir = os.path.abspath(os.path.dirname(__file__))


class Config(object):
    # Flask settings
    DEBUG = False
    TESTING = False
    CSRF_ENABLED = True

    # Heatflask settings
    OFFLINE = False
    APP_VERSION = ""
    APP_NAME = "Heatflask {}".format(APP_VERSION)
    APP_SETTINGS = os.environ.get("APP_SETTINGS")
    ADMIN = [15972102]

    # We limit the capture duration to keep gif file size down
    CAPTURE_DURATION_MAX = 15

    MAP_CENTER = [27.53, 1.58]
    MAP_ZOOM = 3

    # SSLIFY Settings
    SSLIFY_PERMANENT = True

    # We make Flask-Assets Default to manual build without caching
    # ASSETS_AUTO_BUILD = False
    # ASSETS_DEBUG = False
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

    MONGODB_URI = os.environ.get("ATLAS_MONGODB_URI")

    # How long we store an index entry in MongoDB
    STORE_INDEX_TIMEOUT = 30 * 24 * 60 * 60   # 30 days

    # How long we store Activity stream data in MongoDB
    STORE_ACTIVITIES_TIMEOUT = 3 * 24 * 60 * 60  # 3 days

    # How long we Redis-cache activity stream data
    CACHE_ACTIVITIES_TIMEOUT = 8 * 60 * 60  # 8 hours

    # How long we Redis-cache a User object
    CACHE_USERS_TIMEOUT = 1 * 24 * 60 * 60  # 1 day

    CACHE_IP_INFO_TIMEOUT = 1 * 24 * 60 * 60  # 1 day

    JSONIFY_PRETTYPRINT_REGULAR = True

    SECRET_KEY = (
        "pB\xeax\x9cJ\xd6\x81\xed\xd7\xf9\xd0\x99o\xad\rM\x92\xb1\x8b{7\x02r"
    )

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

    # Turn off webassets building for production, but we need to make sure
    #  assets files are built in development
    ASSETS_DEBUG = False
    ASSETS_AUTO_BUILD = False
    ASSETS_CACHE = False
    ASSETS_MANIFEST = False

    REDIS_URL = os.environ.get("REDISGREEN_URL")


class StagingConfig(Config):
    """
    These are settings specific to the staging environment
     (hosted test app)
    """
    DEVELOPMENT = True
    DEBUG = False

    REDIS_URL = os.environ.get("REDISGREEN_URL")
    MONGODB_URI = os.environ.get("ATLAS_MONGODB_URI")

    # webassets can do whatever in staging
    # ASSETS_DEBUG = True
    ASSETS_AUTO_BUILD = True
    # ASSETS_CACHE = False
    # ASSETS_MANIFEST = False


class DevelopmentConfig(Config):
    """
    These are settings specific to the development environment
    (Developer's personal computer)
    """
    OFFLINE = os.environ.get("OFFLINE", False)
    USE_LOCAL = os.environ.get("USE_LOCAL", False)
    DEVELOPMENT = True
    DEBUG = True
    CACHE_ACTIVITIES_TIMEOUT = 2 * 60 * 60

    # SSLIFY Settings
    SSLIFY_PERMANENT = False

    # Flask-Assets settings
    # ASSETS_DEBUG = True
    ASSETS_AUTO_BUILD = True

    # INDEX_UPDATE_TIMEOUT = 1
    REDIS_URL = "redis://localhost"
    
    if OFFLINE or USE_LOCAL:
        # in local environment,
        MONGODB_URI = "mongodb://localhost/heatflask"

        # STORE_INDEX_TIMEOUT = 2 * 24 * 60 * 60   # 2 days
        STORE_INDEX_TIMEOUT = 24 * 60 * 60
        STORE_ACTIVITIES_TIMEOUT = 2 * 24 * 60 * 60  # 2 days
