"""
Defines all the /users/* webserver endpoints for accessing
Users data store
"""

import sanic.response as Response
from sanic.exceptions import SanicException
import sanic

from logging import getLogger
from ... import Users

from ..config import APP_BASE_NAME
from ..sessions import session_cookie

log = getLogger(__name__)
log.setLevel("INFO")
log.propagate = True

bp = sanic.Blueprint("users", url_prefix="/users")


# We have the convention that POST is for data query
# and GET is for web page
@bp.post("/")
@session_cookie(get=True, set=True)
async def query(request):
    output = request.args.get("output", "json")
    admin = request.args.get("admin")
    if admin and (not request.ctx.is_admin):
        return Response.json({})

    cursor = Users.dump(admin=admin, output=output)
    dump = [a async for a in cursor]
    return Response.json(dump)


@bp.get("/")
@session_cookie(get=True, flashes=True)
async def directory(request):
    admin = request.args.get("admin")
    if admin and (not request.ctx.is_admin):
        # This passed the view function itself, and `state` straight to
        # redirect(), which has no such argument, so it raised a 500. Send them
        # to log in, then back here.
        state = request.path + (
            f"?{request.query_string}" if request.query_string else ""
        )
        return Response.redirect(request.app.url_for("auth.authorize", state=state))

    kwargs = {"admin": 1} if admin else {}
    query_url = request.url_for("users.query", output="csv", **kwargs)

    # users-page.ts reads {admin, url} out of the #runtime_json element, the
    # same way the activities page does. This used to pass `admin` and `url`
    # as separate template parameters, which left the template's
    # ${runtime_json} unsubstituted -- render_template uses safe_substitute,
    # so a missing key is emitted literally rather than raising. The page then
    # called JSON.parse("${runtime_json}") at module scope, outside its own
    # try/catch, and died before it ever ran.
    params = {
        "app_name": APP_BASE_NAME,
        "runtime_json": {"admin": bool(admin), "url": query_url},
    }
    html = request.ctx.render_template("users-page.html", **params)
    return Response.html(html)
