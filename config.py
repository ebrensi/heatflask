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
    APP_SETTINGS = os.environ.get("APP_SETTINGS")
    ADMIN = [15972102]

    # We limit the capture duration to keep gif file size down
    CAPTURE_DURATION_MAX = 10

    # DotLayer options
    DEFAULT_DOTCOLOR = "#FFFFFF"

    # Leaflet.js stuff
    ATYPE_SPECS = [
        ("Ride", "speed", "#2B60DE"),  # Ocean Blue
        ("Run", "pace", "#FF0000"),  # Red
        ("Swim", "speed", "#00FF7F"),  # SpringGreen
        ("Hike", "pace", "#FF1493"),  # DeepPink
        ("Walk", "pace", "#FF00FF"),  # Fuchsia
        ("AlpineSki", None, "#800080"),  # Purple
        ("BackcountrySki", None, "#800080"),  # Purple
        ("Canoeing", None, "#FFA500"),  # Orange
        ("Crossfit", None, None),
        ("EBikeRide", "speed", "#0000CD"),  # MediumBlue
        ("Elliptical", None, None),
        ("IceSkate", "speed", "#663399"),  # RebeccaPurple
        ("InlineSkate", None, "#8A2BE2"),  # BlueViolet
        ("Kayaking", None, "#FFA500"),  # Orange
        ("Kitesurf", "speed", None),
        ("NordicSki", None, "#800080"),  # purple
        ("RockClimbing", None, "#4B0082"),  # Indigo
        ("RollerSki", "speed", "#800080"),  # Purple
        ("Rowing", "speed", "#FA8072"),  # Salmon
        ("Snowboard", None, "#00FF00"),  # Lime
        ("Snowshoe", "pace", "#800080"),  # Purple
        ("StairStepper", None, None),
        ("StandUpPaddling", None, None),
        ("Surfing", None, "#006400"),  # DarkGreen
        ("VirtualRide", "speed", "#1E90FF"),  # DodgerBlue
        ("WeightTraining", None, None),
        ("Windsurf", "speed", None),
        ("Workout", None, None),
        ("Yoga", None, None)
    ]

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

    # How long (seconds) we hold a user's index (in Mongo) before rebuilding it
    # We purge a user's activity index from Mongo if it has not been accessed
    #  for longer than this.  Note this also means that subscription updates
    #  for this user will be ignored after this timeout.
    STORE_INDEX_TIMEOUT = 2 * 24 * 60 * 60   # 2 days

    # How long we store Activity stream data in MongoDB
    STORE_ACTIVITIES_TIMEOUT = 3 * 24 * 60 * 60  # 3 days

    # How long we Redis-cache activity stream data
    CACHE_ACTIVITIES_TIMEOUT = 30 * 60  # 30 minutes

    # How long we Redis-cache a User object
    CACHE_USERS_TIMEOUT = 1 * 24 * 60 * 60  # 1 day

    # How long before a user's index is outated and needs an update
    INDEX_UPDATE_TIMEOUT = 20 * 60  # 20 minutes

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

        STORE_INDEX_TIMEOUT = 365 * 24 * 60 * 60   # 365 days
        STORE_ACTIVITIES_TIMEOUT = 365 * 24 * 60 * 60  # 365 days
