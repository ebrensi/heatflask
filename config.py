import os

basedir = os.path.abspath(os.path.dirname(__file__))


class Config(object):
    # Flask settings
    DEBUG = False
    TESTING = False
    DEVELOPMENT = False
    CSRF_ENABLED = True

    LOG_LEVEL = os.environ.get("LOG_LEVEL", "DEBUG")

    # Heatflask settings
    OFFLINE = False
    APP_VERSION = ""
    APP_NAME = "Heatflask {}".format(APP_VERSION)
    APP_SETTINGS = os.environ.get("APP_SETTINGS")

    # User ids of people to give administrative priviledge
    ADMIN = [15972102]

    # We limit the capture duration to keep gif file size down
    CAPTURE_DURATION_MAX = 20

    # We make Flask-Assets Default to manual build without caching
    # ASSETS_AUTO_BUILD = False
    # ASSETS_DEBUG = False
    # ASSETS_CACHE = False
    # ASSETS_MANIFEST = None
    CLOSURE_COMPRESSOR_OPTIMIZATION = "SIMPLE"
    # CLOSURE_EXTRA_ARGS = [
    #     # "--debug"
    # ]
    # Concurrency for User database triage
    TRIAGE_CONCURRENCY = 5

    # Concurrency for activity streams import
    IMPORT_CONCURRENCY = 64

    # Concurrency for Index page import
    PAGE_SIZE = int(os.environ.get("PAGE_SIZE", 50))
    PAGE_REQUEST_CONCURRENCY = 16

    BATCH_CHUNK_SIZE = 100

    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_size": 6,
        "max_overflow": 8,
        "pool_timeout": 10,
        "pool_recycle": 300,
    }

    SQLALCHEMY_DATABASE_URI = os.environ.get("DATABASE_URL")

    MONGO_OPTIONS = {"maxIdleTimeMS": 10000, "maxPoolSize": 100}

    MONGO_URI = os.environ.get("MONGODB_URI")
    REDIS_URL = os.environ.get("REDIS_URL")

    SECS_IN_HOUR = 60 * 60
    SECS_IN_DAY = 24 * SECS_IN_HOUR

    # How long we store Index entry in MongoDB
    TTL_INDEX = int(os.environ.get("TTL_INDEX", 10)) * SECS_IN_DAY

    # How long we store Activity stream data in MongoDB
    TTL_DB = int(os.environ.get("TTL_DB", 4)) * SECS_IN_DAY

    # How long we Redis-cache Activity stream data
    TTL_CACHE = int(os.environ.get("TTL_CACHE", 4)) * SECS_IN_HOUR

    CACHE_IP_INFO_TIMEOUT = 1 * SECS_IN_DAY  # 1 day

    JSONIFY_PRETTYPRINT_REGULAR = True

    SECRET_KEY = os.environ.get("SECRET_KEY")

    # Strava stuff
    STRAVA_CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID")
    STRAVA_CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET")

    # IPstack
    IPSTACK_ACCESS_KEY = os.environ["IPSTACK_ACCESS_KEY"]

    # Maximum size of event history (for capped MongoDB collection)
    MAX_HISTORY_BYTES = 2 * 1024 * 1024  # 2MB

    # Paypal Stuff
    # PAYPAL_VERIFY_URL = 'https://ipnpb.paypal.com/cgi-bin/webscr'
    PAYPAL_VERIFY_URL = "https://ipnpb.sandbox.paypal.com/cgi-bin/webscr"

    # MapBox stuff
    MAPBOX_ACCESS_TOKEN = os.environ.get("MAPBOX_ACCESS_TOKEN")

    # We are free to delete users who have been inactive for a while
    DAYS_INACTIVE_CUTOFF = 365

    STREAMS_TO_IMPORT = ["latlng", "time"]

    # The number of failed stream import requests we will allow before
    #  aborting an import.
    MAX_IMPORT_ERRORS = 100

    # Domain Redirect for people using herokuapp links
    FROM_DOMAIN = "heatflask.herokuapp.com"
    TO_DOMAIN = "www.heatflask.com"

    # This is the spec for parsing urls.  The pattern is
    #  field_name: ([query_string options], default-value)
    URL_QUERY_SPEC = dict(
        date1=(["after", "date1", "a"], ""),
        date2=(["before", "date2", "b"], ""),
        preset=(["days", "preset", "d"], None),
        limit=(["limit", "l"], None),
        ids=(["id", "ids"], None),
        map_center=(["center"], [27.53, 1.58]),
        lat=(["lat"], None),
        lng=(["lng"], None),
        zoom=(["zoom", "z"], 3),
        autozoom=(["autozoom", "az"], True),
        c1=(["c1"], 0),
        c2=(["c2"], 0),
        sz=(["sz"], 0),
        paused=(["paused", "p"], 0),
        shadows=(["sh", "shadows"], None),
    )

    # A few Demos
    DEMOS = {
        "portland_6_2017": {
            "username": "15972102",
            "after": "2017-06-30",
            "before": "2017-07-08",
            "lat": "41.476",
            "lng": "-119.290",
            "zoom": "6",
            "c1": "859579",
            "c2": "169",
            "sz": "4",
        },
        "last60activities": {"username": "15972102", "limit": "60"},
        "last500activities": {"username": "15972102", "limit": "500"},
    }


