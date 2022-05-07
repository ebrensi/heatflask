"""
Functions and constants pertaining to the Index datastore.  Each record
represents the summary of a user activity.

***  For Jupyter notebook ***
Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:
    %%cython --annotate    # Compile and run the cell
    %load Index.py         # Load Index.py file into this (empty) cell
    %%writefile Index.py   # Write the contents of this cell to Index.py
"""

import os
import polyline
import numpy as np
from logging import getLogger
import datetime
import time
import asyncio
import types
from pymongo import DESCENDING
from aiohttp import ClientResponseError
from typing import TypedDict

from . import DataAPIs
from .DataAPIs import db
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
    LATLNG_BOUNDS = "B"
    FLAG_COMMUTE = "c"
    FLAG_PRIVATE = "p"
    ACTIVITY_NAME = "N"
    ACTIVITY_TYPE = "t"
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
            F.ELEVATION_GAIN: total_elevation_gain,
            F.ACTIVITY_TYPE: Strava.ATYPES_LOOKUP.get(type, type),
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
IMPORT_FLAG_PREFIX = "I:"
IMPORT_FLAG_TTL = 20  # secods
IMPORT_ERROR_TTL = 5


def import_flag_key(uid: int):
    return f"{IMPORT_FLAG_PREFIX}{uid}"


async def set_import_flag(user_id: int, val: str):
    await db.redis.setex(import_flag_key(user_id), IMPORT_FLAG_TTL, val)
    log.debug(f"{user_id} import flag set to '%s'", val)


async def set_import_error(user_id: int, e):
    val = f"Strava error ${e.status}: ${e.message}"
    await db.redis.setex(import_flag_key(user_id), 5, val)


async def clear_import_flag(user_id: int):
    await db.redis.delete(import_flag_key(user_id))
    log.debug(f"{user_id} import flag unset")


async def check_import_progress(user_id: int):
    result = await db.redis.get(import_flag_key(user_id))
    return result.decode("utf-8") if result else None


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
    await set_import_flag(uid, "Building index...")

    strava = Strava.AsyncClient(uid, user[U.AUTH])
    await strava.update_access_token()
    now = datetime.datetime.utcnow()

    docs = []
    count = 0
    try:
        async for A in strava.get_all_activities():
            if A is not None:
                docs.append(mongo_doc(**A, ts=now))
                count += 1
                if count % Strava.PER_PAGE == 0:
                    await set_import_flag(uid, f"Building index...{count}")
    except ClientResponseError as e:
        log.info(
            "%d Index import aborted due to Strava error %d: %s",
            uid,
            e.message,
            e.status,
        )
        await set_import_error(uid, e)
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

    await clear_import_flag(uid)
    log.debug(
        "fetched %s entries in %dms, insert_many %dms", count, fetch_time, insert_time
    )


async def import_one(activity_id: int, **user):
    client = Strava.AsyncClient(user[U.ID], user[U.AUTH])
    try:
        DetailedActivity = await client.get_activity(activity_id, raise_exception=True)
    except Exception:
        log.error("can't import activity %d", activity_id)
        return

    if not DetailedActivity:
        log.error("can't import activity %d", activity_id)
        return

    doc = mongo_doc(**DetailedActivity, ts=datetime.datetime.utcnow())
    index = await get_collection()
    try:
        await index.replace_one({F.ACTIVITY_ID: activity_id}, doc, upsert=True)
    except Exception:
        log.exception("mongo error?")
    else:
        log.debug("%s imported activity %d", user[U.ID], activity_id)


# TODO: fix this. updates willnot be in this form
async def update_one(activity_id: int, **updates):
    index = await get_collection()
    doc = mongo_doc(**updates, update=True)
    try:
        await index.update_one({F.ACTIVITY_ID: activity_id}, {"$set": doc})
    except Exception:
        log.exception("mongo error?")
    else:
        log.debug("updated activity %d: %s", activity_id, updates)


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


async def has_user_entries(**user):
    uid = int(user[U.ID])
    index = await get_collection()
    return not not (
        await index.find_one({F.USER_ID: int(uid)}, projection={F.ACTIVITY_ID: True})
    )


async def triage(*args):
    now_ts = datetime.datetime.now().timestamp()
    cutoff = now_ts - TTL
    users = await get_collection()
    cursor = users.find({U.LAST_INDEX_ACCESS: {"$lt": cutoff}}, {U.ID: True})
    stale_ids = [u[U.ID] async for u in cursor]
    tasks = [
        asyncio.create_task(delete_user_entries(**{U.ID: sid})) for sid in stale_ids
    ]
    await asyncio.gather(*tasks)


SORT_SPECS = [(F.UTC_START_TIME, DESCENDING)]


async def query(
    user_id: int = None,
    activity_ids: list[int] = None,
    exclude_ids: list[int] = None,
    after: int = None,
    before: int = None,
    limit: int = None,
    activity_type: list[str] = None,
    commute: bool = None,
    private: bool = None,
    visibility: bool = None,
    overlaps=None,
    #
    update_index_access=True,
):
    mongo_query: dict = {}
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
