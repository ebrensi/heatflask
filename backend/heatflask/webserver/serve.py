"""
This is the main thing that runs on the backend
"""
import os
import asyncio
from sanic import Sanic
import sanic.response as Response

# from sanic.log import logger as log
import logging

from .. import DataAPIs
from .. import Index

from .config import APP_BASE_NAME, APP_NAME, LOG_CONFIG
from . import sessions
from . import files

from .bp import auth
from .bp import users
from .bp import activities

log = logging.getLogger("heatflask.webserver.serve")
log.propagate = True
log.setLevel("DEBUG")

app = Sanic(APP_BASE_NAME, log_config=LOG_CONFIG)
# Redis and MongoDB APIs are async and need to run in the same loop as app
# so we run init_app to "connect" them
DataAPIs.init_app(app)

# enable persistent logged-in sessions using a browser cookie
sessions.init_app(app)

# set-up static and template file serving
files.init_app(app)

# Endpoint Definitions
app.blueprint(auth.bp)
app.blueprint(users.bp)
app.blueprint(activities.bp)


# ****** Splash Page ******
@app.get("/")
async def splash(request):
    this_url = request.url_for("splash")

    cu = request.ctx.current_user
    if cu:
        username = cu["username"]
        request.ctx.flash(f"Welcome back {username}")
        if not await Index.has_user_entries(**cu):
            log.info("importing index for user %d", cu["_id"])
            asyncio.create_task(Index.import_user_entries(**cu))
        else:
            log.info("fake-importing index for user %d", cu["_id"])
            app.add_task(Index.fake_import(uid=cu["_id"]))

        # return Response.redirect(app.url_for("main", username=cu["id"]))

    params = {
        "app_name": APP_NAME,
        "app_env": os.environ.get("APP_ENV"),
        "runtime_json": {
            "demo": app.url_for("activities.index_page"),
            "directory": app.url_for("users.directory"),
            "authorize": app.url_for("auth.authorize", state=this_url),
        },
    }

    html = request.ctx.render_template("splash-page.html", **params)
    return Response.html(html)


if __name__ == "__main__":
    RUN_CONFIG = {
        "host": "0.0.0.0",
        "port": int(os.environ.get("PORT", 8000)),
        "workers": int(os.environ.get("WEB_CONCURRENCY", 1)),
        "debug": False,
        "access_log": False,
        "reload_dir": files.FRONTEND_DIST_DIR,
    }

    if os.environ.get("APP_ENV").lower() == "development":
        RUN_CONFIG.update({"host": "127.0.0.1", "debug": True, "access_log": True})

    app.config.SERVER_NAME = "{host}:{port}".format(**RUN_CONFIG)
    app.run(**RUN_CONFIG)
