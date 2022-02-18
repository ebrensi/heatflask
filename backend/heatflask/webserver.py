import os
import asyncio
import msgpack
from sanic import Sanic
import sanic.response as Response
from sanic.log import LOGGING_CONFIG_DEFAULTS as log_config, logger as log

import DataAPIs
import Strava
import Users
import Index
import Streams
import logging_tree


# Logging config
ENVIRONMENT = os.environ.get("ENVIRONMENT", "production")
default_log_level = "DEBUG" if ENVIRONMENT == "development" else "INFO"
LOG_LEVEL = os.environ.get("LOG_LEVEL", default_log_level)
base_logger_config = {"handlers": ["console"]}
logger_config = {
    "DataAPIs": {**base_logger_config, "level": LOG_LEVEL},
    "Strava": {**base_logger_config, "level": LOG_LEVEL},
    "Users": {**base_logger_config, "level": LOG_LEVEL},
    "Index": {**base_logger_config, "level": LOG_LEVEL},
    "Utility": {**base_logger_config, "level": LOG_LEVEL},
}
log_config["loggers"].update(logger_config)

ts = "" if ENVIRONMENT == "development" else "%(asctime)s"
log_fmt = f"{ts}%(levelname)5s [%(name)s.%(funcName)s] %(message)s"
log_config["formatters"]["generic"]["format"] = log_fmt

access_log_fmt = (
    f"{ts}%(levelname)5s [%(name)s] [%(host)s]:"
    f" %(request)s %(message)s %(status)d %(byte)d"
)
log_config["formatters"]["access"]["format"] = access_log_fmt
# End Logging config

app = Sanic("heatflask", log_config=log_config)
app.config.SERVER_NAME = "http://127.0.0.1:8000"

# logging_tree.printout()


@app.listener("before_server_start")
async def init(sanic, loop):
    log.info("Heatflask server starting")
    await DataAPIs.connect()


@app.listener("after_server_stop")
async def shutdown(sanic, loop):
    log.info("Heatflask server stopping")
    await DataAPIs.disconnect()


# Attempt to authorize a user via Oauth(2)
# When a client requests this endpoint, we redirect them to
# Strava's authorization page, which will then request our
# enodpoint /authorized
@app.get("/authorize")
async def authorize(request):
    log.info(request)
    state = request.args.get("state")
    return Response.redirect(
        Strava.auth_url(
            state=state, redirect_uri=app.url_for("auth_callback", _external=True)
        )
    )


# Authorization callback.  The service returns here to give us an access_token
# for the user who successfully logged in.
@app.get("/authorized")
async def auth_callback(request):
    state = request.args.get("state")

    if "error" in request.args:
        # flash(f"Error: {request.args.get('error')}")
        log.debug("authorization error")
        return Response.redirect(state or app.url_for("splash"))

    scope = request.args.get("scope")
    if not scope:
        log.exception("there is a problem with authentication")
        return Response.text("oops")

    if "activity:read" not in scope:
        # We need to be able to read the user's activities
        # return them to authorize
        return Response.redirect(app.url_for("authorize", state=state))

    code = request.args.get("code")
    strava_client = Strava.AsyncClient("admin")
    access_info = await strava_client.update_access_token(code=code)
    strava_athlete = access_info.pop("athlete")
    strava_athlete["auth"] = access_info
    user = await Users.add_or_update(
        **strava_athlete, update_ts=True, inc_access_count=True
    )
    if not user:
        log.info("unable to add user")
        return Response.text("oops")

    has_index = await Index.has_user_entries(**user)
    log.info(
        "Athenticated user %d, access_count=%d, has_index=%s",
        user["_id"],
        user["access_count"],
        has_index,
    )

    if not has_index:
        # Start building user index in the background
        # app.add_task(Index.dummy_op())
        asyncio.create_task(Index.import_user_entries(**user))

    user["ts"] = str(user["ts"])
    return Response.redirect(app.url_for("indexing_progress", username=user["_id"]))
    # remember=True, for persistent login.
    # login_user(user, remember=True)

    # msg = f"Authenticated{new_user} {user}"
    # log.info(msg)
    # if new_user:
    #     EventLogger.new_event(msg=msg)

    # return Response.redirect(state or app.url_for("main", username=user.id))


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
async def test(request):
    auth_url = app.url_for("authorize")
    return Response.html(
        f"""
        <!DOCTYPE html><html lang="en"><meta charset="UTF-8">
        <div>Hi 😎</div>
        <div><a href='{auth_url}'>Authenticate with Strava</a></li></div>
        """
    )


@app.post("/query")
async def query(request):
    query = request.json()

    response = await request.respond(content_type="application/msgpack")
    user = Users.get(query.get("user_id"))
    if not user:
        return

    # If queried user's index is currently being imported we
    # have to wait for that, while sending progress indicators
    async for msg in aiter_import_index_progress(query["user_id"]):
        response.send(msgpack.packb({"msg": msg}))

    summaries = await Index.query(**query)
    summaries_lookup = {A["_id"]: A for A in summaries}
    ids = list(summaries_lookup.keys())

    streams_iter = Streams.aiter_query(activity_ids=ids, user=current_user)
    async for aid, streams in streams_iter:
        A = summaries_lookup[aid]
        A["mpk"] = streams
        packed = msgpack.packb(A)
        response.send(packed)

    # Optionally, you can explicitly end the stream by calling:
    await response.eof()


# @app.route("/")
# async def test(request):
#     response = await request.respond(content_type="text/csv")
#     await response.send("foo,")
#     await response.send("bar")

#     # Optionally, you can explicitly end the stream by calling:
#     await response.eof()


if __name__ == "__main__":
    kwargs = (
        {"debug": True, "access_log": True}
        if ENVIRONMENT == "development"
        else {"debug": False, "access_log": False}
    )
    app.run(**kwargs)
