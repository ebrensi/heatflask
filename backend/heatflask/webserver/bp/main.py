"""
Defines root ( heatflask.com/ ) webserver endpoints
"""

import os
import sanic.response as Response
from sanic.request import Request
from sanic.exceptions import SanicException
from functools import wraps
import sanic

from logging import getLogger
from ... import Users
from ... import Index
from ... import History

from ..config import APP_VERSION, APP_BASE_NAME, OFFLINE
from ..sessions import session_cookie

log = getLogger("heatflask.webserver.main")
log.setLevel("INFO")
log.propagate = True

bp = sanic.Blueprint("main", url_prefix="/")
U = Users.UserField


# ****** Splash Page ******
@bp.get("/")
@session_cookie(get=True, set=True, flashes=True)
async def splash_page(request: Request):
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
        "app_name": APP_BASE_NAME,
        "app_env": os.environ.get("APP_ENV"),
        "runtime_json": {
            "urls": {
                # was activities.activities_page, the logged-in user's
                # activity index, not a demo
                "demo": app.url_for("main.demo_page"),
                "authorize": app.url_for("auth.authorize", state=request.path),
            },
        },
    }
    log.debug(params)
    html = request.ctx.render_template("splash-page.html", **params)
    return Response.html(html)


def target_info(target_user, viewer, is_admin: bool):
    """
    What the map page may say about whose map it is. A map its owner has not
    shared is refused by /activities, and their name and photo are Strava data
    too, so for anyone else the page carries only the id, which is in the URL
    already.
    """
    info = relevant_info(target_user)
    if (
        info
        and not Users.is_sharing(target_user)
        and not is_admin
        and not (viewer and viewer[U.ID] == target_user[U.ID])
    ):
        return {"id": target_user[U.ID], "private": True}
    return info


def relevant_info(user):
    if not user:
        return None

    # The profile tab shows the user's full name, so send both parts. This
    # used to be f"{user[U.FIRSTNAME]}" alone, which is why the tab could not
    # render a surname whatever the frontend did.
    name = " ".join(
        part for part in (user.get(U.FIRSTNAME), user.get(U.LASTNAME)) if part
    )

    return {
        "id": user[U.ID],
        "name": name,
        # .get: a record without a photo, or imported without one, 500ed here
        "profile": user.get(U.PROFILE),
        "private": user.get(U.PRIVATE, True),
    }


# *** Main user/global activities page
@bp.get("/<target_user_id:int>")
@session_cookie(get=True, set=True, flashes=True)
async def user_page(request: Request, target_user_id=None):
    app = request.app
    target_user = await Users.get(target_user_id)
    if target_user_id and not target_user:
        # As the 2020 app did: say so on the splash page rather than serve a
        # bare error. These are old bookmarks and shared links, whose athlete
        # triage has since retired, and the splash page is where they can
        # sign in again and get their map back.
        #
        # Recorded, because the redirect leaves nothing else behind: how often
        # these arrive says how much of the old audience is still out there,
        # and one athlete's id turning up repeatedly is someone trying to get
        # back in. History.recent(kind="request") keeps them for a month;
        # Heroku's log buffer holds minutes.
        log.info("link to unregistered athlete %s", target_user_id)
        History.log_request(
            request,
            f"link to unregistered athlete {target_user_id}",
            athlete=target_user_id,
        )
        request.ctx.flash(
            f"Strava athlete {target_user_id} is not registered with Heatflask"
        )
        return Response.redirect(app.url_for("main.splash_page"))

    params = {
        # These will be imbedded in the served html as text
        "APP_NAME": APP_BASE_NAME,
        "runtime_json": {
            # These will be available to the client as a JSON string
            # at non-visible element "#runtime_json"
            "APP_VERSION": APP_VERSION,
            "CURRENT_USER": relevant_info(request.ctx.current_user),
            "TARGET_USER": target_info(
                target_user, request.ctx.current_user, request.ctx.is_admin
            ),
            "ADMIN": request.ctx.is_admin,
            "OFFLINE": OFFLINE,
            "URLS": {
                "login": app.url_for("auth.authorize"),
                "query": app.url_for("activities.query"),
                "index": app.url_for("activities.activities_page"),
                "visibility": app.url_for("main.visibility", setting=""),
                "delete": app.url_for("main.delete"),
                "logout": app.url_for("auth.logout"),
                # The user listing; admin only, and the route checks again
                "admin": app.url_for("users.directory"),
                # The internal log, also admin-only and checked again there
                "history": app.url_for("history.page"),
            },
        },
    }
    html = request.ctx.render_template("main-page.html", **params)
    return Response.html(html)


@bp.get("/demo")
async def demo_page(request: Request):
    # As on master: the admin's last 60 activities
    return Response.redirect(
        request.app.url_for("main.user_page", target_user_id=Users.ADMIN[0], limit=60)
    )


@bp.get("/test")
async def test(request: Request):
    raise SanicException("get outta here", status_code=403, quiet=True)


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
                    "sorry, you are not authorized to do this",
                    status_code=401,
                    quiet=True,
                )
            elif not request.ctx.current_user:
                raise SanicException("Who are you?", status_code=400, quiet=True)

            target_user = (
                await Users.get(target_user_id)
                if target_user_id
                else request.ctx.current_user
            )
            if not target_user:
                raise SanicException(
                    f"User {target_user_id} not found.", status_code=404, quiet=True
                )

            return await f(request, target_user, *args, **kwargs)

        return decorated_function

    return decorator(func)


# POST, like /delete: these change data, and a GET would let any page on the web
# change it for a logged-in visitor with nothing more than a link, since the
# SameSite=Lax session cookie is still sent on top-level cross-site GETs
@bp.post(r"/visibility/<setting:(on|off|^$)>")
@session_cookie(get=True)
@self_or_admin
async def visibility(request: Request, target_user, setting=None):
    if setting is not None:
        private = False if setting == "on" else True
        target_user = await Users.add_or_update(
            **{U.ID: target_user[U.ID], "private": private}
        )
    return Response.json(not target_user[U.PRIVATE])


@bp.post("/delete")
@session_cookie(get=True, set=True, flashes=True)
@self_or_admin
async def delete(request: Request, target_user):
    uid = target_user[U.ID]
    await Index.delete_user_entries(**{U.ID: uid})
    # The confirmation the user clicked through says this revokes our access to
    # their Strava data, and it was called with deauthenticate=False
    await Users.delete(uid, deauthenticate=True)
    request.ctx.flash(f"Successfully deleted user {uid}")
    return Response.redirect(request.app.url_for("auth.logout"))


@bp.get("/docs/backend")
async def serve_backend_docs(request):
    return Response.redirect(
        request.app.url_for("static", name="bdocs", filename="index.html")
    )


@bp.get("/docs/frontend")
async def serve_frontend_docs(request):
    return Response.redirect(
        request.app.url_for("static", name="fdocs", filename="index.html")
    )
