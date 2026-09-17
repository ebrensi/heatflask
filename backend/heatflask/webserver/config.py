import os
import subprocess
from pathlib import Path
from sanic.log import LOGGING_CONFIG_DEFAULTS
import logging

log = logging.getLogger("heatflask.webserver.config")
log.setLevel("INFO")
log.propagate = True

# General app configuration
APP_BASE_NAME = "Heatflask"

# The version number is kept in /VERSION at the root of the repo and bumped by
# hand. What a bump means is in docs/VERSIONING.md: the compatibility surface
# is the set of parameters in a map's URL, since those are what other people
# have saved in their links.
REPO_ROOT = Path(__file__).parents[3]
try:
    APP_VERSION = (REPO_ROOT / "VERSION").read_text().strip()
except OSError:
    log.warning("no VERSION file in %s", REPO_ROOT)
    APP_VERSION = "0.0.0"


def git(*args):
    try:
        result = subprocess.run(
            ["git", *args],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=True,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    return result.stdout.strip()


def get_build_metadata():
    """Name the exact build this version number was cut from.

    Heroku's container builder hands the build nothing of its own -- the build
    args in heroku.yml are static strings -- so the commit can arrive by any of
    several routes, and we take the first one that is there.
    """
    for var in (
        "GIT_COMMIT",  # docker build --build-arg, baked in by our Dockerfile
        "SOURCE_VERSION",  # Heroku buildpack builds, and most CI
        "HEROKU_BUILD_COMMIT",  # heroku labs:enable runtime-dyno-build-metadata
        "HEROKU_SLUG_COMMIT",  # ...its deprecated predecessor
    ):
        commit = os.environ.get(var)
        if commit:
            return f"g{commit[:7]}"

    # A development checkout can just ask git. The container has neither git
    # nor a .git directory, so this answers only here.
    commit = git("rev-parse", "--short=7", "HEAD")
    if commit:
        return f"g{commit}.dirty" if git("status", "--porcelain") else f"g{commit}"

    # Heroku without the commit: the release number at least names the deploy.
    release = os.environ.get("HEROKU_RELEASE_VERSION")
    return f"heroku.{release.lstrip('v')}" if release else None


# The full identity of a running build, e.g. "1.3.0+g1d39764". The part after
# the "+" is semver build metadata: it says which build, and is ignored when
# versions are compared. The frontend prints this to the browser console, so a
# screenshot says what it was taken from.
BUILD_METADATA = get_build_metadata()
APP_BUILD = f"{APP_VERSION}+{BUILD_METADATA}" if BUILD_METADATA else APP_VERSION
APP_NAME = f"{APP_BASE_NAME} v{APP_BUILD}"

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
