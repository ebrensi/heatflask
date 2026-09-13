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

callbacks = sanic.Blueprint("updates", url_prefix="/")


@callbacks.get("/")
async def get_callback(request):
    """The subscription handshake: Strava GETs this with a challenge to echo."""
    if request.args.get("hub.challenge"):
        # request.args maps each key to a *list* of values; the verifier
        # compares plain strings
        args = {k: v[0] for k, v in request.args.items()}
        verification = Strava.subscription_verification(args)
        if verification is None:
            raise SanicException("bad verify token", status_code=403)
        return Response.json(verification)

    return Response.redirect(request.app.url_for("subscription.updates_page"))


@callbacks.post("/")
async def post_callback(request):
    # `request.json` is a property in Sanic, not a method. This was
    # `request.json()`, which calls the already-parsed dict and raises
    # TypeError -- so every delivery failed before reading a single field.
    # master is fine here: it is Flask, where request.get_json() is a call.
    update = request.json

    # These two were unpacked into locals and never used (flake8 F841). They
    # are worth having in the log, which is the only place a dropped or
    # duplicated delivery can be diagnosed from.
    log.info(
        "Strava update: subscription=%s event_time=%s %s",
        update.get("subscription_id"),
        update.get("event_time"),
        update,
    )

    if update.get("object_type") == "activity":
        aspect_type = update.get("aspect_type")
        activity_id = update["object_id"]
        user_id = update["owner_id"]

        user = await Users.get(user_id)
        # `await`: has_user_entries is a coroutine function, so without it the
        # condition was a coroutine object -- always truthy, never awaited,
        # and an "un-awaited coroutine" warning each time.
        if user and await Index.has_user_entries(**user):
            if aspect_type == "create":
                request.app.add_task(Index.import_one(activity_id, **user))

            elif aspect_type == "delete":
                request.app.add_task(Index.delete_one(activity_id))

            elif aspect_type == "update":
                request.app.add_task(
                    Index.update_one(activity_id, **update.get("updates", {}))
                )

    elif update.get("object_type") == "athlete":
        log.info("unhandled athlete update: %s", update)

    # Strava wants a 2xx within two seconds and retries otherwise, so the work
    # is queued rather than awaited. delete and update were awaited inline.
    return Response.text("success")


#
# Stuff for subscription to Strava webhooks
#
subscription = sanic.Blueprint("subscription", url_prefix="/subscription")


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


@subscription.get("/create")
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


@subscription.get("/view")
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


@subscription.get("/delete")
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


@subscription.get("/events")
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


bp = sanic.Blueprint.group(callbacks, subscription, url_prefix="/updates")
