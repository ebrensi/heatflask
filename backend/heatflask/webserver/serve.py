"""
This is the main thing that runs on the backend
"""
import os
from sanic import Sanic
import sanic.response as Response
import asyncio

# from sanic.log import logger as log
import logging

from .. import DataAPIs
from .. import Index
from .. import Users
from .. import Streams

from .config import APP_BASE_NAME, APP_NAME, LOG_CONFIG
from .sessions import session_cookie
from . import files

from .bp import auth
from .bp import users
from .bp import activities
from .bp import updates

log = logging.getLogger("heatflask.webserver.serve")
log.propagate = True

app = Sanic(APP_BASE_NAME, log_config=LOG_CONFIG, strict_slashes=False)


# set-up static and template file serving
files.init_app(app)

# Endpoint Definitions
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
else:
    app.add_task(Users.triage)
    app.add_task(Index.triage)
    log.info("tasks: %s", app.tasks)

app.register_listener(DataAPIs.disconnect, "after_server_stop")


# ****** Splash Page ******
@app.get("/")
@session_cookie(get=True, set=True, flashes=True)
async def splash(request):
    this_url = request.url_for("splash")

    cu = request.ctx.current_user
    if cu:
        fullname = f"{cu[Users.FIRSTNAME]} {cu[Users.LASTNAME]}"
        request.ctx.flash(f"Welcome back {fullname}")
        uid = cu[Users.ID]
        if not await Index.has_user_entries(**cu):
            log.info("importing index for user %d", uid)
            app.add_task(Index.import_user_entries(**cu), name=f"import:{uid}")
        else:
            log.info("fake-importing index for user %d", uid)
            app.add_task(Index.fake_import(uid=uid), name=f"import:{uid}")
            pass

        # return Response.redirect(app.url_for("main", user_id=uid))

    params = {
        "app_name": APP_NAME,
        "app_env": os.environ.get("APP_ENV"),
        "runtime_json": {
            "urls": {
                "demo": app.url_for("activities.index_page"),
                "directory": app.url_for("users.directory"),
                "authorize": app.url_for("auth.authorize", state=this_url),
            },
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
