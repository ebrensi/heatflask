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
from pymongo import DESCENDING

import DataAPIs
from DataAPIs import db
import Strava
import Utility
import types

log = getLogger(__name__)
log.propagate = True

COLLECTION_NAME = "index"

SECS_IN_HOUR = 60 * 60
SECS_IN_DAY = 24 * SECS_IN_HOUR

# How long we store Index entry in MongoDB
INDEX_TTL = int(os.environ.get("INDEX_TTL", 10)) * SECS_IN_DAY

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(
            COLLECTION_NAME, ttl=INDEX_TTL
        )
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


# MongoDB short field names speed up data transfer to/from
# remote DB server
ACTIVITY_ID = "_id"
TIMESTAMP = "ts"
USER_ID = "U"
ACTIVITY_NAME = "N"
DISTANCE_METERS = "D"
TIME_SECONDS = "T"
ACTIVITY_TYPE = "t"
UTC_START_TIME = "s"
UTC_LOCAL_OFFSET = "o"
N_ATHLETES = "#a"
N_PHOTOS = "#p"
FLAG_COMMUTE = "c"
FLAG_PRIVATE = "p"
LATLNG_BOUNDS = "B"
VISIBILITY = "v"


# see https://developers.strava.com/docs/reference/#api-models-SummaryActivity
def mongo_doc(
    # From Strava SummaryActivity record
    id=None,
    athlete=None,
    name=None,
    distance=None,
    moving_time=None,
    elapsed_time=None,
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
    ts=None,
    **and_more,
):
    if not (start_date and map and map.get("summary_polyline")):
        return

    utc_start_time = int(Utility.to_datetime(start_date).timestamp())
    return Utility.cleandict(
        {
            TIMESTAMP: ts or datetime.datetime.utcnow(),
            ACTIVITY_ID: int(_id or id),
            USER_ID: int(athlete["id"]),
            ACTIVITY_NAME: name,
            DISTANCE_METERS: distance,
            TIME_SECONDS: elapsed_time,
            ACTIVITY_TYPE: type,
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


## **************************************
IMPORT_FLAG_PREFIX = "I:"
IMPORT_FLAG_TTL = 20  # secods


def import_flag_key(uid):
    return f"{IMPORT_FLAG_PREFIX}{uid}"


async def set_import_flag(user_id, val):
    await db.redis.setex(import_flag_key(user_id), IMPORT_FLAG_TTL, val)
    log.debug(f"{user_id} import flag set to %s", val)


async def clear_import_flag(user_id):
    await db.redis.delete(import_flag_key(user_id))
    log.debug(f"{user_id} import flag unset")


async def check_import_progress(user_id):
    return await db.redis.get(import_flag_key(user_id))


## **************************************


async def dummy_op():
    log.info("Starting dummy operation")
    for i in range(10):
        await asyncio.sleep(1)
        log.info("dummy op %d", i)
    log.info("Finished dummy operation")


async def import_user_entries(**user):
    t0 = time.perf_counter()
    uid = int(user["_id"])

    await set_import_flag(uid, "importing index...")

    strava = Strava.AsyncClient(uid, **user["auth"])
    await strava.update_access_token()
    now = datetime.datetime.utcnow()

    docs = []
    count = 0
    async for A in strava.get_index():
        if A is not None:
            docs.append(mongo_doc(**A, ts=now))
            count += 1
            if count % Strava.PER_PAGE == 0:
                await set_import_flag(uid, count)

    #     docs = [mongo_doc(**A, ts=now) async for A in strava.get_index() if A is not None]
    docs = filter(None, docs)
    t1 = time.perf_counter()
    fetch_time = (t1 - t0) * 1000

    if not docs:
        return

    index = await get_collection()
    await delete_user_entries(**user)
    insert_result = await index.insert_many(docs, ordered=False)
    insert_time = (time.perf_counter() - t1) * 1000
    count = len(insert_result.inserted_ids)

    await clear_import_flag(uid)
    log.debug(
        "fetched %s entries in %dms, insert_many %dms", count, fetch_time, insert_time
    )


async def delete_user_entries(**user):
    uid = int(user["_id"])
    index = await get_collection()
    return await index.delete_many({USER_ID: int(uid)})


async def count_user_entries(**user):
    uid = int(user["_id"])
    index = await get_collection()
    return await index.count_documents({USER_ID: int(uid)})


async def has_user_entries(**user):
    uid = int(user["_id"])
    index = await get_collection()
    return not not (await index.find_one({USER_ID: int(uid)}, projection={"_id": True}))


SORT_SPECS = [(UTC_START_TIME, DESCENDING)]


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
    #
    update_ts=True,
):
    query = {}
    projection = None

    if activity_ids:
        activity_ids = set(int(aid) for aid in activity_ids)

    if exclude_ids:
        exclude_ids = set(int(aid) for aid in exclude_ids)

    limit = int(limit) if limit else 0

    if user_id:
        query[USER_ID] = int(user_id)
        projection = {USER_ID: False}

    if before or after:
        query[UTC_START_TIME] = Utility.cleandict(
            {
                "$lt": None if before is None else Utility.to_epoch(before),
                "$gte": None if after is None else Utility.to_epoch(after),
            }
        )

    if activity_ids:
        query[ACTIVITY_ID] = {"$in": activity_ids}

    if activity_type:
        query[ACTIVITY_TYPE] = {"$in": activity_type}

    if visibility:
        # ["everyone", "followers", "only_me"]
        query[VISIBILITY] = {"$in": visibility}

    if private is not None:
        query[FLAG_PRIVATE] = private

    if commute is not None:
        query[FLAG_COMMUTE] = commute

    to_delete = None

    index = await get_collection()

    result = {}

    if exclude_ids:
        t0 = time.perf_counter()
        cursor = index.find(
            filter=query,
            projection={ACTIVITY_ID: True},
            sort=SORT_SPECS,
            limit=limit,
        )

        # These are the ids of activities that matched the query
        query_ids = set([doc[ACTIVITY_ID] async for doc in cursor])

        to_fetch = list(query_ids - exclude_ids)
        to_delete = list(exclude_ids - query_ids)

        result["triage"] = to_delete
        query = {ACTIVITY_ID: {"$in": to_fetch}}

        elapsed = (time.perf_counter() - t0) * 1000
        log.debug("queried %d ids in %dms", len(query_ids), elapsed)

    t0 = time.perf_counter()
    cursor = index.find(
        filter=query,
        projection=projection,
        sort=SORT_SPECS,
        limit=limit,
    )

    docs = await cursor.to_list(length=None)
    result["docs"] = docs

    t1 = time.perf_counter()
    elapsed = (t1 - t0) * 1000
    log.debug("queried %d activities in %dms", len(docs), elapsed)

    if update_ts:
        await index.update_many(
            {"_id": {"$in": [a[ACTIVITY_ID] for a in docs]}},
            {"$set": {TIMESTAMP: datetime.datetime.utcnow()}},
        )
        elapsed = (time.perf_counter() - t1) * 1000
        log.debug("ts update in %dms", elapsed)
    return result


def stats():
    return DataAPIs.stats(COLLECTION_NAME)


def drop():
    return DataAPIs.drop(COLLECTION_NAME)


ATYPE_SPECS = [
    "Ride",
    "Run",
    "Swim",
    "Walk",
    "Hike",
    "Alpine Ski",
    "Backcountry Ski",
    "Canoe",
    "Crossfit",
    "E-Bike Ride",
    "Elliptical",
    "Handcycle",
    "Ice Skate",
    "Inline Skate",
    "Kayak",
    "Kitesurf Session",
    "Nordic Ski",
    "Rock Climb",
    "Roller Ski",
    "Row",
    "Snowboard",
    "Snowshoe",
    "Stair Stepper",
    "Stand Up Paddle",
    "Surf",
    "Velomobile ",
    "Virtual Ride",
    "Virtual Run",
    "Weight Training",
    "Windsurf Session",
    "Wheelchair",
    "Workout",
    "Yoga",
]
