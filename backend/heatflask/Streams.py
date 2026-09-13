"""
Functions and constants pertaining to the Streams data store.  Each activity
has the streams time, latlng, and altitude.
"""

import os
import time
import datetime
from logging import getLogger
import msgpack
import polyline
import asyncio
import types
from typing import TypedDict, Awaitable, AsyncGenerator, Coroutine, cast

from . import DataAPIs
from . import Strava
from . import StreamCodecs
from .Users import UserField as U

log = getLogger(__name__)
log.setLevel("DEBUG")
log.propagate = True

COLLECTION_NAME = "streams_v0"

SECS_IN_HOUR = 60 * 60
SECS_IN_DAY = 24 * SECS_IN_HOUR

# Mongo is now the only local cache of Strava streams. There used to be a
# Redis tier in front of it with a 4-hour TTL; this is the 10-day one that
# actually governed how long a stream survived.
MONGO_TTL = int(os.environ.get("MONGO_STREAMS_TTL", 10)) * SECS_IN_DAY
OFFLINE = os.environ.get("OFFLINE")

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(
            COLLECTION_NAME, ttl=MONGO_TTL
        )
    return myBox.collection


POLYLINE_PRECISION = 6


class EncodedStreams(TypedDict):
    """note: altitude (with key 'a') is in whole metres.

    It used to be scaled up 10x (decimetres), which overflowed the codec's
    int16 first-value field above 3276m, and made the run-length diffs
    overflow a byte for any step over 12.8m -- routine where a recording
    pauses across a climb."""

    t: StreamCodecs.RLDEncoded
    a: StreamCodecs.RLDEncoded
    p: str


PackedStreams = bytes


def encode_streams(rjson: Strava.Streams) -> PackedStreams:
    """compress stream data"""
    enc: EncodedStreams = {
        "t": StreamCodecs.rld_encode(rjson["time"]["data"]),
        "a": StreamCodecs.rld_encode(rjson["altitude"]["data"], scale=1),
        "p": polyline.encode(rjson["latlng"]["data"], POLYLINE_PRECISION),
    }
    return msgpack.packb(enc)


def decode_streams(msgpacked_streams: PackedStreams):
    """de-compress stream data
    * time: UInt16
    * altitude: Int16
    * latlng: float32 (Google Polyline encoded)
    """
    d: EncodedStreams = msgpack.unpackb(msgpacked_streams)
    return {
        "time": StreamCodecs.rld_decode(d["t"], dtype="u2"),
        "altitude": StreamCodecs.rld_decode(d["a"], dtype="i2"),
        "latlng": polyline.decode(d["p"], POLYLINE_PRECISION),
    }


class StreamsDoc(TypedDict):
    _id: int
    mpk: PackedStreams
    ts: datetime.datetime


def mongo_doc(activity_id: int, packed: PackedStreams, ts=None) -> StreamsDoc:
    return {
        "_id": int(activity_id),
        "mpk": packed,
        # aware UTC: this field drives the TTL index, and .now() without a
        # timezone writes local time, expiring streams early or late by the
        # machine's UTC offset
        "ts": ts or datetime.datetime.now(datetime.timezone.utc),
    }


StreamsQueryResult = tuple[int, PackedStreams]


async def strava_import(
    activity_ids: list[int], **user
) -> AsyncGenerator[StreamsQueryResult, bool]:
    uid = int(user[U.ID])

    strava = Strava.AsyncClient(uid, user[U.AUTH])
    await strava.update_access_token()
    coll = await get_collection()

    aiterator = strava.get_many_streams(activity_ids)

    mongo_docs = []
    now = datetime.datetime.now(datetime.timezone.utc)
    async for aid, streams in aiterator:
        packed = encode_streams(streams)

        mongo_docs.append(mongo_doc(aid, packed, ts=now))

        abort_signal = yield aid, packed

        if abort_signal:
            await Strava.AsyncClient.abort(aiterator)
            break

    # insert_many([]) raises InvalidOperation, and an import that yields
    # nothing is perfectly possible
    if mongo_docs:
        await coll.insert_many(mongo_docs)


async def aiter_query(
    activity_ids: list[int], user=None
) -> AsyncGenerator[StreamsQueryResult, bool]:
    if not activity_ids:
        return
    #
    # Mongo is the only local cache, so one query settles what we have
    #
    t0 = time.perf_counter()
    streams = await get_collection()
    query = {"_id": {"$in": activity_ids}}
    exclusions = {"ts": False}

    cursor = streams.find(query, projection=exclusions)
    local_result: list[StreamsQueryResult] = [
        (doc["_id"], doc["mpk"]) async for doc in cursor
    ]
    mongo_result_ids = [_id for _id, mpk in local_result]

    if mongo_result_ids:
        # Reset the TTL clock for the streams we are about to serve
        await streams.update_many(
            {"_id": {"$in": mongo_result_ids}},
            {"$set": {"ts": datetime.datetime.now(datetime.timezone.utc)}},
        )

    elapsed = (time.perf_counter() - t0) * 1000
    log.debug("retrieved %d streams from Mongo in %d", len(local_result), elapsed)

    # whatever is left has to come from Strava
    activity_ids = list(set(activity_ids) - set(mongo_result_ids))

    streams_import = None
    first_fetch = None
    if activity_ids and (user is not None) and (not OFFLINE):
        # Start a fetch process going. We will get back to this...
        t0 = time.perf_counter()
        streams_import = strava_import(activity_ids, **user)
        first_fetch = asyncio.create_task(cast(Coroutine, streams_import.__anext__()))

    # Yield everything we already had locally
    for item in local_result:
        abort_signal = yield item
        if abort_signal:
            log.info("Local Streams query aborted")
            if streams_import:
                await Strava.AsyncClient.abort(streams_import)
            break

    if streams_import:
        # Now we yield results of fetches as they come in
        item1: StreamsQueryResult = await cast(Awaitable, first_fetch)
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


async def query(**kwargs) -> list[StreamsQueryResult]:
    return [s async for s in aiter_query(**kwargs)]


async def cached_ids(activity_ids: list[int]) -> list[int]:
    """
    Which of these activities we hold streams for, right now.

    Deliberately does not touch `ts` the way aiter_query does: this only
    reports what is in the cache, and merely looking at the list should not
    extend anything's stay in it.
    """
    if not activity_ids:
        return []
    streams = await get_collection()
    cursor = streams.find({"_id": {"$in": activity_ids}}, projection={"_id": True})
    return [doc["_id"] async for doc in cursor]


async def delete(activity_ids: list[int]):
    if not activity_ids:
        return
    streams = await get_collection()
    await streams.delete_many({"_id": {"$in": activity_ids}})


# clear_cache() lived here to flush the Redis tier. Nothing called it, and
# with Redis gone there is no second tier to flush, so it is deleted.


def stats():
    return DataAPIs.stats(COLLECTION_NAME)


def drop():
    return DataAPIs.drop(COLLECTION_NAME)
