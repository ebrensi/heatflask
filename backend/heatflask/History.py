# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
History -- a short-term record of what the server did, and for whom.

Heroku's log buffer holds minutes, not days. The stream-encoder failure of
2026-09-16 had rolled out of it before anyone could ask which athlete's
activity had caused it, and there was nowhere else to look. This is that
somewhere.

Four kinds of entry:

    request   a page or a query somebody asked for
    import    an index or streams import that finished, and what it cost in
              Strava reads
    account   authentications, logouts, deletions, deauthorizations
    error     something a person should look at

This is the 2020 EventLogger, which wrote to a collection called `history`
and was read at /events, brought back with two deliberate differences.

Entries expire by TTL rather than filling a 2MB capped collection: the cap
held about a day of history at current traffic, and which day was whatever
happened to fit.

IP addresses and user-agent strings are not recorded. The old logger kept
both on every request. A user id is ours already; an address is the reader's,
and this collection lives in the same Atlas database as everything else.

Nothing here may break a request. record() swallows and logs its own errors,
and record_soon() does the write off to one side, so a Mongo hiccup costs a
history entry and nothing more.
"""

import asyncio
import datetime
import os
import types
from logging import getLogger
from typing import Optional

import pymongo

from . import DataAPIs

log = getLogger(__name__)
log.propagate = True
log.setLevel("INFO")

COLLECTION_NAME = "history_v0"

SECS_IN_DAY = 24 * 60 * 60

# How long an entry lives. A month covers "what happened over the weekend",
# which is the question the log exists to answer.
TTL = int(os.environ.get("HISTORY_TTL", 30)) * SECS_IN_DAY

# What a single query for the page will return at most
DEFAULT_LIMIT = 200
MAX_LIMIT = 2000


class Kind:
    REQUEST = "request"
    IMPORT = "import"
    ACCOUNT = "account"
    ERROR = "error"


ALL_KINDS = (Kind.REQUEST, Kind.IMPORT, Kind.ACCOUNT, Kind.ERROR)

myBox = types.SimpleNamespace(collection=None, tasks=set())


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(COLLECTION_NAME, ttl=TTL)
    return myBox.collection


def now() -> datetime.datetime:
    # aware UTC: `ts` drives the TTL index, and .now() without a timezone
    # writes local time, expiring entries early or late by the offset
    return datetime.datetime.now(datetime.timezone.utc)


async def record(kind: str, msg: str, user: Optional[int] = None, **extra) -> None:
    """
    Write one entry.

    Never raises: the caller is in the middle of serving somebody, and a log
    that can take a request down with it is worse than no log.
    """
    doc = {"ts": now(), "kind": kind, "msg": msg}
    if user is not None:
        doc["user"] = int(user)
    doc.update(extra)

    try:
        coll = await get_collection()
        await coll.insert_one(doc)
    except Exception:
        log.exception("could not record history entry %s", doc)


def record_soon(kind: str, msg: str, user: Optional[int] = None, **extra) -> None:
    """
    record(), off the caller's critical path.

    The task is held in a set until it finishes: asyncio keeps only a weak
    reference to a bare task, and one that nobody holds can be collected
    mid-await, which loses the entry silently.
    """
    try:
        task = asyncio.ensure_future(record(kind, msg, user, **extra))
    except RuntimeError:
        # no running loop: nothing to do this from, so drop it
        log.debug("no event loop for history entry: %s", msg)
        return
    myBox.tasks.add(task)
    task.add_done_callback(myBox.tasks.discard)


def viewer_of(request) -> tuple[bool, Optional[int]]:
    """
    (is_admin, user id or None) for whoever made this request.

    Requires session_cookie() to have run first -- that is what puts
    current_user and is_admin on request.ctx. Anywhere else it reads as an
    anonymous non-admin rather than raising.
    """
    ctx = getattr(request, "ctx", None)
    user = getattr(ctx, "current_user", None)
    return getattr(ctx, "is_admin", False), (user["_id"] if user else None)


def log_request(request, msg: Optional[str] = None, **extra) -> None:
    """
    Record one request.

    Admins are skipped, as they were in 2020: the log is there to show what
    other people are doing with the app, and browsing it yourself should not
    push the evidence out of it.
    """
    is_admin, viewer = viewer_of(request)
    if is_admin:
        return

    path = request.path
    if request.query_string:
        path = f"{path}?{request.query_string}"

    record_soon(
        Kind.REQUEST,
        msg or path,
        user=viewer,
        path=request.path,
        method=request.method,
        **extra,
    )


def log_query(request, owner: Optional[int], msg: str, stats: dict) -> None:
    """
    Record one activity query, once it has finished.

    Unlike log_request, the entry's user is the athlete whose activities were
    asked for, not whoever asked: a map is usually looked at by someone
    anonymous, so "anon asked for /activities" said nothing, while "athlete 12
    was looked at, and it cost 40 Strava reads" is the thing worth knowing.
    The viewer goes in `stats`, along with the counts that `msg` spells out.
    Admins are skipped, as in log_request.
    """
    is_admin, viewer = viewer_of(request)
    if is_admin:
        return
    record_soon(Kind.REQUEST, msg, user=owner, stats=dict(stats, viewer=viewer))


class ReadCost:
    """
    How many Strava reads one piece of work has sent.

        cost = History.ReadCost()
        async for A in strava.get_all_activities(on_sent=cost.sent):
            ...
        cost.reads

    Counted request by request, through the `on_sent` hook every Strava call
    takes, so a retry after a 429 counts too: Strava charges for those.

    This used to be the rise in the app's daily meter between the start of the
    work and its end. The meter is shared by everything the app does, so an
    import running alongside another athlete's was charged for both: an index
    of 2,243 activities, a dozen pages, was recorded as costing 1,096 reads.

    A plain object rather than a context manager, because the work it
    measures usually ends in a finally clause that has to report after the
    block it is attached to has already unwound.
    """

    def __init__(self):
        self.reads = 0

    def sent(self) -> None:
        self.reads += 1


SORT_SPEC = [("ts", pymongo.DESCENDING)]


async def recent(
    limit: int = DEFAULT_LIMIT,
    kind: Optional[str] = None,
    user: Optional[int] = None,
) -> list[dict]:
    """The newest entries first, optionally of one kind or about one user."""
    coll = await get_collection()

    spec: dict = {}
    if kind:
        spec["kind"] = kind
    if user is not None:
        spec["user"] = int(user)

    limit = max(1, min(int(limit), MAX_LIMIT))
    docs = await coll.find(spec, sort=SORT_SPEC, limit=limit).to_list(length=None)
    for d in docs:
        d.pop("_id", None)
    return docs


async def stats():
    return await DataAPIs.stats(COLLECTION_NAME)
