# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
The /activities streaming response: wait notices, and what a client
disconnecting does to the Strava requests behind it.
"""

import asyncio
import time
from contextlib import aclosing

import aiohttp
import msgpack
from sanic import Sanic

from heatflask import RateLimit, Index, Streams
from heatflask.webserver.bp import activities

from conftest import make_user


async def test_no_index_import_means_no_wait(monkeypatch):
    """Every map and list polls for an index import; with none running, the
    poll must not sleep before it finds that out"""
    checks = iter(["page 1", "page 2", None])

    async def check(uid):
        return next(checks)

    monkeypatch.setattr(Index, "check_import_progress", check)
    msgs = [m async for m in Index.import_index_progress(1, poll_delay=0)]
    assert msgs == ["page 1", "page 2"]

    async def idle(uid):
        return None

    monkeypatch.setattr(Index, "check_import_progress", idle)
    t0 = time.monotonic()
    assert [m async for m in Index.import_index_progress(1, poll_delay=5)] == []
    assert time.monotonic() - t0 < 1


async def test_wait_notices_while_stalled_on_the_rate_limit(limiter, monkeypatch):
    monkeypatch.setattr(activities, "WAIT_NOTICE_INTERVAL", 0.2)
    sent = []

    async def send(doc):
        sent.append(doc)

    async def stalled():
        limiter._waiting += 1
        limiter.resume_at = time.time() + 60
        await asyncio.sleep(0.7)
        limiter._waiting -= 1
        yield "item"

    got = [x async for x in activities.with_wait_notices(stalled(), send)]

    assert got == ["item"]
    assert len(sent) >= 2
    assert all(
        doc == {"wait": round(limiter.resume_at), "rationed": False} for doc in sent
    )


async def test_a_wait_notice_says_when_the_athlete_is_rationed(limiter, monkeypatch):
    # so the browser can tell them it is their share of the day, not an outage
    monkeypatch.setattr(activities, "WAIT_NOTICE_INTERVAL", 0.1)
    limiter.tracks_today(7, time.time())
    limiter._today[7] = RateLimit.DAILY_QUOTA
    sent = []

    async def send(doc):
        sent.append(doc)

    async def stalled():
        limiter._waiting += 1
        limiter.resume_at = time.time() + 60
        await asyncio.sleep(0.3)
        limiter._waiting -= 1
        yield "item"

    [x async for x in activities.with_wait_notices(stalled(), send, owner=7)]
    assert sent and all(doc["rationed"] for doc in sent)


async def test_no_wait_notices_when_the_rate_limit_is_not_why(limiter, monkeypatch):
    monkeypatch.setattr(activities, "WAIT_NOTICE_INTERVAL", 0.1)
    sent = []

    async def send(doc):
        sent.append(doc)

    async def slow():
        await asyncio.sleep(0.4)
        yield "item"

    assert [x async for x in activities.with_wait_notices(slow(), send)] == ["item"]
    assert sent == []


async def test_cancelled_handler_closes_what_it_was_reading(limiter):
    closed = []

    async def endless():
        try:
            while True:
                await asyncio.sleep(10)
                yield 1
        finally:
            closed.append(True)

    async def send(doc):
        pass

    async def handler():
        async for _ in activities.with_wait_notices(endless(), send):
            pass

    task = asyncio.create_task(handler())
    await asyncio.sleep(0.2)
    task.cancel()  # what Sanic does when the client disconnects
    await asyncio.gather(task, return_exceptions=True)
    assert closed == [True]


async def test_client_disconnect_stops_strava_requests(
    limiter, strava_server, streams_collection, sanic_server
):
    fake = await strava_server(latency=0.3)
    user = make_user()
    app = Sanic(f"disconnect_test_{time.monotonic_ns()}")
    finished = asyncio.Event()

    @app.post("/q")
    async def q(request):
        response = await request.respond(content_type="application/msgpack")

        def send(doc):
            return response.send(msgpack.packb(doc))

        query = Streams.aiter_query(activity_ids=list(range(300)), user=user)
        items = activities.with_wait_notices(query, send)
        try:
            async with aclosing(items):
                async for aid, _ in items:
                    await send({"_id": aid})
        finally:
            finished.set()

    base = await sanic_server(app)

    async with aiohttp.ClientSession() as session:
        async with session.post(f"{base}/q", json={}) as r:
            received = 0
            async for _ in r.content.iter_any():
                received += 1
                if received >= 3:
                    break
    # leaving the session closes the connection mid-response

    await asyncio.wait_for(finished.wait(), timeout=15)
    at_close = fake.requests
    await asyncio.sleep(1.0)

    assert fake.requests == at_close
    assert at_close < 50  # of 300
    # everything fetched was kept, sent or not
    assert len(streams_collection.docs) >= 10
