import os
import asyncio
import msgpack
from sanic import Sanic
import sanic.response as Response
from sanic.log import logger as log

import DataAPIs
import Users
import Index
import Streams
from webserver_config import APP_NAME, LOG_CONFIG
import webserver_sessions
from webserver_auth import auth
import webserver_files

# log = getLogger("server")
# log.propagate = True

app = Sanic(APP_NAME, log_config=LOG_CONFIG)

# Redis and MongoDB APIs are async and need to run in the same loop as app
# so we run init_app to "connect" them
DataAPIs.init_app(app)

# enable persistent logged-in sessions using a browser cookie
webserver_sessions.init_app(app)

# set-up static and template file serving
webserver_files.init_app(app)

# This is the enpoints for authenticating with Strava
app.blueprint(auth)


async def aiter_import_index_progress(user_id):
    msg = True
    last_msg = None
    while msg:
        msg = await Index.check_import_progress(user_id)
        if msg and (msg != last_msg):
            yield msg
            last_msg = msg
        else:
            break
        await asyncio.sleep(0.5)


@app.get("/<username>/indexing_progress")
async def indexing_progress(request, username):
    response = await request.respond(content_type="text/csv")
    async for msg in aiter_import_index_progress(username):
        await response.send(msg)


@app.get("/")
async def splash(request):
    this_url = request.url_for("splash")

    cu = request.ctx.current_user
    if cu:
        webserver_sessions.flash("Welcome back %s", request.ctx.user["firstname"])
        # return Response.redirect(app.url_for("main", username=cu["id"]))

    params = {
        "app_name": APP_NAME,
        "app_env": os.environ.get("APP_ENV"),
        "urls": {
            # "demo": app.url_for("demo"),
            # "directory": app.url_for("public_directory"),
            "authorize": app.url_for("auth.authorize", state=this_url),
        },
    }

    html = webserver_files.render_template(
        "splash.html", flashes=webserver_sessions.get_flashes(request), **params
    )
    return Response.html(html)


@app.post("/query")
async def query(request):
    response = await request.respond(content_type="application/msgpack")

    # If queried user's index is currently being imported we
    # have to wait for that, while sending progress indicators
    query = request.json()

    async for msg in aiter_import_index_progress(query["user_id"]):
        response.send(msgpack.packb({"msg": msg}))

    summaries = await Index.query(**query)
    summaries_lookup = {A["_id"]: A for A in summaries}
    ids = list(summaries_lookup.keys())

    user = Users.get(query["user_id"])
    streams_iter = Streams.aiter_query(activity_ids=ids, user=user)
    async for aid, streams in streams_iter:
        A = summaries_lookup[aid]
        A["mpk"] = streams
        packed = msgpack.packb(A)
        response.send(packed)


if __name__ == "__main__":
    RUN_CONFIG = {
        "host": "0.0.0.0",
        "port": int(os.environ.get("PORT", 8000)),
        "workers": int(os.environ.get("WEB_CONCURRENCY", 1)),
        "debug": False,
        "access_log": False,
    }

    if os.environ.get("APP_ENV").lower() == "development":
        RUN_CONFIG.update({"host": "127.0.0.1", "debug": True, "access_log": True})

    app.config.SERVER_NAME = "{host}:{port}".format(**RUN_CONFIG)
    app.run(**RUN_CONFIG)
