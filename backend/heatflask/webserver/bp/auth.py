"""
Defines /auth/* webserver endpoints
used for authenticating (logging in/out) Strava users
"""
import sanic.response as Response
from sanic.exceptions import SanicException
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
SCOPE = ",".join(["read", "activity:read", "activity:read_all"])


@bp.get("/authorize")
async def authorize(request):
    """
    Attempt to authorize a user via Oauth(2)
    When a client requests this endpoint, we redirect them to
    Strava's authorization page, which will then request our
    endpoint /authorized
    """
    state = request.args.get("state")
    return Response.redirect(
        Strava.auth_url(
            state=state,
            scope=SCOPE,
            approval_prompt="force",
            redirect_uri=request.url_for("auth.auth_callback"),
        )
    )


@bp.get("/authorized")
@session_cookie(get=True, set=True, flashes=True)
async def auth_callback(request):
    """
    Authorization callback.  The service returns here to give us an
    access_token for the user who successfully logged in.
    """
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
    user = await Users.add_or_update(
        update_last_login=True,
        update_index_access=True,
        inc_login_count=True,
        private=True,  # User accounts are private by default
        **strava_athlete,
        auth=access_info,
    )
    if not user:
        request.ctx.flash("database error?")
        return Response.redirect(state)

    # start user session (which will be persisted with a cookie)
    request.ctx.session["user"] = user[Users.ID]
    request.ctx.current_user = user

    has_index = await Index.has_user_entries(**user)
    log.info(
        "Athenticated user %d, access_count=%d, has_index=%s",
        user[Users.ID],
        user[Users.LOGIN_COUNT],
        has_index,
    )
    if user[Users.LOGIN_COUNT] == 1:
        await Events.new_event(msg=f"Authenicated new user {user[Users.ID]}")
    return Response.redirect(state)


@bp.get("/logout")
@session_cookie(get=True, set=True, flashes=True)
async def logout(request):
    cuser = request.ctx.current_user
    if not cuser:
        raise SanicException("No user currently logged in.", status_code=400)

    cuser_id = cuser[Users.ID]
    request.ctx.current_user = None

    request.ctx.flash(f"User {cuser_id} logged out.")
    splash_page_url = request.app.url_for("main.splash_page")
    state = request.args.get("state", splash_page_url)
    return (
        Response.redirect(state)
        if state
        else Response.text(f"User {cuser_id} logged out")
    )
