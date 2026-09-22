# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""Streams: saving what an import fetched, and stopping a query early"""

import asyncio

from heatflask import Streams

from conftest import FakeCollection, make_user


async def test_import_saves_in_batches(limiter, strava_server, streams_collection):
    await strava_server()
    ids = [
        aid async for aid, _ in Streams.strava_import(list(range(120)), **make_user())
    ]
    assert len(ids) == 120
    assert len(streams_collection.docs) == 120
    assert streams_collection.inserts[:2] == [50, 50]


async def test_import_stopped_early_keeps_everything_it_fetched(
    limiter, strava_server, streams_collection
):
    await strava_server(latency=0.05)
    it = Streams.strava_import(list(range(120)), **make_user())
    yielded = 0
    async for _ in it:
        yielded += 1
        if yielded == 73:
            break
    await it.aclose()

    # the 73 sent, plus any that had arrived and were waiting to be
    assert len(streams_collection.docs) >= 73
    assert streams_collection.inserts[0] == 50


async def test_query_closed_while_sending_cached_streams(
    limiter, strava_server, monkeypatch
):
    fake = await strava_server(latency=0.2)
    cached = [{"_id": i, "mpk": b"x"} for i in range(1000, 1010)]
    coll = FakeCollection(cached)

    async def get_collection():
        return coll

    monkeypatch.setattr(Streams, "get_collection", get_collection)

    ids = [d["_id"] for d in cached] + list(range(100))
    it = Streams.aiter_query(activity_ids=ids, user=make_user())
    n = 0
    async for _ in it:
        n += 1
        if n == 3:
            # still sending cached streams; the Strava import has started
            await asyncio.sleep(0.3)
            break
    await it.aclose()  # used to raise "asynchronous generator is already running"

    at_close = fake.requests
    await asyncio.sleep(1.0)
    assert fake.requests == at_close


async def test_query_where_no_stream_can_be_fetched(
    limiter, strava_server, streams_collection
):
    fake = await strava_server()
    fake.no_streams = {1, 2}
    got = [x async for x in Streams.aiter_query(activity_ids=[1, 2], user=make_user())]
    assert got == []


async def test_query_counts_where_its_streams_came_from(
    limiter, strava_server, monkeypatch
):
    await strava_server()
    coll = FakeCollection([{"_id": i, "mpk": b"x"} for i in range(1000, 1004)])

    async def get_collection():
        return coll

    monkeypatch.setattr(Streams, "get_collection", get_collection)

    counts = Streams.QueryCounts()
    ids = [1000, 1001, 1002, 1003] + list(range(6))
    got = [
        x
        async for x in Streams.aiter_query(
            activity_ids=ids, user=make_user(), counts=counts
        )
    ]
    assert len(got) == 10
    assert (counts.cached, counts.fetched) == (4, 6)


async def test_unencodable_activity_is_tombstoned(
    limiter, strava_server, streams_collection
):
    fake = await strava_server()
    fake.no_latlng = {2}

    got = [aid async for aid, _ in Streams.strava_import([1, 2, 3], **make_user())]

    # the activity is not served, but it is not forgotten either
    # (sorted: the import fetches concurrently, so arrival order varies)
    assert sorted(got) == [1, 3]
    assert streams_collection.docs[2]["mpk"] is None
    assert streams_collection.docs[1]["mpk"] is not None


async def test_tombstoned_activity_is_not_refetched(
    limiter, strava_server, streams_collection
):
    fake = await strava_server()
    fake.no_latlng = {2}

    await Streams.query(activity_ids=[1, 2, 3], user=make_user())
    after_first = fake.requests

    # Asking again must cost nothing: all three are settled, one of them by a
    # tombstone. This is the refetch-forever loop that burned a read per
    # render of activity 323533360.
    counts = Streams.QueryCounts()
    got = await Streams.query(activity_ids=[1, 2, 3], user=make_user(), counts=counts)

    assert fake.requests == after_first
    assert sorted(aid for aid, _ in got) == [1, 3]
    assert (counts.cached, counts.fetched, counts.unencodable) == (2, 0, 1)


async def test_tombstone_ttl_is_not_refreshed_when_it_is_read(
    limiter, strava_server, monkeypatch
):
    # A tombstone expires on its own clock so the activity is retried once per
    # TTL period, which is how a map heals after the encoder is fixed.
    coll = FakeCollection([{"_id": 1, "mpk": b"x"}, {"_id": 2, "mpk": None}])
    touched = []

    async def update_many(query, update):
        touched.extend(query["_id"]["$in"])

    coll.update_many = update_many

    async def get_collection():
        return coll

    monkeypatch.setattr(Streams, "get_collection", get_collection)

    await Streams.query(activity_ids=[1, 2])
    assert touched == [1]


async def test_cached_ids_does_not_count_tombstones(monkeypatch):
    coll = FakeCollection([{"_id": 1, "mpk": b"x"}, {"_id": 2, "mpk": None}])

    async def get_collection():
        return coll

    monkeypatch.setattr(Streams, "get_collection", get_collection)

    # the activity list uses this to say which tracks are ready to draw
    assert await Streams.cached_ids([1, 2]) == [1]
