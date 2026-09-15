"""
This is the main thing that runs on the backend
"""

import os
from sanic import Sanic
import asyncio
import logging

from .. import DataAPIs
from .. import Index
from .. import Users
from .. import Streams

from .config import (
    APP_BASE_NAME,
    APP_NAME,
    APP_ENV,
    LOG_LEVEL,
    DEV,
    USE_REMOTE_DB,
    OFFLINE,
    SERVER_NAME,
    get_logger_config,
)
from . import files

from .bp import auth
from .bp import users
from .bp import activities
from .bp import updates
from .bp import main

log = logging.getLogger("heatflask.webserver.serve")
log.setLevel("INFO")
log.propagate = True

app = Sanic(APP_BASE_NAME, log_config=get_logger_config(), strict_slashes=False)

# Set here, not under __main__: Sanic serves requests from a worker process that
# imports this module afresh, so config set under __main__ never reaches it --
# the hardcoded SERVER_NAME that used to be set there never took effect.
#
# Left unset in development, which makes request.url_for build URLs from the
# host a request actually came to (localhost through an ssh tunnel, say), so the
# login redirect comes back to the domain holding the session cookie.
if SERVER_NAME:
    app.config.SERVER_NAME = SERVER_NAME

# set-up static and template file serving
files.init_app(app)

# Endpoint Definitions
# sanic-openapi is dead (last release Jan 2022, Python <=3.9). Its successor
# sanic-ext auto-attaches when installed and serves the same OAS3 docs at /docs,
# so there is no blueprint to register here.
app.blueprint(main.bp)
app.blueprint(auth.bp)
app.blueprint(users.bp)
app.blueprint(activities.bp)
app.blueprint(updates.bp)


async def cancel_background_tasks(*args):
    for task in app.tasks:
        task.cancel()
    try:
        app.purge_tasks()
    except asyncio.exceptions.CancelledError:
        log.error("caught cancelled exception")


app.register_listener(cancel_background_tasks, "after_server_stop")

# The MongoDB API is async and needs to run in the same loop as the app,
# so we "connect" it from a listener
app.register_listener(DataAPIs.connect, "before_server_start")
app.register_listener(DataAPIs.disconnect, "before_server_stop")


async def reset_db(*args, users=True, index=True, streams=True):
    if users:
        await Users.drop()
        print("dropped Users")
    if index:
        await Index.drop()
        print("dropped Index")
    if streams:
        await Streams.drop()
        print("dropped Streams")
    app.stop()


if os.environ.get("HEATFLASK_RESET"):
    app.register_listener(reset_db, "before_server_start")

if os.environ.get("DROP_ACTIVITIES"):

    def myfunc(*args):
        return reset_db(*args, streams=True, index=False, users=False)

    app.register_listener(myfunc, "before_server_start")

# Triage retires inactive users and expires stale indexes. Not in development,
# and not where SKIP_TRIAGE is set: heatflask-dev shares production's database,
# and one app doing it is enough. (APP_ENV=development cannot stand in for this
# there -- it also binds the server to 127.0.0.1 and relaxes the secrets.)
if APP_ENV != "development" and not os.environ.get("SKIP_TRIAGE"):
    app.add_task(Users.triage)
    app.add_task(Index.triage)

if __name__ == "__main__":
    RUN_CONFIG = {
        "host": "127.0.0.1" if DEV else "0.0.0.0",
        "port": int(os.environ.get("PORT", 8000)),
        "workers": 1,  # int(os.environ.get("WEB_CONCURRENCY", 1)),
        "debug": False,
        "access_log": DEV,
        # Reloading on file changes is for development: in production it adds a
        # watcher process, and restarts the server whenever a file is touched
        "auto_reload": DEV,
        "reload_dir": files.FRONTEND_DIST_DIR if DEV else None,
    }
    app.config.MOTD_DISPLAY = {
        "APP_NAME": APP_NAME,
        "APP_ENV": APP_ENV,
        "SERVER_NAME": SERVER_NAME or "(taken from each request)",
        "LOG_LEVEL": LOG_LEVEL,
        "REMOTE_DB": str(USE_REMOTE_DB),
        "OFFLINE": str(OFFLINE),
        "collections": str(
            [Users.COLLECTION_NAME, Index.COLLECTION_NAME, Streams.COLLECTION_NAME]
        ),
    }
    app.run(**RUN_CONFIG)
