# Updates come from Strava Webhook callbacks

from logging import getLogger
import datetime
import types
from typing import Any, AsyncGenerator

from . import DataAPIs
from . import Strava
from . import Users
from . import Index
from . import Streams

log = getLogger(__name__)
log.propagate = True

COLLECTION_NAME = "updates_v0"

# Maximum size of updates history (for capped MongoDB collection)
MAX_UPDATES_BYTES = 1 * 1024 * 1024

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(
            COLLECTION_NAME, capped_size=MAX_UPDATES_BYTES
        )
    return myBox.collection


async def record(update: Strava.WebhookUpdate) -> None:
    """
    Keep a copy of the delivery in the capped updates collection.

    That collection is the event log the admin events page reads, and the
    only place a dropped or duplicated delivery can be diagnosed from. Being
    capped, it keeps the most recent MAX_UPDATES_BYTES worth and discards
    the oldest.
    """
    # a copy: insert_one adds an _id to the dict it is given
    doc = {**update, "ts": datetime.datetime.now(datetime.timezone.utc)}
    try:
        col = await get_collection()
        await col.insert_one(doc)
    except Exception:
        log.exception("could not record update %s", update)


async def handle_update_callback(update: Strava.WebhookUpdate) -> None:
    """
    Act on one webhook delivery from Strava.

    The route runs this as a background task: Strava wants a 2xx within two
    seconds and retries otherwise, so it answers first and works after.

    This module used to hold a second, unused copy of this logic that could
    not have worked: it never awaited Users.get, insert_one or import_one, and
    referenced `aid` on "create" before assigning it. Meanwhile the route in
    webserver/bp/updates.py did the real work inline, without recording
    anything. Now the route calls this, and there is one version.
    """
    await record(update)

    if update.get("object_type") != "activity":
        # An athlete update with {"authorized": "false"} is a deauthorization.
        # Neither master nor this branch has ever acted on those.
        log.info("unhandled %s update: %s", update.get("object_type"), update)
        return

    user_id = update["owner_id"]
    activity_id = update["object_id"]
    aspect_type = update["aspect_type"]

    user = await Users.get(user_id)

    # Only users who have an index. Anyone else gets theirs built in full,
    # including this activity, the next time they visit.
    if not (user and await Index.has_user_entries(**user)):
        return

    if aspect_type == "create":
        await Index.import_one(activity_id, **user)

    elif aspect_type == "update":
        await Index.update_one(activity_id, **update.get("updates", {}))

    elif aspect_type == "delete":
        await Index.delete_one(activity_id)
        # and its track, which would otherwise sit in the cache until it expired
        await Streams.delete([activity_id])

    log.debug("webhook: user %s %s activity %s", user_id, aspect_type, activity_id)


async def recent(limit: int = 100) -> AsyncGenerator[dict[str, Any], None]:
    """The most recent deliveries, newest first, for the admin events page"""
    col = await get_collection()
    cursor = col.find(sort=[("$natural", -1)], limit=limit)
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        yield doc
