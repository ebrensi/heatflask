# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
Defines all the /users/* webserver endpoints for accessing
Users data store.

Admin only. There used to be a public directory here as well, listing the
athletes who had made their profile public, and the splash page sent people
to it. Sharing a map no longer means being listed anywhere, so the listing
is gone and what is left is the operator's view of who is registered.
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
    if not request.ctx.is_admin:
        return Response.json({})

    output = request.args.get("output", "json")
    cursor = Users.dump(output=output)
    dump = [a async for a in cursor]
    return Response.json(dump)


@bp.get("/")
@session_cookie(get=True, flashes=True)
async def directory(request):
    if not request.ctx.is_admin:
        # Not an admin, so send them to log in and then back here. This used
        # to pass the view function itself, and `state` straight to
        # redirect(), which has no such argument, so it raised a 500.
        state = request.path + (
            f"?{request.query_string}" if request.query_string else ""
        )
        return Response.redirect(request.app.url_for("auth.authorize", state=state))

    query_url = request.url_for("users.query", output="csv")

    # users-page.ts reads {url} out of the #runtime_json element, the same way
    # the activities page does. This used to pass it as a separate template
    # parameter, which left the template's ${runtime_json} unsubstituted --
    # render_template uses safe_substitute, so a missing key is emitted
    # literally rather than raising. The page then called
    # JSON.parse("${runtime_json}") at module scope, outside its own
    # try/catch, and died before it ever ran.
    params = {
        "app_name": APP_BASE_NAME,
        "runtime_json": {"url": query_url},
    }
    html = request.ctx.render_template("users-page.html", **params)
    return Response.html(html)
