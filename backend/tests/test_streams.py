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
