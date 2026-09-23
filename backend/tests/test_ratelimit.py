# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""RateLimit on its own, then paced against a fake Strava"""

import asyncio
import time

import pytest

from heatflask import RateLimit
from heatflask.RateLimit import RateLimiter, RateLimitExceeded

from conftest import WINDOW, make_client, wait_for_window_start

READ_HEADERS = {
    "X-ReadRateLimit-Limit": "600,30000",
    "X-ReadRateLimit-Usage": "120,4000",
    "X-RateLimit-Limit": "3300,165000",
    "X-RateLimit-Usage": "130,4100",
}


def test_parse_pair():
    assert RateLimit.parse_pair("600,30000") == (600, 30000)
    assert RateLimit.parse_pair(None) is None
    assert RateLimit.parse_pair("") is None
    assert RateLimit.parse_pair("garbage") is None


def test_window_boundaries_are_on_the_quarter_hour():
    # 12:07:30 UTC on some day
    now = 1_789_300_000 // 900 * 900 + 7 * 60 + 30
    assert RateLimit.next_window(now) - now == 7 * 60 + 30
    assert RateLimit.next_day(now) % 86400 == 0


def test_report_takes_strava_usage():
    lim = RateLimiter()
    now = time.time()
    lim.report("GET", READ_HEADERS, sent=now)
    assert (lim.read.used_15, lim.read.used_day) == (120, 4000)
    assert (lim.overall.used_15, lim.overall.used_day) == (130, 4100)


def test_report_never_lowers_the_estimate():
    lim = RateLimiter()
    now = time.time()
    lim.read.roll(now)
    lim.read.used_15 = 200  # our estimate includes requests Strava hasn't reported
    lim.report("GET", READ_HEADERS, sent=now)
    assert lim.read.used_15 == 200


def test_report_from_a_closed_window_is_ignored():
    lim = RateLimiter()
    sent_last_window = time.time() - RateLimit.WINDOW
    lim.report("GET", READ_HEADERS, sent=sent_last_window)
    assert lim.read.used_15 == 0


def test_counts_reset_when_the_window_rolls():
    lim = RateLimiter()
    now = time.time()
    lim.read.count(now)
    lim.read.count(now)
    assert lim.read.used_15 == 2
    lim.read.roll(RateLimit.next_window(now) + 1)
    assert lim.read.used_15 == 0
    assert lim.read.used_day in (0, 2)  # 0 only if that boundary was midnight


def test_only_gets_use_the_read_meter():
    lim = RateLimiter()
    assert lim.meters("GET") == (lim.read, lim.overall)
    assert lim.meters("POST") == (lim.overall,)


def test_bulk_waits_and_interactive_raises_at_the_window_limit():
    lim = RateLimiter(reserve=50)
    now = time.time()
    lim.read.roll(now)

    lim.read.used_15 = 560  # inside the reserve
    assert lim.check("GET", bulk=True, now=now) > 0
    assert lim.check("GET", bulk=False, now=now) == 0

    lim.read.used_15 = 600
    with pytest.raises(RateLimitExceeded) as e:
        lim.check("GET", bulk=False, now=now)
    assert not e.value.daily


def test_nothing_waits_for_the_daily_limit():
    lim = RateLimiter(reserve=50)
    now = time.time()
    lim.read.roll(now)
    lim.read.used_day = 29_990
    with pytest.raises(RateLimitExceeded) as e:
        lim.check("GET", bulk=True, now=now)
    assert e.value.daily
    assert e.value.status == 429


def test_refused_spends_the_window():
    lim = RateLimiter()
    now = time.time()
    lim.refused("GET", None, sent=now)
    assert lim.read.used_15 >= lim.read.limit_15


