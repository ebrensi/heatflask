# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
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
from dataclasses import dataclass
from pymongo.errors import BulkWriteError
from typing import Optional, TypedDict, AsyncGenerator

from . import DataAPIs
from . import History
from . import Strava
from . import StreamCodecs
from . import Users

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
    * time: UInt32
    * altitude: Int16
    * latlng: float32 (Google Polyline encoded)
    """
    d: EncodedStreams = msgpack.unpackb(msgpacked_streams)
    return {
        "time": StreamCodecs.rld_decode(d["t"], dtype="u4"),
        "altitude": StreamCodecs.rld_decode(d["a"], dtype="i2"),
        "latlng": polyline.decode(d["p"], POLYLINE_PRECISION),
    }


class StreamsDoc(TypedDict):
    _id: int
    # None marks a tombstone: an activity whose streams we fetched and could
    # not encode. See tombstone_doc.
    mpk: Optional[PackedStreams]
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


def tombstone_doc(activity_id: int, ts=None) -> StreamsDoc:
    """
    A marker saying "we have already paid a Strava read for this one, and it
    did not encode".

    Without it an unencodable activity was never written, so it missed the
    cache lookup on every later query and was fetched from Strava again --
    forever, once per render of that athlete's map. Activity 323533360 was
    refetched three times in six days for one read each.

    Unlike a real stream, its `ts` is not refreshed when it is served, so it
    expires on the stream TTL and the activity is retried at most once per TTL
    period. That is what lets a map heal itself after the encoder is fixed,
    for the price of one read per unencodable activity per TTL.
    """
    return {
        "_id": int(activity_id),
        "mpk": None,
        "ts": ts or datetime.datetime.now(datetime.timezone.utc),
    }


StreamsQueryResult = tuple[int, PackedStreams]

# Imported streams are written to Mongo this many at a time
INSERT_BATCH = 50


async def save(docs: list[StreamsDoc]) -> None:
    if not docs:
        return
    coll = await get_collection()
    try:
        # unordered, so one duplicate (two tabs importing the same activity)
        # does not stop the rest from being written
        await coll.insert_many(docs, ordered=False)
    except BulkWriteError as e:
        others = [
            err for err in e.details.get("writeErrors", []) if err.get("code") != 11000
        ]
        if others:
            log.error("error saving streams: %s", others)


async def strava_import(
    activity_ids: list[int], **user
) -> AsyncGenerator[StreamsQueryResult, None]:
    """
    Fetch streams from Strava, yield them, and keep them in Mongo.

    They are saved in batches as they arrive, and whatever is left over is
    saved in the finally clause. The whole import used to be written once, at
    the very end, so anything that stopped it early -- an abort, the error
    limit, the browser going away -- threw out every stream already fetched,
    and the Strava requests they cost with them.

    That includes streams that arrived but were never yielded, which
    get_many_streams hands back as leftovers when it is closed.

    Stop early with aclose().
    """
    strava = Users.strava_client(user)
    await strava.update_access_token()

    leftovers: list[Strava.StreamsResult] = []
    # whose import it is, for the fair share of Strava's window (RateLimit)
    aiterator = strava.get_many_streams(
        activity_ids, leftovers=leftovers, owner=user.get(Users.UserField.ID)
    )

    unsaved: list[StreamsDoc] = []
    now = datetime.datetime.now(datetime.timezone.utc)
    imported = 0
    cost = History.ReadCost()

    def pack(aid: int, streams: Strava.Streams) -> PackedStreams | None:
        """
        Encode one activity's streams and queue it for Mongo.

        An activity we cannot encode gets a tombstone rather than nothing at
        all, so the read we just spent on it is not spent again on the next
        query. Both failures below are permanent properties of the activity --
        an activity with no GPS never grows one -- so both are worth marking.
        """
        try:
            packed = encode_streams(streams)
        except KeyError as e:
            # an activity with a time stream but no GPS or altitude
            log.info("activity %d has no %s stream", aid, e)
            unsaved.append(tombstone_doc(aid, ts=now))
            return None
        except Exception as e:
            # One unencodable activity used to raise out of the generator in
            # the middle of a response that was already partly sent, so the
            # client got a truncated body and no error. Drop the activity
            # instead: the rest of the query still arrives.
            log.exception("could not encode streams for activity %d", aid)
            History.record_soon(
                History.Kind.ERROR,
                f"could not encode streams for activity {aid}: {e}",
                user=user.get(Users.UserField.ID),
                activity=aid,
            )
            unsaved.append(tombstone_doc(aid, ts=now))
            return None
        unsaved.append(mongo_doc(aid, packed, ts=now))
        return packed

    try:
        async for aid, streams in aiterator:
            packed = pack(aid, streams)
            if packed is None:
                continue
            imported += 1

            if len(unsaved) >= INSERT_BATCH:
                batch, unsaved = unsaved, []
                await save(batch)

            yield aid, packed
    finally:
        await aiterator.aclose()
        for aid, streams in leftovers:
            # counted only when it encoded: `imported` says how many streams
            # we actually have, and it is what the history entry reports
            if pack(aid, streams) is not None:
                imported += 1
        if leftovers:
            log.info("saving %d streams fetched but not sent", len(leftovers))
        # shielded, so a cancellation (the client disconnecting) cannot
        # interrupt the write of streams we have already paid for
        await asyncio.shield(save(unsaved))

        # Recorded here rather than in the route, so an import that was
        # abandoned half way still says what it fetched and what it cost
        if imported:
            History.record_soon(
                History.Kind.IMPORT,
                f"imported {imported} of {len(activity_ids)} streams"
                f" ({cost.reads} Strava reads)",
                user=user.get(Users.UserField.ID),
                streams=imported,
                requested=len(activity_ids),
                reads=cost.reads,
            )


@dataclass
class QueryCounts:
    """Where aiter_query's streams came from, filled in as it goes"""

    cached: int = 0
    fetched: int = 0
    # activities we hold a tombstone for: already paid for, and unencodable,
    # so they are neither served nor refetched. Counted so that
    # cached + fetched + unencodable accounts for everything asked for.
    unencodable: int = 0


