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
APP_ENV = os.environ.get("APP_ENV", "development")
DEV = APP_ENV == "development"

# Data Store Configuration
#
# One datastore: MongoDB. Postgres and Redis are gone -- the Postgres users
# table survives only as a one-shot import (see Users.migrate()), and Redis
# was a read cache in front of Mongo, which is itself a cache of Strava.
#
# Both spellings are accepted because .env.tmp and the old config disagreed.
MONGODB_URL = os.environ.get("MONGODB_URL") or os.environ.get("MONGODB_URI")

if not MONGODB_URL:
    if DEV:
        MONGODB_URL = "mongodb://localhost:27017/heatflask"
        log.info("MONGODB_URL not set, using %s", MONGODB_URL)
    else:
        raise RuntimeError("MONGODB_URL must be set when APP_ENV is not development")

# Informational only (shown in the startup banner) -- it no longer selects
# which database to talk to.
USE_REMOTE_DB = not any(h in MONGODB_URL for h in ("localhost", "127.0.0.1"))

# The key that signs session cookies. Without a signature the cookie was
# plain JSON naming a user id, which the server believed -- so anyone could
# set {"user": <any id>} and be that athlete, admin included.
SESSION_SECRET = os.environ.get("SESSION_SECRET")
if not SESSION_SECRET:
    if DEV:
        # Fixed rather than random, so a dev server restart keeps you logged in
        SESSION_SECRET = "heatflask-development-only"
    else:
        raise RuntimeError("SESSION_SECRET must be set when APP_ENV is not development")

# The public address the app is reached at, e.g. https://www.heatflask.com.
# url_for() builds absolute URLs from it, and two of those go to Strava: the
# OAuth redirect_uri, which must be on the app's registered callback domain,
# and the webhook callback. It was hardcoded to http://dev.heatflask.com.
SERVER_NAME = os.environ.get("SERVER_NAME")
if not SERVER_NAME and not DEV:
    raise RuntimeError("SERVER_NAME must be set when APP_ENV is not development")

# Log Configuration
default_log_level = "DEBUG" if DEV else "INFO"
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

    return logger_config
