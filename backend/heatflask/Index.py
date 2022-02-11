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
from pymongo import DESCENDING

import DataAPIs
import Strava
import Utility

log = getLogger(__name__)
log.propagate = True

APP_NAME = "heatflask"
COLLECTION_NAME = "index"

SECS_IN_HOUR = 60 * 60
SECS_IN_DAY = 24 * SECS_IN_HOUR

# How long we store Index entry in MongoDB
INDEX_TTL = int(os.environ.get("INDEX_TTL", 10)) * SECS_IN_DAY
DATA = {}


async def get_collection():
    if "col" not in DATA:
        DATA["col"] = await DataAPIs.init_collection(COLLECTION_NAME, ttl=INDEX_TTL)
    return DATA["col"]


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
    # my additions
    _id=None,
    ts=None,
    **and_more
):
    if not (start_date and map and map.get("summary_polyline")):
        #         log.debug("cannot make doc for activity %s", id)
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
            FLAG_COMMUTE: commute,
            FLAG_PRIVATE: private,
            LATLNG_BOUNDS: polyline_bounds(map["summary_polyline"]),
        }
    )


async def import_user_entries(**user):
    t0 = time.perf_counter()

    uid = int(user["_id"])

    # we assume the access_token is current
    strava = Strava.AsyncClient(uid, **user["auth"])
    await strava.update_access_token()
    now = datetime.datetime.utcnow()
    docs = [mongo_doc(**A, ts=now) async for A in strava.get_index() if A is not None]
    docs = filter(None, docs)
    t1 = time.perf_counter()
    fetch_time = (t1 - t0) * 1000

    index = await get_collection()
    await delete_user_entries(**user)
    insert_result = await index.insert_many(docs, ordered=False)
    insert_time = (time.perf_counter() - t1) * 1000
    count = len(insert_result.inserted_ids)
    log.debug(
        "fetched %s entries in %dms, insert_many %dms", count, fetch_time, insert_time
    )


async def delete_user_entries(**user):
    uid = int(user["_id"])
    index = await get_collection()
    return await index.delete_many({USER_ID: int(uid)})


SORT_SPECS = [(UTC_START_TIME, DESCENDING)]


async def query(
    user_id=None,
    activity_ids=None,
    exclude_ids=None,
    after=None,
    before=None,
    limit=None,
    update_ts=True,
):
    if activity_ids:
        activity_ids = set(int(aid) for aid in activity_ids)

    if exclude_ids:
        exclude_ids = set(int(aid) for aid in exclude_ids)

    limit = int(limit) if limit else 0

    query = {}
    projection = None

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
        query[ACTIVITY_ID] = {"$in": list(activity_ids)}

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
        update_result = await index.update_many(
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
