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
    params = {"app_name": APP_NAME, "admin": 1 if admin else 0, "url": query_url}
    html = request.ctx.render_template("users-page.html", **params)
    return Response.html(html)


@bp.route("/visibility", methods=["GET", "PUT"])
@session_cookie(get=True)
async def visibility(request):
    target_user_id = request.args.get("user")

    if not (request.ctx.is_admin and target_user_id):
        target_user_id = request.ctx.user[Users.ID] if request.ctx.user else None

    if request.method == "GET":
        user = await Users.get(target_user_id)
        return Response.json(user[Users.PRIVATE] if user else None)
    else:
        value = request.args.get("value")
        if value is not None:
            await Users.add_or_update(**{Users.ID: target_user_id, "private": value})
        return Response.json(value)


@bp.get("/delete")
@session_cookie(get=True, set=True)
async def delete(request):
    target_user_id = request.args.get("user")
    if not (request.ctx.is_admin and target_user_id):
        target_user_id = request.ctx.user[Users.ID] if request.ctx.user else None
    await Users.delete(target_user_id, deauthenticate=True)
    return Response.redirect(request.app.url_for("auth.logout"))


@bp.get("/migrate")
@session_cookie(get=True, flashes=True)
async def migrate(request):
    if not request.ctx.is_admin:
        return Response.text("Nope, sorry. :(")
    await Users.migrate()
    return Response.redirect(request.app.url_for("users.directory", admin=1))


# user pages
