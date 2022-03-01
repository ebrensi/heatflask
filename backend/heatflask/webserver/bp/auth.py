"""
Defines /auth/* webserver endpoints
used for authenticating (logging in/out) Strava users
"""
import sanic.response as Response
import sanic

from logging import getLogger
from ... import Users
from ... import Strava
from ... import Index
from ... import Events

from ..sessions import session_cookie

log = getLogger(__name__)

bp = sanic.Blueprint("auth", url_prefix="/strava-auth")

#
# Authentication
#
# This blueprint serves the "splash" (login) page and
#  handles Strava authentication

# Attempt to authorize a user via Oauth(2)
# When a client requests this endpoint, we redirect them to
# Strava's authorization page, which will then request our
# enodpoint /authorized
@bp.get("/authorize")
async def authorize(request):
    state = request.args.get("state")
    return Response.redirect(
        Strava.auth_url(
            state=state,
            approval_prompt="force",
            redirect_uri=request.url_for("auth.auth_callback"),
        )
    )


# Authorization callback.  The service returns here to give us an access_token
# for the user who successfully logged in.
@bp.get("/authorized")
@session_cookie(get=True, set=True, flashes=True)
async def auth_callback(request):
    state = request.args.get("state")
    scope = request.args.get("scope")
    code = request.args.get("code")
    error = request.args.get("error")

    if not state:
        return Response.text("no state specified")

    if error:
        request.ctx.flash(f"Error: {request.args.get('error')}")
        return Response.redirect(state)

    if scope and ("activity:read" not in scope):
        request.ctx.flash("'activity:read' must be in scope.")
        return Response.redirect(state)

    strava_client = Strava.AsyncClient("admin")
    access_info = await strava_client.update_access_token(code=code)

    if (not access_info) or ("athlete" not in access_info):
        request.ctx.flash("login error?")
        return Response.redirect(state)

    strava_athlete = access_info.pop("athlete")
    strava_athlete["auth"] = access_info
    user = await Users.add_or_update(
        **strava_athlete, update_ts=True, inc_access_count=True
    )
    if not user:
        request.ctx.flash("database error?")
        return Response.redirect(state)

    # start user session (which will be persisted with a cookie)
    request.ctx.session["user"] = user["_id"]
    request.ctx.current_user = user

    has_index = await Index.has_user_entries(**user)
    log.info(
        "Athenticated user %d, access_count=%d, has_index=%s",
        user["_id"],
        user["access_count"],
        has_index,
    )

    if user["access_count"] == 1:
        await Events.new_event(msg=f"Authenicated new user {user['_id']}")
    return Response.redirect(state)


@bp.get("/logout")
@session_cookie(get=True, set=True)
async def logout(request):
    cuser = request.ctx.current_user
    cuser_id = cuser["_id"] if cuser else None
    request.ctx.current_user = None
    request.ctx.session = None
    state = request.args.get("state")
    return (
        Response.redirect(state)
        if state
        else Response.text(f"User {cuser_id} logged out")
    )
