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
import numpy as np
import msgpack
import polyline

import DataAPIs
from DataAPIs import redis
import Strava
import StreamCodecs

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


POLYLINE_PRECISION = 6


def encode_streams(activity_id, rjson):
    return msgpack.packb(
        {
            "id": activity_id,
            "t": StreamCodecs.rlld_encode(rjson["time"]["data"]),
            "a": StreamCodecs.rlld_encode(rjson["altitude"]["data"]),
            "p": polyline.encode(rjson["latlng"]["data"], POLYLINE_PRECISION),
        }
    )


def decode_streams(msgpacked_streams):
    d = msgpack.unpackb(msgpacked_streams)
    return {
        "id": d["id"],
        "time": StreamCodecs.rlld_decode(d["t"], dtype="u2"),
        "altitude": StreamCodecs.rlld_decode(d["a"], dtype="i2"),
        "latlng": polyline.decode(d["p"], POLYLINE_PRECISION),
    }


def mongo_doc(activity_id, stream_data, ts=None):
    return {
        "_id": int(activity_id),
        "mpk": stream_data,
        "ts": ts or datetime.datetime.now(),
    }


def cache_key(aid):
    return f"{CACHE_PREFIX}{aid}"


async def strava_import(activity_ids, **user):
    uid = int(user["_id"])

    strava = Strava.AsyncClient(uid, **user["auth"])
    await strava.update_access_token()

    coll = await get_collection()

    docs = []
    now = datetime.datetime.now()
    aiterator = strava.get_many_streams(activity_ids)
    async for aid, streams in aiterator:
        msgpacked = encode_streams(aid, streams)
        abort_signal = yield aid, msgpacked

        try:
            doc = mongo_doc(aid, msgpacked, ts=now)
        except Exception as e:
            log.error("Streams %s encode error: %s", activity_id, e)
        else:
            docs.append(doc)

        if abort_signal:
            await Strava.AsyncClient.abort(aiterator)
            break

    # now store all this stuff in MongoDB (overwrite any existing records)
    await delete([doc["_id"] for doc in docs])
    await coll.insert_many(docs)
    # in Redis
    async with redis.pipeline(transaction=True) as pipe:
        for doc in docs:
            pipe = pipe.setex(cache_key(doc["_id"]), REDIS_TTL, doc["mpk"])
        await pipe.execute()


async def aiter_query(activity_ids=None, user=None):
    if not activity_ids:
        return

    # First we check Redis cache
    t0 = time.perf_counter()
    keys = [cache_key(aid) for aid in activity_ids]
    redis_response = await redis.mget(keys)
    redis_result = list(filter(None, redis_response))
    redis_result_keys = [keys[i] for i, r in enumerate(redis_response)]

    # Reset TTL for those cached streams that were hit
    async with redis.pipeline(transaction=True) as pipe:
        for k in redis_result_keys:
            pipe = pipe.expire(k, REDIS_TTL)
        await pipe.execute()

    t1 = time.perf_counter()
    log.debug(
        "retrieved %d streams from Redis in %d", len(redis_result), (t1 - t0) * 1000
    )
    local_result = list(redis_result)

    activity_ids = [activity_ids[i] for i, r in enumerate(redis_response) if not r]
    if activity_ids:

        # Next we query MongoDB for any cache misses
        t0 = time.perf_counter()
        streams = await get_collection()
        query = {"_id": {"$in": activity_ids}}
        mongo_result = [(d["_id"], d["mpk"]) async for d in streams.find(query)]
        local_result.extend(mongo_result)
        mongo_result_ids = [_id for _id, mpk in mongo_result]
        mongo_result_keys = [cache_key(aid) for aid in mongo_result_ids]

        # Cache the mongo hits
        async with redis.pipeline(transaction=True) as pipe:
            for k, s in zip(mongo_result_keys, mongo_result):
                pipe = pipe.setex(k, REDIS_TTL, s)
            await pipe.execute()

        # Update TTL for mongo hits
        await streams.update_many(
            {"_id": {"$in": mongo_result_ids}},
            {"$set": {"ts": datetime.datetime.utcnow()}},
        )
        elapsed = (time.perf_counter() - t0) * 1000
        log.debug("retrieved %d streams from Mongo in %d", len(mongo_result), elapsed)

        activity_ids = list(set(activity_ids) - set(mongo_result_ids))

    streams_import = None
    first_fetch = None
    if activity_ids and (user is not None):
        t0 = time.perf_counter()
        streams_import = strava_import(activity_ids, **user)
        first_fetch = asyncio.create_task(streams_import.__anext__())

    for item in local_result:
        abort_signal = yield item
        if abort_signal:
            log.info("Local Streams query aborted")
            return

    if streams_import:
        item1 = await first_fetch
        abort_signal = yield item1
        imported_items = [item1]

        if not abort_signal:
            async for item in streams_import:
                imported_items.append(item)
                abort_signal = yield item
                if abort_signal:
                    break

        if abort_signal:
            Strava.AsyncClient.abort(streams_import)
            log.info("Remote Streams query aborted")

        t1 = time.perf_counter()
        log.debug(
            "retrieved %d streams from Strava in %d",
            len(imported_items),
            (t1 - t0) * 1000,
        )
        imported_ids = set(aid for aid, mpk in imported_items)
        missing_ids = set(activity_ids) - imported_ids
        if missing_ids:
            log.info("unable to import streams for %s", missing_ids)


async def query(**kwargs):
    return [s async for s in aiter_query(**kwargs)]


async def delete(activity_ids):
    streams = await get_collection()
    return await streams.delete_many({"_id": {"$in": activity_ids}})
