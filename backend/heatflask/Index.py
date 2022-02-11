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
import motor
import time
from pymongo import DESCENDING

from DataAPIs import init_collection
import Users
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
        DATA["col"] = await init_collection(COLLECTION_NAME, force=False, ttl=INDEX_TTL)
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
    start_date_local=None,
    timezone=None,
    utc_offset=None,
    start_latlng=None,
    end_latlng=None,
    athlete_count=None,
    photo_count=None,
    total_photo_count=None,
    map=None,
    commute=None,
    manual=None,
    private=None,
    # my additions
    _id=None,
    ts=None,
    **and_more
):
    if not (start_date and map and map.get("summary_polyline")):
        #         log.debug("cannot make doc for activity %s", id)
        return

    return Utility.cleandict(
        {
            "_id": int(_id or id),
            "athlete": int(athlete["id"]),
            "name": name,
            "distance": distance,
            "elapsed_time": elapsed_time,
            "type": type,
            "start_date": int(Utility.to_datetime(start_date).timestamp()),
            "start_date_local": int(Utility.to_datetime(start_date_local).timestamp()),
            "utc_offset": utc_offset,
            "timezone": timezone,
            "start_latlng": start_latlng,
            "end_latlng": end_latlng,
            "athlete_count": athlete_count,
            "photo_count": photo_count,
            "total_photo_count": total_photo_count,
            "commute": commute,
            "manual": manual,
            "private": private,
            #
            "ts": ts or datetime.datetime.utcnow(),
            "bounds": polyline_bounds(map["summary_polyline"]),
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
    return await index.delete_many({"athlete": int(uid)})


SORT_SPECS = [("start_date_local", DESCENDING)]


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
        activity_ids = set(int(id) for id in activity_ids)

    if exclude_ids:
        exclude_ids = set(int(id) for id in exclude_ids)

    limit = int(limit) if limit else 0

    query = {}
    projection = None

    if user_id:
        query["athlete"] = int(user_id)
        projection = {"athlete": False}

    if before or after:
        query["start_date_local"] = Utility.cleandict(
            {
                "$lt": None if before is None else Utility.to_epoch(before),
                "$gte": None if after is None else Utility.to_epoch(after),
            }
        )

    if activity_ids:
        query["_id"] = {"$in": list(activity_ids)}

    to_delete = None

    index = await get_collection()

    result = {}

    if exclude_ids:
        t0 = time.perf_counter()
        cursor = index.find(
            filter=query,
            projection={"_id": True},
            sort=SORT_SPECS,
            limit=limit,
        )

        # These are the ids of activities that matched the query
        query_ids = set([doc["_id"] async for doc in cursor])

        to_fetch = list(query_ids - exclude_ids)
        to_delete = list(exclude_ids - query_ids)

        result["delete"] = to_delete
        query = {"_id": {"$in": to_fetch}}

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
            {"_id": {"$in": [a["_id"] for a in docs]}},
            {"$set": {"ts": datetime.datetime.utcnow()}},
        )
        elapsed = (time.perf_counter() - t1) * 1000
        log.debug("ts update in %dms", elapsed)
    return result
