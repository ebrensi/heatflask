import os
import asyncio
import msgpack
from sanic import Sanic
import sanic.response as Response
from sanic.log import logger as log

import DataAPIs
import Strava
import Users
import Index
import Streams
from webserver_config import APP_NAME, LOG_CONFIG


app = Sanic(APP_NAME, log_config=LOG_CONFIG)
app.config.SERVER_NAME = os.environ.get("SERVER_NAME")


@app.listener("before_server_start")
async def init(sanic, loop):
    log.info("Heatflask server starting")
    await DataAPIs.connect()


@app.listener("after_server_stop")
async def shutdown(sanic, loop):
    log.info("Heatflask server stopping")
    await DataAPIs.disconnect()


#
# Authentication
#

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


# We add an identifier cookie to the user's browser upon authentication
# to create a persistent session
DEFAULT_COOKIE_SPEC = {
    # "expires": None,
    # "path": None,
    # "comment": None,
    # "domain": None,
    "max-age": 10 * 24 * 3600,  # 10 days
    # "secure": False,
    "httponly": True,
    "samesite": "strict",
}

COOKIE_NAME = APP_NAME


@app.on_request
async def fetch_user_from_cookie_info(request):
    cookie_value = request.cookies.get(COOKIE_NAME)
    if cookie_value:
        log.debug("got '%s' cookie: %s", COOKIE_NAME, cookie_value)
    else:
        log.debug("no '%s' cookie", COOKIE_NAME)
    request.ctx.user = await Users.get(cookie_value)
    log.debug("Session user: %s", request.ctx.user["_id"])


@app.on_response
async def reset_or_delete_cookie(request, response):
    # (re)set the user session cookie if there is a user
    # attached to this request context,
    # otherwise delete any set cookie (ending the session)
    if request.ctx.user:
        if request.cookies.get(COOKIE_NAME):
            del response.cookies[COOKIE_NAME]
            log.debug("deleted '%s' cookie", COOKIE_NAME)
    else:
        response.cookies[COOKIE_NAME] = request.ctx.user["_id"]
        for k, v in DEFAULT_COOKIE_SPEC.items():
            response.cookies[COOKIE_NAME][k] = v
        log.debug("set '%s' cookie %s", COOKIE_NAME, response.cookies[COOKIE_NAME])


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

    # start user session (which will be persisted with a cookie)
    request.ctx.user = user

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

    # msg = f"Authenticated{new_user} {user}"
    # log.info(msg)
    # if new_user:
    #     EventLogger.new_event(msg=msg)

    # return Response.redirect(state or app.url_for("main", username=user["_id"]))


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
    login_msg = f"<a href='{auth_url}'>Authenticate with Strava</a>"
    logout_url = app.url_for("logout")
    logout_msg = f"<a href='{logout_url}'>close session and log out of Strava</a>"

    uid = request.ctx.user.get("_id")
    msg = logout_msg if uid else login_msg

    return Response.html(
        f"""
        <!DOCTYPE html><html lang="en"><meta charset="UTF-8">
        <div>Hi {uid} 😎</div>
        <div>{msg}</div>
        """
    )


@app.post("/query")
async def query(request):
    query = request.json()

    response = await request.respond(content_type="application/msgpack")
    current_user = request.ctx.user
    if not current_user:
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
        if os.environ("APP_ENV").lower() == "development"
        else {"debug": False, "access_log": False}
    )
    app.run(**kwargs)
