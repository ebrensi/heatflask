"""
Defines all the /update/* webserver endpoints for accessing
Users data store
"""

import sanic.response as Response
import sanic

from logging import getLogger
from ... import Users
from ... import Strava
from ... import Index

log = getLogger(__name__)

bp1 = sanic.Blueprint("updates", url_prefix="/")


@bp1.get("/")
async def get_callback(request):
    if request.args.get("hub.challenge"):
        return Response.json(Strava.subscription_verification(request.args))
    else:
        return Response.redirect(request.app.url_for("subscription.updates_page"))


@bp1.post("/")
async def post_callback(request):
    update = request.json()
    event_time = update["event_time"]
    subscription_id = update["subscription_id"]
    aspect_type = update["aspect_type"]

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


bp2 = sanic.Blueprint("subscription", url_prefix="/subscription")

# Stuff for subscription to Strava webhooks
@bp2.get("/create")
async def create_subscription(request):
    return Response.text("work in progress")
    # await Strava.create_subscription(admin_session, callback_url)
    # return Response.json(Webhooks.create(url_for("webhook_callback", _external=True)))


@bp2.get("/list")
async def list_subscriptions(request):
    return Response.text("work in progress")
    # return Response.json({"subscriptions": Webhooks.list()})


@bp2.get("/delete")
async def delete_subscription(request):
    return Response.text("work in progress")
    # result = Webhooks.delete(
    #     subscription_id=request.args.get("id"),
    #     delete_collection=request.args.get("reset"),
    # )
    # return Response.json(result)


@bp2.get("/updates")
async def updates_page(request):
    return Response.text("work in progress")
    # return render_template(
    #     "webhooks.html",
    #     events=list(Webhooks.iter_updates(int(request.args.get("n", 100)))),
    #     )


bp = sanic.Blueprint.group(bp1, bp2, url_prefix="/updates")
