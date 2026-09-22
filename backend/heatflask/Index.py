# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
Functions and constants pertaining to the Index datastore.  Each record
represents the summary of a user activity.
"""

import os
import polyline
import numpy as np
from logging import getLogger
import datetime
import time
import asyncio
import types
from pymongo import DESCENDING, ReplaceOne
from aiohttp import ClientResponseError
from typing import Iterable, TypedDict

from . import DataAPIs
from . import History
from . import Strava
from . import Utility
from . import Users
from .Users import UserField as U

log = getLogger(__name__)
log.propagate = True
log.setLevel("INFO")

COLLECTION_NAME = "index_v0"

SECS_IN_HOUR = 60 * 60
SECS_IN_DAY = 24 * SECS_IN_HOUR

# How long we store a user's Index
TTL = int(os.environ.get("INDEX_TTL", 20)) * SECS_IN_DAY

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(COLLECTION_NAME)
    return myBox.collection


LatLng = tuple[float, float]


class LLBounds(TypedDict):
    SW: LatLng
    NE: LatLng


def polyline_bounds(poly: str) -> LLBounds | None:
    try:
        latlngs = np.array(polyline.decode(poly), dtype=np.float32)
    except Exception:
        return None

    lats = latlngs[:, 0]
    lngs = latlngs[:, 1]

    return {
        "SW": (float(lats.min()), float(lngs.min())),
        "NE": (float(lats.max()), float(lngs.max())),
    }


def overlaps(b1: LLBounds, b2: LLBounds) -> bool:
    b1_left, b1_bottom = b1["SW"]
    b1_right, b1_top = b1["NE"]
    b2_left, b2_bottom = b2["SW"]
    b2_right, b2_top = b2["NE"]
    return (
        (b1_left < b2_right)
        and (b1_right > b2_left)
        and (b1_top > b2_bottom)
        and (b1_bottom < b2_top)
    )
    """
    {
        f"{F.LATLNG_BOUNDS}.NE.0": {"$gt": b1_left},
        f"{F.LATLNG_BOUNDS}.SW.0": {"$lt": b1_right},
        f"{F.LATLNG_BOUNDS}.SW.1": {"$lt": b1_top},
        f"{F.LATLNG_BOUNDS}.NE.1": {"$gt": b1_bottom}
    }
    """


class ActivitySummaryFields:
    ACTIVITY_ID = "_id"
    USER_ID = "U"
    N_ATHLETES = "#a"
    N_PHOTOS = "#p"
    ELEVATION_GAIN = "+"
    UTC_START_TIME = "s"
    UTC_LOCAL_OFFSET = "o"
    DISTANCE_METERS = "D"
    TIME_SECONDS = "T"
    MOVING_SECONDS = "M"
    LATLNG_BOUNDS = "B"
    FLAG_COMMUTE = "c"
    FLAG_PRIVATE = "p"
    ACTIVITY_NAME = "N"
    ACTIVITY_TYPE = "t"
    # A string, not an index into a list the way ACTIVITY_TYPE is: Strava adds
    # sport types often enough that a positional list would go stale. Entries
    # made before 2026-09-21 have none; see has_legacy_entries.
    SPORT_TYPE = "st"
    VISIBILITY = "v"


F = ActivitySummaryFields


# see https://developers.strava.com/docs/reference/#api-models-SummaryActivity
def mongo_doc(
    # From Strava SummaryActivity record
    id=None,
    athlete=None,
    name=None,
    distance=None,
    moving_time=None,
    elapsed_time=None,
    total_elevation_gain=None,
    type=None,
    sport_type=None,
    start_date=None,
    utc_offset=None,
    athlete_count=None,
    total_photo_count=None,
    map=None,
    commute=None,
    private=None,
    visibility=None,
    # my additions
    _id=None,
    title=None,
    update=False,
    **and_more,
):
    if not (update or (start_date and map and map.get("summary_polyline"))):
        return

    utc_start_time = int(Utility.to_datetime(start_date).timestamp())
    return Utility.cleandict(
        {
            F.ACTIVITY_ID: int(_id or id),
            F.USER_ID: int(athlete["id"]),
            F.ACTIVITY_NAME: name or title,
            F.DISTANCE_METERS: distance,
            F.TIME_SECONDS: elapsed_time,
            F.MOVING_SECONDS: moving_time,
            F.ELEVATION_GAIN: total_elevation_gain,
            F.ACTIVITY_TYPE: Strava.ATYPES_LOOKUP.get(type, type),
            # never left out: has_legacy_entries takes a missing one to mean
            # the index predates the field, and would rebuild it every query
            F.SPORT_TYPE: sport_type or type or "Workout",
            F.UTC_START_TIME: utc_start_time,
            F.UTC_LOCAL_OFFSET: utc_offset,
            F.N_ATHLETES: athlete_count,
            F.N_PHOTOS: total_photo_count,
            F.VISIBILITY: visibility,
            F.FLAG_COMMUTE: commute,
            F.FLAG_PRIVATE: private,
            F.LATLNG_BOUNDS: polyline_bounds(map["summary_polyline"]),
        }
    )


# # **************************************
# Import-progress flags used to be Redis keys with a native TTL. They now live
# in a Mongo collection. Mongo's TTL monitor only sweeps once a minute, so a
# doc can outlive its TTL by up to ~60s; the index is therefore garbage
# collection only, and expiry is enforced by comparing each doc's own `ttl`.
IMPORT_FLAG_COLLECTION = "import_flags_v0"
IMPORT_FLAG_TTL = 20  # seconds
IMPORT_ERROR_TTL = 5

flagBox = types.SimpleNamespace(collection=None)


async def get_flag_collection():
    if flagBox.collection is None:
        flagBox.collection = await DataAPIs.init_collection(
            IMPORT_FLAG_COLLECTION, ttl=IMPORT_FLAG_TTL
        )
    return flagBox.collection


async def _set_flag(user_id: int, val: str, ttl: int):
    flags = await get_flag_collection()
    await flags.replace_one(
        {"_id": int(user_id)},
        {
            "_id": int(user_id),
            "msg": val,
            "ttl": ttl,
            "ts": datetime.datetime.now(datetime.timezone.utc),
        },
        upsert=True,
    )


async def set_import_flag(user_id: int, val: str):
    await _set_flag(user_id, val, IMPORT_FLAG_TTL)
    log.debug(f"{user_id} import flag set to '%s'", val)


async def set_import_error(user_id: int, e):
    val = f"Strava error {e.status}: {e.message}"
    await _set_flag(user_id, val, IMPORT_ERROR_TTL)


async def clear_import_flag(user_id: int):
    flags = await get_flag_collection()
    await flags.delete_one({"_id": int(user_id)})
    log.debug(f"{user_id} import flag unset")


async def check_import_progress(user_id: int):
    flags = await get_flag_collection()
    doc = await flags.find_one({"_id": int(user_id)})
    if not doc:
        return None
    age = datetime.datetime.now(datetime.timezone.utc) - doc["ts"]
    if age.total_seconds() > doc.get("ttl", IMPORT_FLAG_TTL):
        return None
    return doc["msg"]


# # **************************************
async def fake_import(uid=None):
    log.info("Starting fake import for user %s", uid)
    await set_import_flag(uid, "Building index...")
    for i in range(10):
        await asyncio.sleep(1)
        log.info("fake import %d", i)
        await set_import_flag(uid, f"Building index...{i}")
    log.info("Finished fake import")
    await clear_import_flag(uid)


async def import_index_progress(user_id: int, poll_delay=0.5):
    last_msg = None
    msg = 1
    while msg:
        msg = await check_import_progress(user_id)
        if msg != last_msg:
            yield msg
            last_msg = msg
        await asyncio.sleep(poll_delay)


async def import_user_entries(**user):
    uid = int(user[U.ID])
    if await check_import_progress(uid):
        log.info(f"Already importing entries for user {uid}")
        return

    t0 = time.perf_counter()
    cost = History.ReadCost()
    await set_import_flag(uid, "Building index...")

    strava = Users.strava_client(user)
    await strava.update_access_token()
    now = datetime.datetime.now(datetime.timezone.utc)

    docs = []

    async def keep_flag_alive():
        """
        Refresh the import flag while the import runs.

        The flag expires after IMPORT_FLAG_TTL seconds, and was refreshed only
        once per page of activities. A slow page, and certainly a wait for
        Strava's rate limit to reset, let it lapse: the query waiting on the
        import then gave up and served an empty index, and the next query
        started a second import alongside the first.
        """
        while True:
            await set_import_flag(uid, f"Building index...{len(docs)}")
            await asyncio.sleep(IMPORT_FLAG_TTL / 4)

    heartbeat = asyncio.create_task(keep_flag_alive())
    error = None
    try:
        async for A in strava.get_all_activities():
            if A is not None:
                docs.append(mongo_doc(**A, ts=now))
    except (ClientResponseError, Strava.RateLimitExceeded) as e:
        error = e
    finally:
        # Wait for it to stop, so a refresh already under way cannot land on
        # top of the error flag or the cleared flag that follows
        heartbeat.cancel()
        await asyncio.gather(heartbeat, return_exceptions=True)

    if error:
        log.info(
            "%d Index import aborted due to Strava error %d: %s",
            uid,
            error.status,
            error.message,
        )
        History.record_soon(
            History.Kind.ERROR,
            f"index import aborted: Strava {error.status} {error.message}",
            user=uid,
            status=error.status,
        )
        await set_import_error(uid, error)
        return

    docs = list(filter(None, docs))
    t1 = time.perf_counter()
    fetch_time = (t1 - t0) * 1000

    if not docs:
        return

    index = await get_collection()
    await delete_user_entries(**user)
    try:
        insert_result = await index.insert_many(docs, ordered=False)
    except Exception:
        log.exception("Index insert error")
        log.error(docs)
        return
    insert_time = (time.perf_counter() - t1) * 1000
    count = len(insert_result.inserted_ids)

    History.record_soon(
        History.Kind.IMPORT,
        f"imported index of {count} activities ({cost.reads} Strava reads)",
        user=uid,
        activities=count,
        reads=cost.reads,
        ms=round(fetch_time),
    )
    await clear_import_flag(uid)
    log.debug(
        "fetched %s entries in %dms, insert_many %dms", count, fetch_time, insert_time
    )


"""
How often an existing index is topped up from Strava, in seconds. A check
costs one API request and normally returns nothing, so this only needs to be
short enough that "I just finished a ride" works after a reload.
"""
UPDATE_INTERVAL = 300
UPDATE_FLAG_TTL = UPDATE_INTERVAL


async def due_for_update(user_id: int) -> bool:
    """
    True at most once per UPDATE_INTERVAL, and it claims the slot when it says
    so -- reloading the page in a loop must not mean a Strava request per load.

    This reuses the import-flag collection, which already has a TTL index, but
    under a separate key so it cannot be mistaken for an import in progress:
    check_import_progress looks up the bare user id.
    """
    flags = await get_flag_collection()
    key = f"update:{int(user_id)}"
    now = datetime.datetime.now(datetime.timezone.utc)

    doc = await flags.find_one({"_id": key})
    if doc:
        age = (now - doc["ts"]).total_seconds()
        if age < UPDATE_INTERVAL:
            return False

    await flags.replace_one(
        {"_id": key},
        {"_id": key, "msg": "index update", "ttl": UPDATE_FLAG_TTL, "ts": now},
        upsert=True,
    )
    return True


async def newest_entry_timestamp(user_id: int) -> int | None:
    """The start time of the user's most recent indexed activity, as an epoch."""
    index = await get_collection()
    doc = await index.find_one(
        {F.USER_ID: int(user_id)},
        {F.UTC_START_TIME: True},
        sort=[(F.UTC_START_TIME, DESCENDING)],
    )
    if not doc:
        return None

    ts = doc.get(F.UTC_START_TIME)
    if isinstance(ts, datetime.datetime):
        return int(ts.timestamp())
    return int(ts) if ts else None