class ProductionConfig(Config):
    """
    These are settings specific to the production environment
    (the main app running on Heroku)
    """

    ANALYTICS = {"GOOGLE_UNIVERSAL_ANALYTICS": {"ACCOUNT": "UA-85621398-1"}}

    DEBUG = False

    # Turn off webassets building for production, but we need to make sure
    #  assets files are built in development
    ASSETS_DEBUG = False
    ASSETS_AUTO_BUILD = False
    ASSETS_CACHE = False
    ASSETS_MANIFEST = False

    MONGO_URI = os.environ.get("ATLAS_MONGODB_URI")
    REDIS_URL = os.environ.get("REDISGREEN_URL")
    LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")


class StagingConfig(Config):
    """
    These are settings specific to the staging environment
     (hosted test app)
    """

    DEVELOPMENT = True
    DEBUG = True

    ASSETS_DEBUG = False
    ASSETS_AUTO_BUILD = False
    ASSETS_CACHE = False
    ASSETS_MANIFEST = False

    MONGO_URI = os.environ.get("ATLAS_MONGODB_URI")
    REDIS_URL = os.environ.get("REDISGREEN_URL")

    #  Rate limits via Flask-Limiter to mitgate DOS attacks
    #  and other strange bursts of requests
    RATELIMIT_DEFAULT = "200/day;50/hour;1/second"
    RATELIMIT_STORAGE_URL = REDIS_URL
    RATELIMIT_STRATEGY = "fixed-window-elastic-expiry"
    RATELIMIT_IN_MEMORY_FALLBACK_ENABLED = True


class DevelopmentConfig(Config):
    """
    These are settings specific to the development environment
    (A developer's personal computer)
    Note that this file is part of the repo so any changes you make
    here will affect all developers.
    """

    # OFFLINE setting suppresses any internet access
    OFFLINE = os.environ.get("OFFLINE", False)

    USE_REMOTE_DB = False if OFFLINE else os.environ.get("USE_REMOTE_DB")

    DEVELOPMENT = True
    DEBUG = True
    TESTING = True

    # SSLIFY Settings
    SSLIFY_PERMANENT = False

    # Flask-Assets settings
    # ASSETS_DEBUG = "merge"
    # ASSETS_AUTO_BUILD = True

    if USE_REMOTE_DB:
        MONGO_URI = os.environ.get("REMOTE_MONGODB_URL")
        SQLALCHEMY_DATABASE_URI = os.environ.get("REMOTE_POSTGRES_URL")
        REDIS_URL = os.environ.get("REMOTE_REDIS_URL", Config.REDIS_URL)

    else:
        # How long we Redis-cache Activity stream data
        TTL_CACHE = 2 * Config.SECS_IN_HOUR

        # How long we Redis-cache a User object
        CACHE_USERS_TIMEOUT = 2 * Config.SECS_IN_HOUR

        # How long we store Activity stream data in MongoDB
        TTL_DB = 60 * Config.SECS_IN_DAY

        # How long we store an Index entry in MongoDB
        STORE_INDEX_TIMEOUT = 60 * Config.SECS_IN_DAY  # 60 days
