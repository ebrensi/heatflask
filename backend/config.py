import os

basedir = os.path.abspath(os.path.dirname(__file__))


class Config(object):
    # Flask settings
    DEBUG = False
    TESTING = False
    DEVELOPMENT = False
    CSRF_ENABLED = True

    # Heatflask settings
    OFFLINE = False
    APP_VERSION = "v0.5.0"
    APP_NAME = "Heatflask {}".format(APP_VERSION)
    APP_SETTINGS = os.environ.get("APP_SETTINGS")

    # User ids of people to give administrative priviledge
    ADMIN = [15972102]

    SECS_IN_HOUR = 60 * 60
    SECS_IN_DAY = 24 * SECS_IN_HOUR

    CACHE_IP_INFO_TIMEOUT = 1 * SECS_IN_DAY  # 1 day


class ProductionConfig(Config):
    """
    These are settings specific to the production environment
    (the main app running on Heroku)
    """

    DEBUG = False

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
