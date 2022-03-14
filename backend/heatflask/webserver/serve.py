"""
This is the main thing that runs on the backend
"""
import os
from sanic import Sanic
from sanic.exceptions import SanicException
import sanic.response as Response
import asyncio

# from sanic.log import logger as log
import logging

from .. import DataAPIs
from .. import Index
from .. import Users
from .. import Streams

from .config import APP_BASE_NAME, APP_VERSION, APP_NAME, APP_ENV, LOG_CONFIG
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
elif APP_ENV != "development":
    # We don't do triaging in development
    app.add_task(Users.triage)
    app.add_task(Index.triage)

app.register_listener(DataAPIs.disconnect, "after_server_stop")


# ****** Splash/Main Page ******
@app.get("/")
@session_cookie(get=True, set=True, flashes=True)
async def splash_page(request):
    #  This is what a user gets when they navigate their browser to
    #  https://heatflask.com (with or without www.)
    #
    # If this is a logged-in user then we send them a map page,
    # otherwise a splash page
    if request.ctx.current_user:
        cu = request.ctx.current_user
        fullname = f"{cu[Users.FIRSTNAME]} {cu[Users.LASTNAME]}"
        request.ctx.flash(f"Welcome back {fullname}")
        uid = cu[Users.ID]
        if not await Index.has_user_entries(**cu):
            log.info("importing index for user %d", uid)
            app.add_task(Index.import_user_entries(**cu), name=f"import:{uid}")

        return Response.redirect(app.url_for("user_page", target_user_id=uid))

    params = {
        "app_name": APP_NAME,
        "app_env": os.environ.get("APP_ENV"),
        "runtime_json": {
            "urls": {
                "demo": app.url_for("activities.index_page"),
                "directory": app.url_for("users.directory"),
                "authorize": app.url_for("auth.authorize", state=request.endpoint),
            },
        },
    }
    html = request.ctx.render_template("splash-page.html", **params)
    return Response.html(html)


@app.get("/<target_user_id:int>")
@app.get("/global")
@session_cookie(get=True, set=True, flashes=True)
async def user_page(request, target_user_id=None):
    if target_user_id and not await Users.get(target_user_id):
        raise SanicException(
            f"Strava athlete {target_user_id} is not registered.", status_code=404
        )

    cu = request.ctx.current_user
    cu_data = {"id": cu[Users.ID], "profile": cu[Users.PROFILE]} if cu else None
    app = request.app
    params = {
        # These will be imbedded in the served html as text
        "APP_NAME": APP_NAME,
        "runtime_json": {
            # These will be available to the client as a JSON string
            # at non-visible element "#runtime_json"
            "APP_VERSION": APP_VERSION,
            "CURRENT_USER": cu_data,
            "TARGET_USER_ID": target_user_id,
            "ADMIN": request.ctx.is_admin,
            "URLS": {
                "login": app.url_for("auth.authorize"),
                "query": app.url_for("activities.query"),
                "index": app.url_for("activities.index_page"),
                "visibility": app.url_for("users.visibility"),
                "logout": app.url_for("auth.logout"),
                "delete": app.url_for("users.delete"),
                "strava": {
                    "athlete": "https://www.strava.com/athletes/",
                    "activity": "https://www.strava.com/activities/",
                },
            },
        },
    }
    html = request.ctx.render_template("main-page.html", **params)
    return Response.html(html)


@app.get("/demo")
async def demo_page(request):
    raise SanicException("Not implemented yet!", status_code=501)


@app.get("/test")
async def test(request):
    raise SanicException("get outta here", status_code=403)


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