async def update_user_entries(**user) -> int:
    """
    Add activities recorded since the last one we have, and return how many.

    The index is built once, by import_user_entries, and after that only
    Strava's webhooks kept it current -- which means it never updates in local
    development, since Strava cannot reach localhost, and misses anything
    recorded while a webhook was missed or the app was down. An activity you
    finished an hour ago simply would not appear.

    This asks Strava only for what started after the newest activity we
    already hold, which is normally a single request returning nothing.
    """
    uid = int(user[U.ID])

    after = await newest_entry_timestamp(uid)
    if after is None:
        # Nothing indexed yet: that is import_user_entries' job, not this one
        return 0

    strava = Users.strava_client(user)
    await strava.update_access_token()
    now = datetime.datetime.now(datetime.timezone.utc)

    docs = []
    try:
        async for A in strava.get_activities_since(after):
            if A is not None:
                doc = mongo_doc(**A, ts=now)
                if doc:
                    docs.append(doc)
    except Exception:
        # Freshness is a nicety; never fail a query because Strava is unhappy
        log.exception("%d index update failed", uid)
        return 0

    if not docs:
        return 0

    index = await get_collection()
    try:
        # upsert, because `after` is inclusive-ish at the boundary and a
        # webhook may already have delivered some of these
        await index.bulk_write(
            [
                ReplaceOne({F.ACTIVITY_ID: d[F.ACTIVITY_ID]}, d, upsert=True)
                for d in docs
            ],
            ordered=False,
        )
    except Exception:
        log.exception("%d index update insert failed", uid)
        return 0

    log.info("%d index updated with %d new entries", uid, len(docs))
    return len(docs)


