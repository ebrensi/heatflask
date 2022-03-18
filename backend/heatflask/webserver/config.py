import os
from sanic.log import LOGGING_CONFIG_DEFAULTS as LOG_CONFIG

# General app configuration
APP_BASE_NAME = "Heatflask"
APP_VERSION = "1.0.0"
APP_NAME = f"{APP_BASE_NAME} v{APP_VERSION}"

# this can be "development", "staging", or "production"
#  Where "production" is assumed to be a Heroku Python environment
APP_ENV = os.environ.get("APP_ENV", "development")

# Data Store Configuration
DEV = APP_ENV == "development"
USE_REMOTE_DB = os.environ.get("USE_REMOTE_DB") or (not DEV)
POSTGRES_URL = os.environ["HEROKU_POSTGRES_URL" if DEV else "DATABASE_URL"]
MONGODB_URL = os.environ["ATLAS_MONGODB_URI" if USE_REMOTE_DB else "MONGODB_URL"]
REDIS_URL = os.environ["REDISGREEN_URL" if USE_REMOTE_DB else "REDIS_URL"]

# Log Configuration
default_log_level = "DEBUG" if APP_ENV == "development" else "INFO"
LOG_LEVEL = os.environ.get("LOG_LEVEL", default_log_level)
base_logger_config = {"handlers": ["console"]}
logger_config = {
    "heatflask.DataAPIs": {**base_logger_config, "level": LOG_LEVEL},
    "heatflask.Strava": {**base_logger_config, "level": LOG_LEVEL},
    "heatflask.Users": {**base_logger_config, "level": LOG_LEVEL},
    "heatflask.Index": {**base_logger_config, "level": LOG_LEVEL},
    "heatflask.Events": {**base_logger_config, "level": LOG_LEVEL},
    "heatflask.Utility": {**base_logger_config, "level": LOG_LEVEL},
    "heatflask.webserver.serve": {**base_logger_config, "level": LOG_LEVEL},
    "heatflask.webserver.sessions": {**base_logger_config, "level": LOG_LEVEL},
    "heatflask.webserver.files": {**base_logger_config, "level": LOG_LEVEL},
    "heatflask.webserver.bp.auth": {**base_logger_config, "level": LOG_LEVEL},
    "heatflask.webserver.bp.users": {**base_logger_config, "level": LOG_LEVEL},
    "heatflask.webserver.bp.activities": {**base_logger_config, "level": LOG_LEVEL},
}
LOG_CONFIG["loggers"].update(logger_config)

ts = "" if APP_ENV == "development" else "%(asctime)s"
log_fmt = f"{ts}%(levelname)5s [%(module)s.%(funcName)s] %(message)s"
LOG_CONFIG["formatters"]["generic"]["format"] = log_fmt

access_log_fmt = (
    f"{ts}%(levelname)5s [%(name)s] [%(host)s]:"
    f" %(request)s %(message)s %(status)d %(byte)d"
)
LOG_CONFIG["formatters"]["access"]["format"] = access_log_fmt
