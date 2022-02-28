"""
This is the main thing that runs on the backend
"""
import os
import asyncio
import msgpack
from sanic import Sanic
import sanic.response as Response
from sanic.log import logger as log

import Utility
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
log.setLevel("DEBUG")

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
            "demo": app.url_for("activities_page"),
            "directory": app.url_for("directory"),
            "authorize": app.url_for("auth.authorize", state=this_url),
        },
    }

    html = request.ctx.render_template("splash-page.html", **params)
    return Response.html(html)


# **** Users ******
@app.get("/users/query")
async def users_query(request):
    output = request.args.get("output", "json")
    admin = request.args.get("admin")
    if admin:
        cu = request.ctx.current_user
        if (not cu) or (not Users.is_admin(cu["_id"])):
            return Response.json({})

    cursor = Users.dump(admin=admin, output=output)
    dump = [a async for a in cursor]
    return Response.json(dump)


@app.get("/users/directory")
async def directory(request):
    admin = request.args.get("admin")
    if admin:
        cu = request.ctx.current_user
        if not Users.is_admin(cu["_id"]):
            return Response.redirect(auth.authorize, state=request.url)

    kwargs = {"admin": 1} if admin else {}
    query_url = request.url_for("users_query", output="csv", **kwargs)
    params = {"app_name": APP_NAME, "admin": 1 if admin else 0, "url": query_url}
    html = request.ctx.render_template("directory-page.html", **params)
    return Response.html(html)


# **** Activities ******


def index_dict_to_fields(d):
    return [d[f] for f in Index.fields]


@app.post("/activities/query")
async def activities_query(request):
    # If queried user's index is currently being imported we
    # have to wait for that, while sending progress indicators
    query = request.json
    target_user_id = query.get("user_id")
    streams = query.pop("streams", True)

    is_owner_or_admin = request.ctx.current_user and (
        (request.ctx.current_user["_id"] == target_user_id)
        or Users.is_admin(request.ctx.current_user["_id"])
    )

    # Query will only return private activities if current_user
    # is owner of the activities (or admin)
    if not is_owner_or_admin:
        query["private"] = False

    response = await request.respond(content_type="application/msgpack")
    async for msg in Index.import_index_progress(target_user_id):
        await response.send(msgpack.packb({"msg": msg}))
        log.info("awaiting index import finish: %s", msg)

    query_result = await Index.query(**query)
    if "delete" in query_result:
        await response.send(msgpack.packb({"delete": query_result["delete"]}))

    summaries = query_result["docs"]
    await response.send(msgpack.packb({"count": len(summaries)}))

    if not streams:
        for A in summaries:
            await response.send(msgpack.packb(A))
        return

    summaries_lookup = {A["_id"]: A for A in summaries}
    ids = list(summaries_lookup.keys())

    user = Users.get(target_user_id)
    streams_iter = Streams.aiter_query(activity_ids=ids, user=user)
    async for aid, streams in streams_iter:
        A = summaries_lookup[aid]
        A["mpk"] = streams
        packed = msgpack.packb(A)
        await response.send(packed)


@app.get("/activities/index")
async def activities_page(request):
    current_user_id = (
        request.ctx.current_user["_id"] if request.ctx.current_user else None
    )
    target_user_id = request.args.get("user", current_user_id)

    is_owner_or_admin = current_user_id == target_user_id
    if not is_owner_or_admin:
        return Response.text("Sorry, you are not authorized for this action")

    query_url = request.url_for("activities_query")
    query_obj = Utility.cleandict(
        {"user_id": target_user_id, "limit": 0, "streams": False}
    )

    params = {"app_name": APP_NAME, "query_url": query_url, "query_obj": query_obj}
    html = request.ctx.render_template("index-page.html", **params)
    return Response.html(html)


if __name__ == "__main__":
    RUN_CONFIG = {
        "host": "0.0.0.0",
        "port": int(os.environ.get("PORT", 8000)),
        "workers": int(os.environ.get("WEB_CONCURRENCY", 1)),
        "debug": False,
        "access_log": False,
        "reload_dir": webserver_files.FRONTEND_DIST_DIR,
    }

    if os.environ.get("APP_ENV").lower() == "development":
        RUN_CONFIG.update({"host": "127.0.0.1", "debug": True, "access_log": True})

    app.config.SERVER_NAME = "{host}:{port}".format(**RUN_CONFIG)
    app.run(**RUN_CONFIG)