async def refresh_one(activity_id: int, **user) -> str:
    """
    Make the index entry for one activity match Strava, whatever it was.

    Webhooks call this for create, update and delete alike. Strava does not
    sign webhook deliveries, so their contents are a hint about which activity
    changed, never a statement of what it now is: applying a delivery's
    {"private": "false"} as sent would let anyone who can POST to the callback
    make a private activity public. So we ask Strava.

    Returns what happened: "imported", "removed" or "unchanged".

      * Strava returns it, with a GPS track: stored as Strava has it now.
      * Strava returns it without one: removed. The index holds only
        activities with a track.
      * 404 or 403: removed. It is deleted, or no longer visible with this
        athlete's token -- either way it should not be shown.
      * Anything else (rate limit, Strava down, a revoked token): unchanged.
        Nothing is known, so nothing is touched.
    """
    client = Users.strava_client(user)
    index = await get_collection()
    try:
        activity = await client.get_activity(activity_id, raise_exception=True)
    except ClientResponseError as e:
        if e.status not in (403, 404):
            log.info("activity %d: Strava error %d, left as is", activity_id, e.status)
            return "unchanged"
        activity = None
    except Exception as e:
        log.info("activity %d: could not fetch (%r), left as is", activity_id, e)
        return "unchanged"

    doc = mongo_doc(**activity) if activity else None
    if not doc:
        await index.delete_one({F.ACTIVITY_ID: activity_id})
        log.debug("%s removed activity %d from index", user[U.ID], activity_id)
        return "removed"

    await index.replace_one({F.ACTIVITY_ID: activity_id}, doc, upsert=True)
    log.debug("%s refreshed activity %d", user[U.ID], activity_id)
    return "imported"


