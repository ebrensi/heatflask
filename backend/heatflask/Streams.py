"""
***  For Jupyter notebook ***
Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:
    %%cython --annotate    # Compile and run the cell
    %load Streams.py         # Load Streams.py file into this (empty) cell
    %%writefile Streams.py   # Write the contents of this cell to Streams.py
"""

import os
import time
import datetime
from logging import getLogger

import DataAPIs
from DataAPIs import redis
import Strava

log = getLogger(__name__)
log.propagate = True

APP_NAME = "heatflask"
COLLECTION_NAME = "streams"
CACHE_PREFIX = "S:"

SECS_IN_HOUR = 60 * 60
SECS_IN_DAY = 24 * SECS_IN_HOUR

MONGO_TTL = int(os.environ.get("MONGO_STREAMS_TTL", 10)) * SECS_IN_DAY
REDIS_TTL = int(os.environ.get("REDIS_STREAMS_TTL", 4)) * SECS_IN_HOUR

DATA = {}


async def get_collection():
    if "col" not in DATA:
        DATA["col"] = await DataAPIs.init_collection(
            COLLECTION_NAME, ttl=MONGO_TTL, cache_prefix=CACHE_PREFIX
        )
    return DATA["col"]


def mongo_doc(activity_id, stream_data, ts=None):
    return {
        "_id": int(activity_id),
        "mpk": stream_data,
        "ts": ts or datetime.datetime.now(),
    }


async def strava_import(activity_ids, **user):
    uid = int(user["_id"])

    strava = Strava.AsyncClient(uid, **user["auth"])
    await strava.update_access_token()

    streams = await get_collection()

    docs = []
    now = datetime.datetime.now()
    aiterator = strava.get_many_streams(activity_ids)
    async for item in aiterator:
        abort_signal = yield item

        try:
            doc = mongo_doc(*item, ts=now)
        except Exception as e:
            log.error("Streams %s encode error: %s", activity_id, e)
        else:
            docs.append(doc)

        if abort_signal:
            await Strava.AsyncClient.abort(aiterator)
            break

    # now store all this stuff
    await delete([doc["_id"] for doc in docs])
    await streams.insert_many(docs)

    async with redis.pipeline(transaction=True) as pipe:
        for doc in docs:
            key = f"{CACHE_PREFIX}{doc['_id']}"
            await pipe.setex(key, REDIS_TTL, doc["mpk"])
        redis_result = await pipe.execute()


async def aiter_query(activity_ids=None, limit=0, update_ts=False):
    streams = await get_collection()
    query = {}

    if activity_ids:
        query["_id"]: {"$in": activity_ids}

    t0 = time.perf_counter()
    cursor = streams.find(query, limit=limit)
    ids = []
    async for doc in cursor:
        yield doc["_id"], doc["mpk"]
        ids.append(doc["_id"])

    n = len(ids)

    if update_ts and n:
        t0 = time.perf_counter()
        update_result = await streams.update_many(
            {"_id": {"$in": ids}},
            {"$set": {"ts": datetime.datetime.utcnow()}},
        )
        elapsed = (time.perf_counter() - t0) * 1000
        log.debug("streams update ts: %d records in %dms", n, elapsed)


async def query(**kwargs):
    return [s async for s in aiter_query(**kwargs)]


async def delete(activity_ids):
    streams = await get_collection()
    return await streams.delete_many({"_id": {"$in": activity_ids}})