def test_fair_share_holds_back_only_while_someone_else_waits():
    lim = RateLimiter(reserve=50)  # 550 bulk reads a window
    now = time.time()
    lim.reads_by(1, now)
    lim._reads_by[1] = 300

    lim._active.update([1])
    assert not lim.over_fair_share("GET", 1, now)  # alone: no share to keep to

    lim._active.update([2, 2])
    assert lim.over_fair_share("GET", 1, now)  # 300 of a 275 share
    assert not lim.over_fair_share("GET", 2, now)
    assert not lim.over_fair_share("GET", None, now)  # bulk with no owner
    assert not lim.over_fair_share("POST", 1, now)  # not a read

    # a new window starts everyone's share again
    assert not lim.over_fair_share("GET", 1, RateLimit.next_window(now) + 1)


async def test_a_second_import_is_not_starved_by_the_first(
    fast_windows, limiter, strava_server, monkeypatch
):
    monkeypatch.setattr(RateLimit, "FAIR_SHARE_POLL", 0.1)
    await strava_server(limit15=25)  # 20 usable with reserve=5
    await wait_for_window_start()
    t0 = time.time()

    async def run(owner, n):
        ids = list(range(owner * 1000, owner * 1000 + n))
        got = [x async for x in make_client().get_many_streams(ids, owner=owner)]
        return len(got), time.time() - t0

    big = asyncio.create_task(run(1, 60))
    await asyncio.sleep(0.3)  # the first window is already the big one's
    small = await run(2, 10)

    # Half of the second window. Unshared, it got about a third of it, and
    # finished a window later.
    assert small[0] == 10
    assert small[1] < 2 * WINDOW + 1
    assert (await big)[0] == 60
    assert not limiter._active


async def test_paces_across_windows_without_a_single_429(
    fast_windows, limiter, strava_server
):
    fake = await strava_server(limit15=25)  # 20 usable with reserve=5
    await wait_for_window_start()
    t0 = time.time()

    got = [x async for x in make_client().get_many_streams(list(range(60)))]

    assert len(got) == 60
    assert fake.refused == 0
    assert time.time() - t0 > 2 * WINDOW  # needed at least three windows


async def test_usage_from_another_process_is_recovered_from(
    fast_windows, limiter, strava_server
):
    # Another process already spent 22 of 25; the limiter learns it only
    # from response headers, so some requests are refused and retried
    fake = await strava_server(limit15=25, other_usage=22, latency=0.1)
    await wait_for_window_start()

    got = [x async for x in make_client().get_many_streams(list(range(30)))]

    assert len(got) == 30
    assert fake.refused > 0


async def test_waiting_until_is_reported_while_bulk_work_waits(
    fast_windows, limiter, strava_server
):
    await strava_server(limit15=10)  # 5 usable with reserve=5
    await wait_for_window_start()
    seen = []

    async def watch():
        while True:
            seen.append(limiter.waiting_until)
            await asyncio.sleep(0.05)

    watcher = asyncio.create_task(watch())
    # the first 10 go out before any response says the limit is 10
    got = [x async for x in make_client().get_many_streams(list(range(20)))]
    watcher.cancel()

    assert len(got) == 20
    resume_at = [t for t in seen if t]
    assert resume_at
    # each resume time is a window boundary, plus SETTLE
    for t in resume_at:
        assert abs(round((t - 0.1) / WINDOW) * WINDOW - (t - 0.1)) < 0.01
    assert limiter.waiting_until is None


async def test_interactive_request_raises_instead_of_waiting(limiter, strava_server):
    fake = await strava_server()
    now = time.time()
    limiter.read.roll(now)
    limiter.read.used_15 = limiter.read.limit_15

    t0 = time.time()
    with pytest.raises(RateLimitExceeded):
        await make_client().get_activity(1)
    assert time.time() - t0 < 0.5
    assert fake.requests == 0


async def test_spent_daily_budget_stops_an_import(limiter, strava_server):
    fake = await strava_server()
    limiter.read.roll(time.time())
    limiter.read.used_day = limiter.read.limit_day

    with pytest.raises(RateLimitExceeded) as e:
        [x async for x in make_client().get_many_streams(list(range(10)))]
    assert e.value.daily
    assert fake.requests == 0