async def delete_one(activity_id: int):
    index = await get_collection()
    return await index.delete_one({F.ACTIVITY_ID: activity_id})


async def delete_user_entries(**user):
    uid = int(user[U.ID])
    index = await get_collection()
    result = await index.delete_many({F.USER_ID: int(uid)})
    log.debug("%d deleted %s entries", uid, result.deleted_count)


async def count_user_entries(**user):
    uid = int(user[U.ID])
    index = await get_collection()
    return await index.count_documents({F.USER_ID: int(uid)})


async def has_legacy_entries(**user) -> bool:
    """
    True if some of this user's index was made before we stored sport_type.
    Such an index is rebuilt whole the next time it is queried: it costs one
    Strava request per 200 activities, once, and a partly-rebuilt index would
    leave the sport filter guessing for the rest.
    """
    index = await get_collection()
    return not not (
        await index.find_one(
            {F.USER_ID: int(user[U.ID]), F.SPORT_TYPE: {"$exists": False}},
            projection={F.ACTIVITY_ID: True},
        )
    )


def sport_type_filter(sport_types: list[str], exclude=False) -> dict:
    """
    Match these sport types, or with `exclude`, every other one.

    Entries without a sport type -- made before it was stored, and not yet
    rebuilt -- have only the coarser ActivityType, and each direction errs
    toward showing them. Included, one is matched by the ActivityType Strava
    files the sport under, so TrailRun brings in all of its Runs. Excluded, it
    goes only if its ActivityType is itself excluded: leaving out TrailRun
    keeps its Runs, and leaving out Run drops them.
    """
    if exclude:
        legacy = set(sport_types)
    else:
        legacy = set(Strava.legacy_type(st) for st in sport_types)
        # and the names themselves: a type ATYPES does not list is stored raw
        legacy |= set(sport_types)
    match = {
        "$or": [
            {F.SPORT_TYPE: {"$in": list(sport_types)}},
            {
                F.SPORT_TYPE: {"$exists": False},
                F.ACTIVITY_TYPE: {
                    "$in": [Strava.ATYPES_LOOKUP.get(t, t) for t in legacy]
                },
            },
        ]
    }
    return {"$nor": [match]} if exclude else match


