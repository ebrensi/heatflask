"""
Defines /auth/* webserver endpoints
used for authenticating (logging in/out) Strava users
"""
import sanic

from logging import getLogger
from ... import Users
from ... import Strava
from ... import Index
from ... import Events

from ..sessions import session_cookie, SessionRequest

log = getLogger(__name__)
log.setLevel("INFO")
log.propagate = True

bp = sanic.Blueprint("auth", url_prefix="/auth")

#
# Authentication
#
# This blueprint serves the "splash" (login) page and
#  handles Strava authentication

U = Users.UserField


@bp.get("/authorize")
async def authorize(request: SessionRequest):
    """
    Attempt to authorize a user via Oauth(2)
    When a client requests this endpoint, we redirect them to
    Strava's authorization page, which will then request /authorized
    """
    state = request.args.get("state")
    return sanic.response.redirect(
        Strava.auth_url(
            state=state,
            scope=["read", "activity:read", "activity:read_all"],
            approval_prompt="force",
            redirect_uri=request.url_for("auth.auth_callback"),
        )
    )


@bp.get("/authorized")
@session_cookie(get=True, set=True, flashes=True)
async def auth_callback(request: SessionRequest):
    """
    Authorization Callback
    After authenticating on Strava's login page, Strava calls this endpoint
    with an access_token for the user who successfully logged in.
    """
    response: Strava.AuthResponse = request.args
    code = response.get("code")
    error = response.get("error")
    state = response.get("state")
    scope = response.get("scope")

    if not state:
        return sanic.response.text("no state specified")

    if error:
        request.ctx.flash(f"Error: {request.args.get('error')}")
        return sanic.response.redirect(state)

    if scope and ("activity:read" not in scope):
        request.ctx.flash("'activity:read' must be in scope.")
        return sanic.response.redirect(state)

    strava_client = Strava.AsyncClient("admin")
    access_info = await strava_client.update_access_token(code=code)

    if (not access_info) or ("athlete" not in access_info):
        request.ctx.flash("login error?")
        return sanic.response.redirect(state)

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
        return sanic.response.redirect(state)

    # start user session (which will be persisted with a cookie)
    request.ctx.session["user"] = user[U.ID]
    request.ctx.current_user = user

    has_index = await Index.has_user_entries(**user)
    log.info(
        "Athenticated user %d, access_count=%d, has_index=%s",
        user[U.ID],
        user[U.LOGIN_COUNT],
        has_index,
    )
    if user[U.LOGIN_COUNT] == 1:
        await Events.new_event(msg=f"Authenicated new user {user[U.ID]}")
    return sanic.response.redirect(state)


@bp.get("/logout")
@session_cookie(get=True, set=True, flashes=True)
async def logout(request):
    """
    Log out a currently logged in user (remove browser cookie).
    This does not effect the user's Strava authentication.  The user will still be
    logged-in to Strava.
    """
    cuser = request.ctx.current_user
    cuser_id = cuser[U.ID] if cuser else None
    request.ctx.current_user = None
    if cuser:
        request.ctx.flash(f"User {cuser_id} logged out.")
    splash_page_url = request.app.url_for("main.splash_page")
    state = request.args.get("state", splash_page_url)
    return (
        sanic.response.redirect(state)
        if state
        else sanic.response.text(f"User {cuser_id} logged out")
    )
