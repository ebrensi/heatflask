"""
Defines all the /update/* webserver endpoints for accessing
Users data store
"""

import sanic.response as Response
from sanic.exceptions import SanicException
import sanic
from inspect import isawaitable
from functools import wraps
from aiohttp import ClientResponseError

from logging import getLogger
from ... import Users
from ... import Strava
from ... import Index

from ..sessions import session_cookie


log = getLogger(__name__)

bp1 = sanic.Blueprint("updates", url_prefix="/")


@bp1.get("/")
async def get_callback(request):
    if request.args.get("hub.challenge"):
        return Response.json(Strava.subscription_verification(request.args))
    else:
        return Response.redirect(request.app.url_for("updates.updates_page"))


@bp1.post("/")
async def post_callback(request):
    update = request.json()
    event_time = update["event_time"]
    subscription_id = update["subscription_id"]
    aspect_type = update["aspect_type"]

    log.info("Strava update: %s", update)

    if update["object_type"] == "activity":
        activity_id = update["object_id"]
        user_id = update["owner_id"]

        user = await Users.get(user_id)
        if user and Index.has_user_entries(**user):
            if aspect_type == "create":
                request.app.add_task(Index.import_one(activity_id, **user))

            elif aspect_type == "delete":
                await Index.delete_one(activity_id)

            elif aspect_type == "update":
                await Index.update_one(activity_id, **update["updates"])

    elif update["object_type"] == "athlete":
        log.info("unhandled user update: %s", update)
    return Response.text("success")


@bp1.get("/events")
@session_cookie(get=True)
async def updates_page(request):
    if not request.ctx.is_admin:
        raise SanicException("sorry", status_code=401)
    return Response.text("Updates table will be here")
    # return render_template(
    #     "webhooks.html",
    #     events=list(Webhooks.iter_updates(int(request.args.get("n", 100)))),
    #     )


#
# Stuff for subscription to Strava webhooks
#
bp2 = sanic.Blueprint("subscription", url_prefix="/subscription")


def admin_strava_session(func):
    def decorator(f):
        @wraps(f)
        async def decorated_function(request, *args, **kwargs):
            if not request.ctx.is_admin:
                raise SanicException("sorry", status_code=401)
            request.ctx.strava_client = Strava.AsyncClient("admin")
            response = f(request, *args, **kwargs)
            if isawaitable(response):
                response = await response
            return response

        return decorated_function

    return decorator(func)


@bp2.get("/create")
@session_cookie(get=True)
@admin_strava_session
async def create_subscription(request):
    try:
        response_json = await request.ctx.strava_client.create_subscription(
            request.url_for("updates.get_callback"), raise_exception=True
        )
    except ClientResponseError as e:
        raise SanicException(e.message, status_code=e.status)
    return Response.json(response_json)


@bp2.get("/view")
@session_cookie(get=True)
@admin_strava_session
async def view_subscription(request):
    try:
        response_json = await request.ctx.strava_client.view_subscription(
            raise_exception=True
        )
    except ClientResponseError as e:
        raise SanicException(e.message, status_code=e.status)
    return Response.json(response_json)


@bp2.get("/delete")
@session_cookie(get=True)
@admin_strava_session
async def delete_subscription(request):
    s_id = request.args.get("id")
    try:
        response_json = await request.ctx.strava_client.delete_subscription(
            raise_exception=True, subscription_id=s_id
        )
    except ClientResponseError as e:
        raise SanicException(e.message, status_code=e.status)

    return Response.json(response_json)


bp = sanic.Blueprint.group(bp1, bp2, url_prefix="/updates")