async def sport_type_counts(privacy: dict | None, user_id: int | None) -> dict:
    """How many activities of each sport type this viewer can see"""
    match: dict = {"$and": [privacy]} if privacy else {}
    if user_id:
        match[F.USER_ID] = int(user_id)
    index = await get_collection()
    cursor = await index.aggregate(
        [
            {"$match": match},
            {
                "$group": {
                    "_id": {"st": f"${F.SPORT_TYPE}", "t": f"${F.ACTIVITY_TYPE}"},
                    "n": {"$sum": 1},
                }
            },
        ]
    )
    counts: dict[str, int] = {}
    async for doc in cursor:
        st, t = doc["_id"].get("st"), doc["_id"].get("t")
        if st is None:
            # a legacy entry: its ActivityType, which is a sport type too
            st = Strava.ATYPES[t] if isinstance(t, int) else t
        if st:
            counts[st] = counts.get(st, 0) + doc["n"]
    return counts


async def has_user_entries(**user):
    uid = int(user[U.ID])
    index = await get_collection()
    return not not (
        await index.find_one({F.USER_ID: int(uid)}, projection={F.ACTIVITY_ID: True})
    )


async def triage(*args):
    now_ts = datetime.datetime.now().timestamp()
    cutoff = now_ts - TTL
    # The users collection, which is where LAST_INDEX_ACCESS lives. This was
    # this module's get_collection() -- the index itself, whose documents have
    # no such field -- so triage found nothing and no index ever expired.
    users = await Users.get_collection()
    cursor = users.find({U.LAST_INDEX_ACCESS: {"$lt": cutoff}}, {U.ID: True})
    stale_ids = [u[U.ID] async for u in cursor]
    tasks = [
        asyncio.create_task(delete_user_entries(**{U.ID: sid})) for sid in stale_ids
    ]
    await asyncio.gather(*tasks)


SORT_SPECS = [(F.UTC_START_TIME, DESCENDING)]


# Strava visibility settings that keep an activity from the public. Followers
# is among them: Heatflask cannot tell who follows whom, so it cannot honour
# "followers only" except by treating it as private.
NON_PUBLIC_VISIBILITY = ["only_me", "followers"]


def visible_to(viewer_id: int | None, sharing: Iterable[int]) -> dict:
    """
    A Mongo filter for the activities this viewer may see: all of their own,
    and the public activities of the athletes in `sharing` -- those who have
    chosen to share their map (Users.sharing_ids). None is an anonymous
    viewer, who sees only those.

    Strava's API Agreement (2.3) lets us show an athlete's data to that athlete
    only, so an activity being public on Strava is not enough by itself: its
    owner has to have opted in here too.

    Public means not flagged private and not restricted by visibility. Missing
    fields count as public, since older index entries may lack visibility.
    """
    shared = {
        F.USER_ID: {"$in": [int(uid) for uid in sharing]},
        F.FLAG_PRIVATE: {"$ne": True},
        F.VISIBILITY: {"$nin": NON_PUBLIC_VISIBILITY},
    }
    if viewer_id is None:
        return shared
    return {"$or": [shared, {F.USER_ID: int(viewer_id)}]}


