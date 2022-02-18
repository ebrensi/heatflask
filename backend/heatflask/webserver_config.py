import os
from sanic.log import LOGGING_CONFIG_DEFAULTS as LOG_CONFIG

APP_NAME = "heatflask"
APP_VERSION = "0.5.0"

# *** Logging config ***
ENVIRONMENT = os.environ.get("SERVER_ENVIRONMENT", "production")
default_log_level = "DEBUG" if ENVIRONMENT == "development" else "INFO"
LOG_LEVEL = os.environ.get("LOG_LEVEL", default_log_level)
base_logger_config = {"handlers": ["console"]}
logger_config = {
    "DataAPIs": {**base_logger_config, "level": LOG_LEVEL},
    "Strava": {**base_logger_config, "level": LOG_LEVEL},
    "Users": {**base_logger_config, "level": LOG_LEVEL},
    "Index": {**base_logger_config, "level": LOG_LEVEL},
    "Utility": {**base_logger_config, "level": LOG_LEVEL},
}
LOG_CONFIG["loggers"].update(logger_config)

ts = "" if ENVIRONMENT == "development" else "%(asctime)s"
log_fmt = f"{ts}%(levelname)5s [%(name)s.%(funcName)s] %(message)s"
LOG_CONFIG["formatters"]["generic"]["format"] = log_fmt

access_log_fmt = (
    f"{ts}%(levelname)5s [%(name)s] [%(host)s]:"
    f" %(request)s %(message)s %(status)d %(byte)d"
)
LOG_CONFIG["formatters"]["access"]["format"] = access_log_fmt
# *** End Logging config ***
