"""
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

from . import DataAPIs
from .DataAPIs import db
from . import Strava
from . import Utility
from . import Users

log = getLogger(__name__)
log.propagate = True

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


def polyline_bounds(poly):
    try:
        latlngs = np.array(polyline.decode(poly), dtype=np.float32)
    except Exception:
        return

    lats = latlngs[:, 0]
    lngs = latlngs[:, 1]

    return {
        "SW": (float(lats.min()), float(lngs.min())),
        "NE": (float(lats.max()), float(lngs.max())),
    }


def overlaps(b1, b2):
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
        f"{LATLNG_BOUNDS}.NE.0": {"$gt": b1_left},
        f"{LATLNG_BOUNDS}.SW.0": {"$lt": b1_right},
        f"{LATLNG_BOUNDS}.SW.1": {"$lt": b1_top},
        f"{LATLNG_BOUNDS}.NE.1": {"$gt": b1_bottom}
    }
    """


# MongoDB short field names speed up data transfer to/from
# remote DB server
fields = [
    ACTIVITY_ID := "_id",
    USER_ID := "U",
    N_ATHLETES := "#a",
    N_PHOTOS := "#p",
    ELEVATION_GAIN := "+",
    UTC_START_TIME := "s",
    UTC_LOCAL_OFFSET := "o",
    DISTANCE_METERS := "D",
    TIME_SECONDS := "T",
    LATLNG_BOUNDS := "B",
    FLAG_COMMUTE := "c",
    FLAG_PRIVATE := "p",
    ACTIVITY_NAME := "N",
    ACTIVITY_TYPE := "t",
    VISIBILITY := "v",
]


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
            ACTIVITY_ID: int(_id or id),
            USER_ID: int(athlete["id"]),
            ACTIVITY_NAME: name or title,
            DISTANCE_METERS: distance,
            TIME_SECONDS: elapsed_time,
            ELEVATION_GAIN: total_elevation_gain,
            ACTIVITY_TYPE: Strava.ATYPES_LOOKUP.get(type, type),
            UTC_START_TIME: utc_start_time,
            UTC_LOCAL_OFFSET: utc_offset,
            N_ATHLETES: athlete_count,
            N_PHOTOS: total_photo_count,
            VISIBILITY: visibility,
            FLAG_COMMUTE: commute,
            FLAG_PRIVATE: private,
            LATLNG_BOUNDS: polyline_bounds(map["summary_polyline"]),
        }
    )


# # **************************************
IMPORT_FLAG_PREFIX = "I:"
IMPORT_FLAG_TTL = 20  # secods
IMPORT_ERROR_TTL = 5


def import_flag_key(uid):
    return f"{IMPORT_FLAG_PREFIX}{uid}"


async def set_import_flag(user_id, val):
    await db.redis.setex(import_flag_key(user_id), IMPORT_FLAG_TTL, val)
    log.debug(f"{user_id} import flag set to '%s'", val)


async def set_import_error(user_id, e):
    val = f"Strava error ${e.status}: ${e.message}"
    await db.redis.setex(import_flag_key(user_id), 5, val)


async def clear_import_flag(user_id):
    await db.redis.delete(import_flag_key(user_id))
    log.debug(f"{user_id} import flag unset")


async def check_import_progress(user_id):
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


async def import_index_progress(user_id, poll_delay=0.5):
    last_msg = None
    while msg := await check_import_progress(user_id):
        if msg != last_msg:
            yield msg
            last_msg = msg
        await asyncio.sleep(poll_delay)


async def import_user_entries(**user):
    t0 = time.perf_counter()
    uid = int(user[Users.ID])

    await set_import_flag(uid, "Building index...")

    strava = Strava.AsyncClient(uid, **user[Users.AUTH])
    await strava.update_access_token()
    now = datetime.datetime.utcnow()

    docs = []
    count = 0
    try:
        async for A in strava.get_index():
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


async def import_one(activity_id, **user):
    client = Strava.AsyncClient(user[Users.ID], **user[Users.AUTH])
    try:
        DetailedActivity = client.get_activity(activity_id, raise_exception=True)
    except Exception:
        log.error("can't import activity")
        return

    doc = mongo_doc(**DetailedActivity, ts=datetime.datetime.utcnow())
    index = await get_collection()
    try:
        await index.replace_one({ACTIVITY_ID: activity_id}, doc, upsert=True)
    except Exception:
        log.exception("mongo error?")
    else:
        log.debug("%s imported activity %d", user[Users.ID], activity_id)