async def query(
    user_id: int = None,
    activity_ids: list[int] = None,
    exclude_ids: list[int] = None,
    after: int = None,
    before: int = None,
    limit: int = None,
    activity_type: list[str] = None,
    sport_type: list[str] = None,
    exclude_sport_type: list[str] = None,
    commute: bool = None,
    private: bool = None,
    visibility: bool = None,
    overlaps=None,
    #
    update_index_access=True,
    privacy: dict | None = None,
):
    """
    `privacy` is a filter from visible_to(), ANDed with everything else. The
    route sets it for every query that is not an admin's; nothing a client
    sends can remove it.
    """
    mongo_query: dict = {"$and": [privacy]} if privacy else {}
    projection = None

    limit = int(limit) if limit else 0

    if user_id:
        mongo_query[F.USER_ID] = int(user_id)
        projection = {F.USER_ID: False}

    if before or after:
        mongo_query[F.UTC_START_TIME] = Utility.cleandict(
            {
                "$lt": None if before is None else Utility.to_epoch(before),
                "$gte": None if after is None else Utility.to_epoch(after),
            }
        )

    if activity_ids:
        mongo_query[F.ACTIVITY_ID] = {
            "$in": list(set(int(aid) for aid in activity_ids))
        }

    if activity_type:
        mongo_query[F.ACTIVITY_TYPE] = {"$in": activity_type}

    if sport_type:
        # an $or of its own, so it goes in the $and beside the privacy filter
        mongo_query.setdefault("$and", []).append(sport_type_filter(sport_type))
    if exclude_sport_type:
        mongo_query.setdefault("$and", []).append(
            sport_type_filter(exclude_sport_type, exclude=True)
        )

    if visibility:
        # ["everyone", "followers", "only_me"]
        mongo_query[F.VISIBILITY] = {"$in": visibility}

    if private is not None:
        mongo_query[F.FLAG_PRIVATE] = private

    if commute is not None:
        mongo_query[F.FLAG_COMMUTE] = commute

    if overlaps is not None:
        # Find all activities whose bounding box overlaps
        # a box implied by bounds
        bounds_left, bounds_bottom = overlaps["SW"]
        bounds_right, bounds_top = overlaps["NE"]
        mongo_query.update(
            {
                f"{F.LATLNG_BOUNDS}.NE.0": {"$gt": bounds_left},
                f"{F.LATLNG_BOUNDS}.SW.0": {"$lt": bounds_right},
                f"{F.LATLNG_BOUNDS}.SW.1": {"$lt": bounds_top},
                f"{F.LATLNG_BOUNDS}.NE.1": {"$gt": bounds_bottom},
            }
        )

    to_delete = None

    index = await get_collection()

    result = {}

    if exclude_ids:
        t0 = time.perf_counter()
        cursor = index.find(
            filter=mongo_query,
            projection={F.ACTIVITY_ID: True},
            sort=SORT_SPECS,
            limit=limit,
        )

        # These are the ids of activities that matched the mongo_query
        mongo_query_ids = set([doc[F.ACTIVITY_ID] async for doc in cursor])
        excl = set(int(aid) for aid in exclude_ids)
        to_fetch = list(mongo_query_ids - excl)
        to_delete = list(excl - mongo_query_ids)

        result["delete"] = to_delete
        mongo_query = {F.ACTIVITY_ID: {"$in": to_fetch}}

        elapsed = (time.perf_counter() - t0) * 1000
        log.debug("queried %d ids in %dms", len(mongo_query_ids), elapsed)

    t0 = time.perf_counter()
    cursor = index.find(
        filter=mongo_query,
        projection=projection,
        sort=SORT_SPECS,
        limit=limit,
    )

    docs = await cursor.to_list(length=None)
    result["docs"] = docs

    t1 = time.perf_counter()
    elapsed = (t1 - t0) * 1000
    log.debug("queried %d activities in %dms", len(docs), elapsed)

    if update_index_access:
        if user_id:
            await Users.add_or_update(id=user_id, update_index_access=True)
        else:
            ids = set(a[F.USER_ID] for a in docs)
            tasks = [
                asyncio.create_task(
                    Users.add_or_update(id=user_id, update_index_access=True)
                )
                for user_id in ids
            ]
            await asyncio.gather(*tasks)
    return result


def stats():
    return DataAPIs.stats(COLLECTION_NAME)


def drop():
    return DataAPIs.drop(COLLECTION_NAME)
