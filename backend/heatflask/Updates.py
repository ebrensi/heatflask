# Updates come from Strava Webhook callbacks

from logging import getLogger
import datetime
import time
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


# Our webhook subscription's id, looked up from Strava and kept
subscriptionBox = types.SimpleNamespace(id=None, looked_up_at=0.0)
SUBSCRIPTION_LOOKUP_INTERVAL = 600


async def subscription_id(recheck: bool = False) -> int | None:
    """
    The id of our webhook subscription, or None if it cannot be found out.

    A delivery naming any other subscription is not from Strava. The id is not
    secret enough to authenticate anything by itself -- the refetch in
    Index.refresh_one is what keeps forged deliveries from changing data -- but
    checking it stops a stranger from making us spend Strava requests. Until
    the lookup succeeds, deliveries are accepted: dropping real ones because
    Strava was briefly unreachable would be worse.

    `recheck` looks again even though an id is known, as when a delivery names
    another subscription -- which is what happens after the subscription is
    replaced, as moving hosts requires. Either way Strava is asked at most once
    per SUBSCRIPTION_LOOKUP_INTERVAL, so forged deliveries cannot make us ask
    constantly.
    """
    box = subscriptionBox
    now = time.time()
    due = now - box.looked_up_at > SUBSCRIPTION_LOOKUP_INTERVAL
    if (box.id is None or recheck) and due:
        box.looked_up_at = now
        try:
            subs = await Strava.AsyncClient("admin").view_subscription(
                raise_exception=True
            )
            box.id = subs[0]["id"] if subs else None
        except Exception as e:
            log.warning("could not look up our webhook subscription: %r", e)
    return box.id


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

    Strava does not sign deliveries, so nothing in one is taken as fact:
    it must name our subscription, and then it only tells us which activity
    to look at again. See Index.refresh_one.
    """
    await record(update)

    ours = await subscription_id()
    if ours is not None and update.get("subscription_id") != ours:
        ours = await subscription_id(recheck=True)
    if ours is not None and update.get("subscription_id") != ours:
        log.warning(
            "update for subscription %s, not ours (%s)",
            update.get("subscription_id"),
            ours,
        )
        return

    if update.get("object_type") == "athlete" and str(
        update.get("updates", {}).get("authorized")
    ).lower() == "false":
        # The athlete revoked Heatflask in their Strava settings. Our token is
        # dead, so there is nothing to deauthorize; just forget them.
        uid = update["object_id"]
        if await Users.get(uid):
            await Index.delete_user_entries(**{Users.U.ID: uid})
            await Users.delete(uid, deauthenticate=False)
        return

    if update.get("object_type") != "activity":
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

    # Create, update and delete all come down to the same thing: find out from
    # Strava what the activity is now.
    outcome = await Index.refresh_one(activity_id, **user)
    if outcome == "removed":
        # and its track, which would otherwise sit in the cache until it expired
        await Streams.delete([activity_id])

    log.debug(
        "webhook: user %s %s activity %s: %s",
        user_id,
        aspect_type,
        activity_id,
        outcome,
    )


async def recent(limit: int = 100) -> AsyncGenerator[dict[str, Any], None]:
    """The most recent deliveries, newest first, for the admin events page"""
    col = await get_collection()
    cursor = col.find(sort=[("$natural", -1)], limit=limit)
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        yield doc
