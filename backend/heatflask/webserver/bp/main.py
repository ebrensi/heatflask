"""
Defines root ( heatflask.com/ ) webserver endpoints
"""
import os
import sanic.response as Response
from sanic.exceptions import SanicException
import sanic

from logging import getLogger
from ... import Users
from ... import Index

from ..config import APP_VERSION, APP_NAME
from ..sessions import session_cookie

log = getLogger(__name__)

bp = sanic.Blueprint("main", url_prefix="/")


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
        fullname = f"{cu[Users.FIRSTNAME]} {cu[Users.LASTNAME]}"
        request.ctx.flash(f"Welcome back {fullname}")
        uid = cu[Users.ID]
        if not await Index.has_user_entries(**cu):
            log.info("importing index for user %d", uid)
            app.add_task(Index.import_user_entries(**cu), name=f"import:{uid}")

        return Response.redirect(app.url_for("main.user_page", target_user_id=uid))

    params = {
        "app_name": APP_NAME,
        "app_env": os.environ.get("APP_ENV"),
        "runtime_json": {
            "urls": {
                "demo": app.url_for("activities.index_page"),
                "directory": app.url_for("users.directory"),
                "authorize": app.url_for("auth.authorize", state=request.endpoint),
            },
        },
    }
    html = request.ctx.render_template("splash-page.html", **params)
    return Response.html(html)


# *** Main user/global activities page
@bp.get("/<target_user_id:int>")
@bp.get("/global")
@session_cookie(get=True, set=True, flashes=True)
async def user_page(request, target_user_id=None):
    if target_user_id and not await Users.get(target_user_id):
        raise SanicException(
            f"Strava athlete {target_user_id} is not registered.", status_code=404
        )

    cu = request.ctx.current_user
    cu_data = {"id": cu[Users.ID], "profile": cu[Users.PROFILE]} if cu else None
    app = request.app
    params = {
        # These will be imbedded in the served html as text
        "APP_NAME": APP_NAME,
        "runtime_json": {
            # These will be available to the client as a JSON string
            # at non-visible element "#runtime_json"
            "APP_VERSION": APP_VERSION,
            "CURRENT_USER": cu_data,
            "TARGET_USER_ID": target_user_id,
            "ADMIN": request.ctx.is_admin,
            "URLS": {
                "login": app.url_for("auth.authorize"),
                "query": app.url_for("activities.query"),
                "index": app.url_for("activities.index_page"),
                "visibility": app.url_for("users.visibility"),
                "logout": app.url_for("auth.logout"),
                "delete": app.url_for("users.delete"),
                "strava": {
                    "athlete": "https://www.strava.com/athletes/",
                    "activity": "https://www.strava.com/activities/",
                },
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
