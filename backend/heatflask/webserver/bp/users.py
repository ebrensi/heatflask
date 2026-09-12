"""
Defines all the /users/* webserver endpoints for accessing
Users data store
"""
import sanic.response as Response
from sanic.exceptions import SanicException
import sanic

from logging import getLogger
from ... import Users

from ..config import APP_NAME
from ..sessions import session_cookie
from .auth import authorize

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
        return Response.redirect(authorize, state=request.url)

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
        "app_name": APP_NAME,
        "runtime_json": {"admin": bool(admin), "url": query_url},
    }
    html = request.ctx.render_template("users-page.html", **params)
    return Response.html(html)


@bp.get("/migrate")
@session_cookie(get=True, flashes=True)
async def migrate(request):
    if not request.ctx.is_admin:
        raise SanicException("sorry", status_code=401)

    await Users.migrate()
    return Response.redirect(request.app.url_for("users.directory", admin=1))
