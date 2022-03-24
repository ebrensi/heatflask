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
    LOG_CONFIG,
    LOG_LEVEL,
    DEV,
    USE_REMOTE_DB,
)
from . import files

from .bp import auth
from .bp import users
from .bp import activities
from .bp import updates
from .bp import main

log = logging.getLogger("heatflask.webserver.serve")
log.propagate = True

app = Sanic(APP_BASE_NAME, log_config=LOG_CONFIG, strict_slashes=False)


# set-up static and template file serving
files.init_app(app)

# Endpoint Definitions
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

# Redis and MongoDB APIs are async and need to run in the same loop as app
# so we run init_app to "connect" them
app.register_listener(DataAPIs.connect, "before_server_start")
app.register_listener(DataAPIs.disconnect, "before_server_stop")

if os.environ.get("HEATFLASK_RESET"):

    async def reset_db(a, b, users=True, index=True, streams=True):
        if users:
            await Users.drop()
        if index:
            await Index.drop()
        if streams:
            await Streams.drop()
        print("Dropped databases")

    app.register_listener(reset_db, "before_server_start")

if APP_ENV != "development":
    # We don't do triage in development
    app.add_task(Users.triage)
    app.add_task(Index.triage)


if __name__ == "__main__":
    RUN_CONFIG = {
        "host": "127.0.0.1" if DEV else "0.0.0.0",
        "port": int(os.environ.get("PORT", 8000)),
        "workers": 1,  # int(os.environ.get("WEB_CONCURRENCY", 1)),
        "debug": DEV,
        "access_log": DEV,
        "reload_dir": files.FRONTEND_DIST_DIR,
    }
    app.config.SERVER_NAME = (
        "{host}:{port}".format(**RUN_CONFIG) if DEV else "heatflask.com"
    )
    app.config.MOTD_DISPLAY = {
        "APP_NAME": APP_NAME,
        "APP_ENV": APP_ENV,
        "SERVER_NAME": app.config.SERVER_NAME,
        "LOG_LEVEL": LOG_LEVEL,
        "REMOTE_DB": str(USE_REMOTE_DB),
        "collections": str(
            [Users.COLLECTION_NAME, Index.COLLECTION_NAME, Streams.COLLECTION_NAME]
        ),
    }
    app.run(**RUN_CONFIG)