async def update_one(activity_id, **updates):
    index = await get_collection()
    doc = mongo_doc(**updates, update=True)
    try:
        await index.update_one({ACTIVITY_ID: activity_id}, {"$set": doc})
    except Exception:
        log.exception("mongo error?")
    else:
        log.debug("updated activity %d: %s", activity_id, updates)


async def delete_one(activity_id):
    index = await get_collection()
    return await index.delete_one({ACTIVITY_ID: activity_id})


async def delete_user_entries(**user):
    uid = int(user[Users.ID])
    index = await get_collection()
    result = await index.delete_many({USER_ID: int(uid)})
    log.debug("%d deleted %s entries", uid, result.deleted_count)


async def count_user_entries(**user):
    uid = int(user[Users.ID])
    index = await get_collection()
    return await index.count_documents({USER_ID: int(uid)})


async def has_user_entries(**user):
    uid = int(user[Users.ID])
    index = await get_collection()
    return not not (await index.find_one({USER_ID: int(uid)}, projection={"_id": True}))


async def triage(*args):
    now_ts = datetime.datetime.now().timestamp()
    cutoff = now_ts - TTL
    users = await get_collection()
    cursor = users.find({Users.LAST_INDEX_ACCESS: {"$lt": cutoff}}, {Users.ID: True})
    stale_ids = [u[Users.ID] async for u in cursor]
    tasks = [
        asyncio.create_task(delete_user_entries(**{Users.ID: sid})) for sid in stale_ids
    ]
    await asyncio.gather(*tasks)


SORT_SPECS = [(UTC_START_TIME, DESCENDING)]

query_obj = {
    "user_id": None,
    "activity_ids": None,
    "exclude_ids": None,
    "after": None,
    "before": None,
    "limit": None,
    "activity_type": None,
    "commute": None,
    "private": None,
    "visibility": None,
    "bounds": None,
    #
    "update_ts": True,
}


async def query(
    user_id=None,
    activity_ids=None,
    exclude_ids=None,
    after=None,
    before=None,
    limit=None,
    activity_type=None,
    commute=None,
    private=None,
    visibility=None,
    bounds=None,
    #
    update_index_access=True,
):
    mongo_query = {}
    projection = None

    if activity_ids:
        activity_ids = set(int(aid) for aid in activity_ids)

    if exclude_ids:
        exclude_ids = set(int(aid) for aid in exclude_ids)

    limit = int(limit) if limit else 0

    if user_id:
        mongo_query[USER_ID] = int(user_id)
        projection = {USER_ID: False}

    if before or after:
        mongo_query[UTC_START_TIME] = Utility.cleandict(
            {
                "$lt": None if before is None else Utility.to_epoch(before),
                "$gte": None if after is None else Utility.to_epoch(after),
            }
        )

    if activity_ids:
        mongo_query[ACTIVITY_ID] = {"$in": activity_ids}

    if activity_type:
        mongo_query[ACTIVITY_TYPE] = {"$in": activity_type}

    if visibility:
        # ["everyone", "followers", "only_me"]
        mongo_query[VISIBILITY] = {"$in": visibility}

    if private is not None:
        mongo_query[FLAG_PRIVATE] = private

    if commute is not None:
        mongo_query[FLAG_COMMUTE] = commute

    if bounds is not None:
        # Find all activities whose bounding box overlaps
        # a box implied by bounds
        bounds_left, bounds_bottom = bounds["SW"]
        bounds_right, bounds_top = bounds["NE"]
        mongo_query.update(
            {
                f"{LATLNG_BOUNDS}.NE.0": {"$gt": bounds_left},
                f"{LATLNG_BOUNDS}.SW.0": {"$lt": bounds_right},
                f"{LATLNG_BOUNDS}.SW.1": {"$lt": bounds_top},
                f"{LATLNG_BOUNDS}.NE.1": {"$gt": bounds_bottom},
            }
        )

    to_delete = None

    index = await get_collection()

    result = {}

    if exclude_ids:
        t0 = time.perf_counter()
        cursor = index.find(
            filter=mongo_query,
            projection={ACTIVITY_ID: True},
            sort=SORT_SPECS,
            limit=limit,
        )

        # These are the ids of activities that matched the mongo_query
        mongo_query_ids = set([doc[ACTIVITY_ID] async for doc in cursor])

        to_fetch = list(mongo_query_ids - exclude_ids)
        to_delete = list(exclude_ids - mongo_query_ids)

        result["delete"] = to_delete
        mongo_query = {ACTIVITY_ID: {"$in": to_fetch}}

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
            ids = set(a[USER_ID] for a in docs)
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
