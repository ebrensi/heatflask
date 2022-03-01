"""
Defines all the /users/* webserver endpoints for accessing
Users data store
"""

import sanic.response as Response
import sanic

from logging import getLogger
from ... import Users

from ..config import APP_NAME
from ..sessions import session_cookie
from .auth import authorize

log = getLogger(__name__)

bp = sanic.Blueprint("users", url_prefix="/users")


@bp.get("/query")
@session_cookie(get=True, set=True)
async def query(request):
    output = request.args.get("output", "json")
    admin = request.args.get("admin")
    if admin and (not request.ctx.is_admin):
        return Response.json({})

    cursor = Users.dump(admin=admin, output=output)
    dump = [a async for a in cursor]
    return Response.json(dump)


@bp.get("/directory")
@session_cookie(get=True, flashes=True)
async def directory(request):
    admin = request.args.get("admin")
    if admin and (not request.ctx.is_admin):
        return Response.redirect(authorize, state=request.url)

    kwargs = {"admin": 1} if admin else {}
    query_url = request.url_for("users.query", output="csv", **kwargs)
    params = {"app_name": APP_NAME, "admin": 1 if admin else 0, "url": query_url}
    html = request.ctx.render_template("directory-page.html", **params)
    return Response.html(html)


@bp.get("/migrate")
@session_cookie(get=True, flashes=True)
async def migrate(request):
    if not request.ctx.is_admin:
        return Response.text("Nope, sorry. :(")
    # bp.add_task(Users.migrate())
    log.info("Migrating user database")
    request.ctx.flash("Migration task queued")
    return Response.redirect(request.app.url_for("splash"))
