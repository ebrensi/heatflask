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

app = Sanic(APP_NAME, log_config=LOG_CONFIG)

# Redis and MongoDB APIs are async and need to run in the same loop as app
# so we run init_app to "connect" them
DataAPIs.init_app(app)

# We maintain persistent logged-in sessions using a browser cookie
webserver_sessions.init_app(app)

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


@app.get("/", name="start")
async def test(request):
    this_url = request.url_for("start")
    auth_url = app.url_for("auth.authorize", state=this_url)
    login_msg = f"<a href='{auth_url}'>Authenticate with Strava</a>"
    logout_url = app.url_for("auth.logout", state=this_url)
    logout_msg = f"<a href='{logout_url}'>close session and log out of Strava</a>"

    user = request.ctx.current_user

    uid = user["firstname"] if user else None
    msg = logout_msg if user else login_msg

    return Response.html(
        f"""
        <!DOCTYPE html><html lang="en"><meta charset="UTF-8">
        <div>Hi {uid} 😎</div>
        <div>{msg}</div>
        </html>
        """
    )




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


# @app.route("/")
# async def test(request):
#     response = await request.respond(content_type="text/csv")
#     await response.send("foo,")
#     await response.send("bar")

#     # Optionally, you can explicitly end the stream by calling:
#     await response.eof()


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
