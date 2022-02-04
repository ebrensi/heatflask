from sanic import Sanic
import sanic.response as Response
from sanic.log import logger as log
import asyncio

import Strava
import Users
from DataAPIs import mongodb, redis

app = Sanic("heatflask")
app.ctx.mongodb = mongodb
app.ctx.redis = redis


@app.listener('before_server_start')
async def init(sanic, loop):

    db_init_results = await asyncio.gather(
        Users.init_db(),
        # Index.init_db(),
        # Streams.init_db(),
        # Events.init_db(),
        # Updates.init_db()
    )
    log.info("Initializing datastores: %s", db_init_results)


# Attempt to authorize a user via Oauth(2)
# When a client requests this endpoint, we redirect them to
# Strava's authorization page, which will then request our
# enodpoint /authorized
@app.route("/authorize")
async def authorize(request):
    log.info(request)
    state = request.args.get("state")
    return Response.redirect(
        Strava.auth_url(state=state, redirect_uri=app.url_for("auth_callback"))
    )


# Authorization callback.  The service returns here to give us an access_token
# for the user who successfully logged in.
@app.route("/authorized")
async def auth_callback(request):
    state = request.args.get("state")

    if "error" in request.args:
        # flash(f"Error: {request.args.get('error')}")
        return Response.redirect(state or app.url_for("splash"))

    scope = request.args.get("scope")
    if not scope:
        log.exception("there is a problem with authentication")
        return Response.text("oops")

    if "activity:read" not in scope:
        # We need to be able to read the user's activities
        # return them to authorize
        return Response.redirect(app.url_for("authorize", state=state, _external=True))

    code = request.args.get("code")
    access_info = await Strava.exchange_code_for_token(code)

    Users.add_or_update(access_info)

    return Response.json(access_info)

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
