import sanic.response as Response
import sanic

from logging import getLogger
from ... import Users

from ..config import APP_NAME
from .auth import authorize

log = getLogger(__name__)

bp = sanic.Blueprint("users", url_prefix="/users")

# **** Users ******
@bp.get("/query")
async def query(request):
    output = request.args.get("output", "json")
    admin = request.args.get("admin")
    if admin:
        cu = request.ctx.current_user
        if (not cu) or (not Users.is_admin(cu["_id"])):
            return Response.json({})

    cursor = Users.dump(admin=admin, output=output)
    dump = [a async for a in cursor]
    return Response.json(dump)


@bp.get("/directory")
async def directory(request):
    admin = request.args.get("admin")
    if admin:
        cu = request.ctx.current_user
        if not Users.is_admin(cu["_id"]):
            return Response.redirect(authorize, state=request.url)

    kwargs = {"admin": 1} if admin else {}
    query_url = request.url_for("users.query", output="csv", **kwargs)
    params = {"app_name": APP_NAME, "admin": 1 if admin else 0, "url": query_url}
    html = request.ctx.render_template("directory-page.html", **params)
    return Response.html(html)
