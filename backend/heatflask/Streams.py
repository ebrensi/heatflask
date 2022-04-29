"""
Functions and constants pertaining to the Streams data store.  Each activity
has the streams time, latlng, and altitude.

***  For Jupyter notebook ***
Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:
    %%cython --annotate      # Compile and run the cell
    %load Streams.py         # Load Streams.py file into this (empty) cell
    %%writefile Streams.py   # Write the contents of this cell to Streams.py
"""

import os
import time
import datetime
from logging import getLogger
import msgpack
import polyline
import asyncio
import types

from . import DataAPIs
from .DataAPIs import db
from . import Strava
from . import StreamCodecs
from .Users import UserField as U


log = getLogger(__name__)
log.setLevel("DEBUG")
log.propagate = True

COLLECTION_NAME = "streams_v0"
CACHE_PREFIX = "S:"

SECS_IN_HOUR = 60 * 60
SECS_IN_DAY = 24 * SECS_IN_HOUR

MONGO_TTL = int(os.environ.get("MONGO_STREAMS_TTL", 10)) * SECS_IN_DAY
REDIS_TTL = int(os.environ.get("REDIS_STREAMS_TTL", 4)) * SECS_IN_HOUR
OFFLINE = os.environ.get("OFFLINE")

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(
            COLLECTION_NAME, ttl=MONGO_TTL, cache_prefix=CACHE_PREFIX
        )
    return myBox.collection


POLYLINE_PRECISION = 6


def encode_streams(activity_id: int, rjson: dict):
    """compress stream data"""
    return msgpack.packb(
        {
            "id": activity_id,
            "t": StreamCodecs.rld_encode(rjson["time"]["data"]),
            "a": StreamCodecs.rld_encode(rjson["altitude"]["data"]),
            "p": polyline.encode(rjson["latlng"]["data"], POLYLINE_PRECISION),
        }
    )


def decode_streams(msgpacked_streams):
    """de-compress stream data"""
    d = msgpack.unpackb(msgpacked_streams)
    return {
        "id": d["id"],
        "time": StreamCodecs.rld_decode(d["t"], dtype="u2"),
        "altitude": StreamCodecs.rld_decode(d["a"], dtype="i2"),
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
    uid = int(user[U.ID])

    strava = Strava.AsyncClient(uid, **user[U.AUTH])
    await strava.update_access_token()
    coll = await get_collection()

    mongo_docs = []
    now = datetime.datetime.now()
    aiterator = strava.get_many_streams(activity_ids)

    async with db.redis.pipeline(transaction=True) as pipe:
        async for aid, streams in aiterator:
            packed = encode_streams(aid, streams)

            # queue packed streams to be redis cached
            pipe = pipe.setex(cache_key(aid), REDIS_TTL, packed)

            mongo_docs.append(mongo_doc(aid, packed, ts=now))

            abort_signal = yield aid, packed

            if abort_signal:
                await Strava.AsyncClient.abort(aiterator)
                break

        await pipe.execute()
    await coll.insert_many(mongo_docs)


async def aiter_query(activity_ids: list[int] = None, user=None):
    if not activity_ids:
        return
    #
    # First we check Redis cache
    #
    t0 = time.perf_counter()
    keys = [cache_key(aid) for aid in activity_ids]
    redis_response = await db.redis.mget(keys)

    # Reset TTL for those cached streams that were hit
    async with db.redis.pipeline(transaction=True) as pipe:
        for k, val in zip(keys, redis_response):
            if val:
                pipe = pipe.expire(k, REDIS_TTL)
        await pipe.execute()

    t1 = time.perf_counter()
    local_result = [(a, s) for a, s in zip(activity_ids, redis_response) if s]
    log.debug(
        "retrieved %d streams from Redis in %d", len(local_result), (t1 - t0) * 1000
    )

    #
    # Next we query MongoDB for streams that were not in Redis
    #
    # activity IDs of cache misses
    activity_ids = [a for a, s in zip(activity_ids, redis_response) if not s]
    if activity_ids:
        # Next we query MongoDB for any cache misses
        t0 = time.perf_counter()
        streams = await get_collection()
        query = {"_id": {"$in": activity_ids}}
        exclusions = {"ts": False}

        cursor = streams.find(query, projection=exclusions)
        mongo_result = [(doc["_id"], doc["mpk"]) async for doc in cursor]
        local_result.extend(mongo_result)
        mongo_result_ids = [_id for _id, mpk in mongo_result]

        # Cache the mongo hits
        async with db.redis.pipeline(transaction=True) as pipe:
            for aid, s in mongo_result:
                pipe = pipe.setex(cache_key(aid), REDIS_TTL, s)
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
    if activity_ids and (user is not None) and (not OFFLINE):
        # Start a fetch process going. We will get back to this...
        t0 = time.perf_counter()
        streams_import = strava_import(activity_ids, **user)
        first_fetch = asyncio.create_task(streams_import.__anext__())

    # Yield all the results from Redis and Mongo
    for item in local_result:
        abort_signal = yield item
        if abort_signal:
            log.info("Local Streams query aborted")
            if streams_import:
                await Strava.AsyncClient.abort(streams_import)
            break

    if streams_import:
        # Now we yield results of fetches as they come in
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
    if not activity_ids:
        return
    streams = await get_collection()
    await streams.delete_many({"_id": {"$in": activity_ids}})
    keys = [cache_key(aid) for aid in activity_ids]
    await db.redis.delete(*keys)


async def clear_cache():
    streams_keys = await db.redis.keys(cache_key("*"))
    if streams_keys:
        return await db.redis.delete(*streams_keys)


def stats():
    return DataAPIs.stats(COLLECTION_NAME)


def drop():
    return DataAPIs.drop(COLLECTION_NAME)
