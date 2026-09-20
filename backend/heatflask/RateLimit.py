# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
RateLimit -- keep Heatflask inside Strava's API rate limits.

Strava meters the *application*, not a server or a user: every request made
with our client ID, from any process, draws on one budget. As of 2026-09-11
the developer dashboard shows

                     15 min      day
    read (GET)          600   30,000
    overall           3,300  165,000

Two things about how Strava meters shape everything here
(https://developers.strava.com/docs/rate-limits/):

  * Every response reports usage so far, in X-ReadRateLimit-Usage and
    X-RateLimit-Usage, each as "15min,daily". That count includes requests
    from every other process on the registration -- the production app, a
    dev server -- which a counter kept here could never see. So we count
    with Strava's numbers, and only estimate in between responses.

  * The short window resets on the clock, at :00, :15, :30 and :45 past the
    hour, and the daily one at midnight UTC. A request refused with 429 still
    counts toward the daily limit, so retrying into a closed window is not
    free.

The policy that follows:

  * Bulk work (stream and index imports) stops RESERVE requests short of
    either limit, so a big backfill cannot lock out logins, index top-ups
    and webhooks. When the 15-minute window is spent it waits for the reset
    rather than failing: a backfill of 3,000 activities takes over an hour
    whatever we do, and waiting is how it finishes.

  * Interactive requests may use the reserve, but never wait: someone is on
    the other end, so they fail at once with RateLimitExceeded.

  * Nothing waits for the daily reset. Holding a request open until midnight
    helps nobody.
"""

import asyncio
import random
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from logging import getLogger
from typing import AsyncIterator, Final, Mapping, Optional

log = getLogger(__name__)
log.propagate = True
log.setLevel("INFO")

WINDOW: Final = 15 * 60
DAY: Final = 24 * 60 * 60

# Requests held back from bulk work, in both windows
RESERVE: Final = 50

# Requests in flight at once, whatever the budget
CONCURRENCY: Final = 10

# Wait this much past a window boundary before trying again, plus up to
# JITTER more, so our clock being slightly ahead of Strava's does not land
# the first request in the old window, and every waiting task does not fire
# in the same instant.
SETTLE: Final = 2.0
JITTER: Final = 3.0


def next_window(now: float) -> float:
    """Epoch seconds at which the current 15-minute window resets"""
    return (now // WINDOW + 1) * WINDOW


def next_day(now: float) -> float:
    """Epoch seconds of the next midnight UTC"""
    return (now // DAY + 1) * DAY


class RateLimitExceeded(Exception):
    """
    Strava's budget is spent, and this request is not going to wait for it.

    Carries `status` and `message` like aiohttp's ClientResponseError, so code
    that reports a Strava error can report this one the same way.
    """

    status = 429

    def __init__(self, resume_at: float, daily: bool = False):
        self.resume_at = resume_at
        self.daily = daily
        when = time.strftime("%H:%M UTC", time.gmtime(resume_at))
        which = "daily" if daily else "15-minute"
        self.message = f"Strava {which} rate limit reached; try again after {when}"
        super().__init__(self.message)


@dataclass
class Meter:
    """One of Strava's two meters, read or overall, as we last knew it."""

    name: str
    limit_15: int
    limit_day: int
    used_15: int = 0
    used_day: int = 0
    # Which 15-minute window and which day the counts belong to, as
    # epoch // WINDOW and epoch // DAY
    window: int = 0
    day: int = 0

    def roll(self, now: float) -> None:
        """Zero whichever counts belong to a window that has since reset"""
        window, day = int(now // WINDOW), int(now // DAY)
        if window != self.window:
            self.window, self.used_15 = window, 0
        if day != self.day:
            self.day, self.used_day = day, 0

    def count(self, now: float) -> None:
        """Estimate one more request, until a response says otherwise"""
        self.roll(now)
        self.used_15 += 1
        self.used_day += 1

    def report(
        self, limit: Optional[tuple[int, int]], usage: Optional[tuple[int, int]]
    ):
        """
        Take what Strava reported.

        Usage only ever moves up within a window. Responses arrive out of
        order, and our estimate already counts requests Strava has not
        reported yet; the larger of the two is the better guess either way.
        """
        if limit:
            self.limit_15, self.limit_day = limit
        if usage:
            self.used_15 = max(self.used_15, usage[0])
            self.used_day = max(self.used_day, usage[1])

    def exhaust_window(self) -> None:
        """Strava refused a request, so this window is spent whatever we thought"""
        self.used_15 = max(self.used_15, self.limit_15)


def parse_pair(value: Optional[str]) -> Optional[tuple[int, int]]:
    """ "600,30000" -> (600, 30000), or None for anything else"""
    if not value:
        return None
    try:
        a, b = value.split(",")
        return int(a), int(b)
    except ValueError:
        return None


class RateLimiter:
    """
    Paces requests against Strava's two meters.

    Use as `async with limiter.slot(method, bulk=...) as sent:` around a
    single request, then pass the response headers to `report()` along with
    `sent`, or to `refused()` if Strava answered 429.
    """

    def __init__(self, reserve: int = RESERVE, concurrency: int = CONCURRENCY):
        self.reserve = reserve
        self.concurrency = concurrency
        # The dashboard's numbers, until the first response reports the real ones
        self.read = Meter("read", 600, 30_000)
        self.overall = Meter("overall", 3_300, 165_000)

        # When waiting bulk work is due to resume, while any is waiting
        self.resume_at: float = 0
        self._waiting = 0

        self._semaphore: Optional[asyncio.Semaphore] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def meters(self, method: str) -> tuple[Meter, ...]:
        # GETs count against the read limit as well as the overall one
        if method.upper() == "GET":
            return (self.read, self.overall)
        return (self.overall,)

    def semaphore(self) -> asyncio.Semaphore:
        # One per event loop: a semaphore is bound to the loop that first
        # waits on it, and the test suite and Sanic's reloader both start more
        # than one
        loop = asyncio.get_running_loop()
        if self._loop is not loop:
            self._semaphore = asyncio.Semaphore(self.concurrency)
            self._loop = loop
        assert self._semaphore is not None
        return self._semaphore

    def check(self, method: str, bulk: bool, now: float) -> float:
        """
        Seconds to wait before this request may go, 0 if it may go now.

        Raises RateLimitExceeded when the day is spent, and for interactive
        requests when the 15-minute window is.
        """
        reserve = self.reserve if bulk else 0
        wait = 0.0
        for meter in self.meters(method):
            meter.roll(now)
            if meter.used_day >= meter.limit_day - reserve:
                raise RateLimitExceeded(next_day(now), daily=True)
            if meter.used_15 >= meter.limit_15 - reserve:
                if not bulk:
                    raise RateLimitExceeded(next_window(now))
                wait = next_window(now) - now
        return wait

    @property
    def waiting_until(self) -> Optional[float]:
        """When waiting bulk work resumes, or None if nothing is waiting"""
        if self._waiting and self.resume_at > time.time():
            return self.resume_at
        return None

    async def wait(self, seconds: float) -> None:
        now = time.time()
        resume_at = now + seconds + SETTLE
        if resume_at > self.resume_at:
            log.info(
                "Strava 15-minute budget spent (read %d/%d); waiting until %s",
                self.read.used_15,
                self.read.limit_15,
                time.strftime("%H:%M:%S", time.localtime(resume_at)),
            )
            self.resume_at = resume_at
        self._waiting += 1
        try:
            await asyncio.sleep(seconds + SETTLE + random.uniform(0, JITTER))
        finally:
            self._waiting -= 1

    @asynccontextmanager
    async def slot(
        self, method: str = "GET", bulk: bool = False
    ) -> AsyncIterator[float]:
        """
        Hold one request's place in the budget. Yields the time it was sent.

        Budget is checked before taking a concurrency slot, and again after:
        a task can queue for the semaphore for a while, and must not hold it
        while it sleeps, or it would stall interactive requests behind it.
        """
        semaphore = self.semaphore()
        while True:
            wait = self.check(method, bulk, time.time())
            if wait:
                await self.wait(wait)
                continue

            await semaphore.acquire()
            try:
                wait = self.check(method, bulk, time.time())
            except BaseException:
                semaphore.release()
                raise
            if not wait:
                break
            semaphore.release()

        try:
            sent = time.time()
            for meter in self.meters(method):
                meter.count(sent)
            yield sent
        finally:
            semaphore.release()

    def report(
        self, method: str, headers: Optional[Mapping[str, str]], sent: float
    ) -> None:
        """Take the usage Strava reported with a response to a request sent at `sent`"""
        if not headers:
            return
        now = time.time()
        # A reading from a request sent before the window reset describes the
        # old window. Taken now, it would stall the new one for no reason.
        if int(sent // WINDOW) != int(now // WINDOW):
            return
        for prefix, meter in (
            ("X-ReadRateLimit", self.read),
            ("X-RateLimit", self.overall),
        ):
            meter.roll(now)
            meter.report(
                parse_pair(headers.get(f"{prefix}-Limit")),
                parse_pair(headers.get(f"{prefix}-Usage")),
            )

    def refused(
        self, method: str, headers: Optional[Mapping[str, str]], sent: float
    ) -> None:
        """Strava answered 429"""
        self.report(method, headers, sent)
        now = time.time()
        if int(sent // WINDOW) != int(now // WINDOW):
            # refused in a window that has already reset
            return
        meter = self.meters(method)[0]
        meter.roll(now)
        meter.exhaust_window()
        log.warning(
            "Strava refused a %s: read %d/%d (day %d/%d), overall %d/%d (day %d/%d)",
            method,
            self.read.used_15,
            self.read.limit_15,
            self.read.used_day,
            self.read.limit_day,
            self.overall.used_15,
            self.overall.limit_15,
            self.overall.used_day,
            self.overall.limit_day,
        )


limiter = RateLimiter()