async def aiter_query(
    activity_ids: list[int], user=None, counts: QueryCounts | None = None
) -> AsyncGenerator[StreamsQueryResult, None]:
    """
    Yield streams for these activities: first whatever Mongo already holds,
    then the rest as Strava sends them.

    Pass `counts` to learn how many were found in Mongo and how many fetched
    from Strava. It is kept up to date as the query runs, so it is still
    right about a query that was stopped part way.

    Activities we hold a tombstone for are yielded by neither route: we have
    already paid a read for them and know they do not encode.

    The Strava import gets a head start, running while the local results are
    sent. Stop early with aclose(), which stops the import too.

    Raises Strava.RateLimitExceeded if Strava's daily budget runs out.
    """
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
    local_result: list[StreamsQueryResult] = []
    # every id Mongo knows about, tombstones included: this is what we do not
    # have to ask Strava for
    mongo_result_ids: list[int] = []
    tombstoned = 0
    async for doc in cursor:
        mongo_result_ids.append(doc["_id"])
        mpk = doc.get("mpk")
        if mpk is None:
            tombstoned += 1
        else:
            local_result.append((doc["_id"], mpk))

    if counts is not None:
        counts.cached = len(local_result)
        counts.unencodable = tombstoned

    if local_result:
        # Reset the TTL clock for the streams we are about to serve.
        #
        # Tombstones are deliberately left out: theirs runs from when it was
        # written, so an activity that failed to encode is retried once per
        # TTL period rather than never again, and a map heals itself after the
        # encoder learns to handle it.
        await streams.update_many(
            {"_id": {"$in": [_id for _id, mpk in local_result]}},
            {"$set": {"ts": datetime.datetime.now(datetime.timezone.utc)}},
        )

    elapsed = (time.perf_counter() - t0) * 1000
    log.debug("retrieved %d streams from Mongo in %d", len(local_result), elapsed)

    # whatever is left has to come from Strava
    activity_ids = list(set(activity_ids) - set(mongo_result_ids))

    streams_import = None
    first_fetch = None
    if activity_ids and (user is not None) and (not OFFLINE):
        # Start the import now, so it is fetching while we send what we have
        t0 = time.perf_counter()
        streams_import = strava_import(activity_ids, **user)
        first_fetch = asyncio.ensure_future(anext(streams_import, None))

    imported = 0
    try:
        for item in local_result:
            yield item

        if streams_import and first_fetch:
            fetched = await first_fetch
            if fetched is not None:
                imported += 1
                if counts is not None:
                    counts.fetched = imported
                yield fetched
                async for item in streams_import:
                    imported += 1
                    if counts is not None:
                        counts.fetched = imported
                    yield item

            log.debug(
                "retrieved %d streams from Strava in %d",
                imported,
                (time.perf_counter() - t0) * 1000,
            )
            if imported < len(activity_ids):
                log.info(
                    "imported %d of %d streams requested",
                    imported,
                    len(activity_ids),
                )
    finally:
        if streams_import and first_fetch:
            if not first_fetch.done():
                # The import is running inside this task, and a generator that
                # is running cannot be closed. Cancelling the task stops it,
                # and runs its cleanup on the way out.
                first_fetch.cancel()
            await asyncio.gather(first_fetch, return_exceptions=True)
            await streams_import.aclose()


async def query(**kwargs) -> list[StreamsQueryResult]:
    return [s async for s in aiter_query(**kwargs)]


async def cached_ids(activity_ids: list[int]) -> list[int]:
    """
    Which of these activities we hold streams for, right now.

    Deliberately does not touch `ts` the way aiter_query does: this only
    reports what is in the cache, and merely looking at the list should not
    extend anything's stay in it.

    Tombstones do not count: the activity list uses this to say which tracks
    are ready to draw, and a tombstone has no track to draw.
    """
    if not activity_ids:
        return []
    streams = await get_collection()
    cursor = streams.find(
        {"_id": {"$in": activity_ids}, "mpk": {"$ne": None}}, projection={"_id": True}
    )
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
