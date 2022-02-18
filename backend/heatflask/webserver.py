from sanic import Sanic
import sanic.response as Response
from sanic.log import logging, LOGGING_CONFIG_DEFAULTS as log_config, logger as log
import asyncio

import DataAPIs
import Strava
import Users
import Index
import logging_tree


# Logging config
lc = log_config["loggers"]["sanic.root"]
lc["level"] = "DEBUG"
log_config["loggers"].update(
    {"DataAPIs": lc, "Strava": lc, "Users": lc, "Index": lc, "Utility": lc}
)

log_msg_format = "%(levelname)5s [%(name)s.%(funcName)s] %(message)s"
log_config["formatters"]["generic"].update(
    {
        "format": log_msg_format,
    }
)

access_log_format = (
    "%(levelname)5s [%(name)s] [%(host)s]: "
    + "%(request)s %(message)s %(status)d %(byte)d"
)
log_config["formatters"]["access"].update(
    {
        "format": access_log_format,
    }
)
# End Logging config

app = Sanic("heatflask", log_config=log_config)
app.config.SERVER_NAME = "http://127.0.0.1:8000"

logging_tree.printout()


@app.listener("before_server_start")
async def init(sanic, loop):
    log.info("Heatflask server starting")
    await DataAPIs.connect()
    # loggers = [logging.getLogger(name) for name in logging.root.manager.loggerDict]
    # logging.warning("after server start. loggers: %s", loggers)


@app.listener("after_server_stop")
async def shutdown(sanic, loop):
    log.info("Heatflask server stopping")
    await DataAPIs.disconnect()


# Attempt to authorize a user via Oauth(2)
# When a client requests this endpoint, we redirect them to
# Strava's authorization page, which will then request our
# enodpoint /authorized
@app.route("/authorize")
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
@app.route("/authorized")
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

    if True:  # not has_index:
        # Start building user index in the background
        app.add_task(Index.dummy_op())
        # app.add_task(Index.import_user_entries(**user))
        # asyncio.create_task(Index.import_user_entries(**user))
        # await Index.import_user_entries(**user)

    user["ts"] = str(user["ts"])
    return Response.json(user)

    # remember=True, for persistent login.
    # login_user(user, remember=True)

    # msg = f"Authenticated{new_user} {user}"
    # log.info(msg)
    # if new_user:
    #     EventLogger.new_event(msg=msg)

    # return Response.redirect(state or app.url_for("main", username=user.id))


@app.route("/")
async def test(request):
    auth_url = app.url_for("authorize")
    return Response.html(
        f"""
        <!DOCTYPE html><html lang="en"><meta charset="UTF-8">
        <div>Hi 😎</div>
        <div><a href='{auth_url}'>Authenticate with Strava</a></li></div>
        """
    )


# @app.route("/")
# async def test(request):
#     response = await request.respond(content_type="text/csv")
#     await response.send("foo,")
#     await response.send("bar")

#     # Optionally, you can explicitly end the stream by calling:
#     await response.eof()


if __name__ == "__main__":
    app.run(debug=True, access_log=True)
