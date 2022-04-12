import os
from sanic.log import LOGGING_CONFIG_DEFAULTS
import logging

log = logging.getLogger("heatflask.webserver.config")
log.setLevel("INFO")
log.propagate = True

# General app configuration
APP_BASE_NAME = "Heatflask"
APP_VERSION = "1.0.0"
APP_NAME = f"{APP_BASE_NAME} v{APP_VERSION}"
OFFLINE = os.environ.get("OFFLINE") == "1"

# this can be "development", "staging", or "production"
#  Where "production" is assumed to be a Heroku Python environment
APP_ENV = os.environ.get("APP_ENV", "development")

# Data Store Configuration
DEV = APP_ENV == "development"
USE_REMOTE_DB = (os.environ.get("USE_REMOTE_DB") or (not DEV)) and not OFFLINE
POSTGRES_URL = os.environ["HEROKU_POSTGRES_URL" if DEV else "DATABASE_URL"]
MONGODB_URL = os.environ["ATLAS_MONGODB_URI" if USE_REMOTE_DB else "MONGODB_URL"]
REDIS_URL = os.environ["REDISGREEN_URL" if USE_REMOTE_DB else "REDIS_URL"]

# Log Configuration
default_log_level = "DEBUG" if APP_ENV == "development" else "INFO"
LOG_LEVEL = os.environ.get("LOG_LEVEL", default_log_level)


def get_logger_config():
    logger_config = {**LOGGING_CONFIG_DEFAULTS}
    heatflask_logger_config = {
        "heatflask": {"handlers": ["console"], "level": LOG_LEVEL}
    }
    logger_config["loggers"].update(heatflask_logger_config)

    ts = ""  # if APP_ENV == "development" else "%(asctime)s"
    log_fmt = f"{ts}%(levelname)5s [%(module)s.%(funcName)s] %(message)s"
    logger_config["formatters"]["generic"]["format"] = log_fmt

    access_log_fmt = (
        f"{ts}%(levelname)5s [%(name)s] [%(host)s]:"
        f" %(request)s %(message)s %(status)d %(byte)d"
    )
    logger_config["formatters"]["access"]["format"] = access_log_fmt

    # loggers = logger_config["loggers"]
    # log_levels = {name: loggers[name]["level"] for name in loggers}
    # print(log_levels)
    return logger_config
