"""
Defines root ( heatflask.com/ ) webserver endpoints
"""
import os
import sanic.response as Response
from sanic.exceptions import SanicException
from functools import wraps
import sanic

from logging import getLogger
from ... import Users
from ... import Index

from ..config import APP_VERSION, APP_NAME, OFFLINE
from ..sessions import session_cookie

log = getLogger("heatflask.webserver.main")
log.setLevel("INFO")
log.propagate = True

bp = sanic.Blueprint("main", url_prefix="/")
U = Users.UserField


# ****** Splash Page ******
@bp.get("/")
@session_cookie(get=True, set=True, flashes=True)
async def splash_page(request):
    app = request.app
    #  This is what a user gets when they navigate their browser to
    #  https://heatflask.com (with or without www.)
    #
    # If this is a logged-in user then we send them a map page,
    # otherwise a splash page
    if request.ctx.current_user:
        cu = request.ctx.current_user
        fullname = f"{cu[U.FIRSTNAME]} {cu[U.LASTNAME]}"
        request.ctx.flash(f"Welcome back {fullname}")
        uid = cu[U.ID]
        if not await Index.has_user_entries(**cu):
            log.info("importing index for user %d", uid)
            app.add_task(Index.import_user_entries(**cu), name=f"import:{uid}")

        return Response.redirect(app.url_for("main.user_page", target_user_id=uid))

    params = {
        "app_name": APP_NAME,
        "app_env": os.environ.get("APP_ENV"),
        "runtime_json": {
            "urls": {
                "demo": app.url_for("activities.activities_page"),
                "directory": app.url_for("users.directory"),
                "authorize": app.url_for("auth.authorize", state=request.path),
            },
        },
    }
    log.warning(params)
    html = request.ctx.render_template("splash-page.html", **params)
    return Response.html(html)


def relevant_info(user):
    return (
        {
            "id": user[U.ID],
            "name": f"{user[U.FIRSTNAME]}",
            "profile": user[U.PROFILE],
            "private": user[U.PRIVATE],
        }
        if user
        else None
    )


# *** Main user/global activities page
@bp.get("/<target_user_id:int>")
@session_cookie(get=True, set=True, flashes=True)
async def user_page(request, target_user_id=None):
    target_user = await Users.get(target_user_id)
    if target_user_id and not target_user:
        raise SanicException(
            f"Sorry, Strava athlete {target_user_id} is not registered with Heatflask",
            status_code=404,
        )

    app = request.app
    params = {
        # These will be imbedded in the served html as text
        "APP_NAME": APP_NAME,
        "runtime_json": {
            # These will be available to the client as a JSON string
            # at non-visible element "#runtime_json"
            "APP_VERSION": APP_VERSION,
            "CURRENT_USER": relevant_info(request.ctx.current_user),
            "TARGET_USER": relevant_info(target_user),
            "ADMIN": request.ctx.is_admin,
            "OFFLINE": OFFLINE,
            "URLS": {
                "login": app.url_for("auth.authorize"),
                "query": app.url_for("activities.query"),
                "index": app.url_for("activities.activities_page"),
                "visibility": app.url_for("main.visibility", setting=""),
                "delete": app.url_for("main.delete"),
                "logout": app.url_for("auth.logout"),
            },
        },
    }
    html = request.ctx.render_template("main-page.html", **params)
    return Response.html(html)


@bp.get("/demo")
async def demo_page(request):
    raise SanicException("Not implemented yet!", status_code=501)


@bp.get("/test")
async def test(request):
    raise SanicException("get outta here", status_code=403)


# This decorator is for endpoints that default to doing something for
# the current user if there is one, or for admin user on behalf of a user.
# for example /endpoint/action?user=1234245
# if there is no user= arg then we assume the user is the currently logged in user,
# otherwise it is admin acting on behalf of a user
def self_or_admin(func):
    def decorator(f):
        @wraps(f)
        async def decorated_function(request, *args, **kwargs):
            target_user_id = request.args.get("user")
            if target_user_id and not request.ctx.is_admin:
                raise SanicException(
                    "sorry, you are not authorized to do this", status_code=401
                )
            elif not request.ctx.current_user:
                raise SanicException("Who are you?", status_code=400)

            target_user = (
                await Users.get(target_user_id)
                if target_user_id
                else request.ctx.current_user
            )
            if not target_user:
                raise SanicException(
                    f"User {target_user_id} not found.", status_code=404
                )

            return await f(request, target_user, *args, **kwargs)

        return decorated_function

    return decorator(func)


@bp.get(r"/visibility/<setting:(on|off|^$)>")
@session_cookie(get=True)
@self_or_admin
async def visibility(request, target_user, setting=None):
    if setting is not None:
        private = False if setting == "on" else True
        target_user = await Users.add_or_update(
            **{U.ID: target_user[U.ID], "private": private}
        )
    return Response.json(not target_user[U.PRIVATE])


@bp.get("/delete")
@session_cookie(get=True, set=True, flashes=True)
@self_or_admin
async def delete(request, target_user):
    uid = target_user[U.ID]
    await Users.delete(uid, deauthenticate=False)
    request.ctx.flash(f"Successfully deleted user {uid}")
    return Response.redirect(request.app.url_for("auth.logout"))
