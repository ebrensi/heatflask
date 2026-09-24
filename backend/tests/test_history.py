# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
History: what gets recorded, what must never be, and the admin page.

The point of the log is to answer "who was that, and when" after the fact,
so these check the shape of an entry as much as the fact of it.
"""

import asyncio
import datetime
import time

import aiohttp
import pytest
from sanic import Sanic

from heatflask import History, Index, Strava, Streams, Users
from heatflask.webserver import sessions
from heatflask.webserver.bp import activities as activities_bp
from heatflask.webserver.bp import auth as auth_bp
from heatflask.webserver.bp import history as history_bp

from conftest import make_user


class FakeHistoryCollection:
    """The three AsyncCollection methods History uses"""

    def __init__(self):
        self.docs: list[dict] = []
        self.fail = False
        self._seq = 0

    async def insert_one(self, doc):
        if self.fail:
            raise RuntimeError("mongo is having a day")
        self._seq += 1
        self.docs.append(dict(doc, _seq=self._seq))

    def find(self, spec, sort=None, limit=0):
        found = [d for d in self.docs if all(d.get(k) == v for k, v in spec.items())]
        # Insertion order breaks a tie, the way Mongo's $natural order would.
        # Three records in a row can land in the same microsecond, and sorting
        # on the timestamp alone then returned them oldest-first now and again.
        found.sort(key=lambda d: (d["ts"], d["_seq"]), reverse=True)
        if limit:
            found = found[:limit]

        class Cursor:
            async def to_list(self, length=None):
                # copies, as a real driver hands back fresh documents
                return [
                    {k: v for k, v in dict(d, _id=id(d)).items() if k != "_seq"}
                    for d in found
                ]

        return Cursor()


@pytest.fixture
def history(monkeypatch):
    coll = FakeHistoryCollection()

    async def get_collection():
        return coll

    monkeypatch.setattr(History, "get_collection", get_collection)
    return coll


async def drain():
    """Let the fire-and-forget writes land"""
    for _ in range(3):
        await asyncio.sleep(0)


async def test_record_writes_one_entry(history):
    await History.record(History.Kind.ACCOUNT, "hello", user=7, logins=2)

    (doc,) = history.docs
    assert doc["kind"] == "account"
    assert doc["msg"] == "hello"
    assert doc["user"] == 7
    assert doc["logins"] == 2
    # aware UTC, or the TTL index expires entries by the machine's offset
    assert doc["ts"].tzinfo is not None
    assert doc["ts"].utcoffset() == datetime.timedelta(0)


async def test_an_entry_about_nobody_has_no_user(history):
    await History.record(History.Kind.REQUEST, "/")
    assert "user" not in history.docs[0]


async def test_a_broken_collection_does_not_break_the_caller(history):
    history.fail = True
    # the caller is half way through serving somebody; this must not raise
    await History.record(History.Kind.ERROR, "something")
    assert history.docs == []


async def test_record_soon_writes_without_being_awaited(history):
    History.record_soon(History.Kind.IMPORT, "in the background")
    assert history.docs == []
    await drain()
    assert history.docs[0]["msg"] == "in the background"


async def test_recent_filters_and_strips_the_object_id(history):
    await History.record(History.Kind.REQUEST, "one", user=1)
    await History.record(History.Kind.ERROR, "two", user=2)
    await History.record(History.Kind.ERROR, "three", user=1)

    assert [e["msg"] for e in await History.recent(kind=History.Kind.ERROR)] == [
        "three",
        "two",
    ]
    assert [e["msg"] for e in await History.recent(user=1)] == ["three", "one"]
    assert all("_id" not in e for e in await History.recent())


async def test_recent_will_not_return_the_whole_collection(history):
    for i in range(5):
        await History.record(History.Kind.REQUEST, str(i))

    assert len(await History.recent(limit=2)) == 2
    # a hand-typed ?n=999999 is clamped rather than read into memory
    assert await History.recent(limit=10**9) == await History.recent(
        limit=History.MAX_LIMIT
    )


class FakeRequest:
    def __init__(self, admin=False, user=None, path="/activities", query=""):
        self.path = path
        self.query_string = query
        self.method = "POST"
        self.ctx = type("Ctx", (), {})()
        self.ctx.is_admin = admin
        self.ctx.current_user = {"_id": user} if user else None


async def test_log_request_records_who_asked(history):
    History.log_request(FakeRequest(user=99, query="x=1"))
    await drain()

    (doc,) = history.docs
    assert doc["kind"] == "request"
    assert doc["user"] == 99
    assert doc["msg"] == "/activities?x=1"
    assert doc["path"] == "/activities"


async def test_log_request_keeps_no_address(history):
    History.log_request(FakeRequest(user=99))
    await drain()

    recorded = set(history.docs[0])
    assert not recorded & {"ip", "address", "agent", "user_agent"}


async def test_admins_are_not_logged(history):
    # browsing the log must not push what you are looking for out of it
    History.log_request(FakeRequest(admin=True, user=1))
    await drain()
    assert history.docs == []


async def test_a_query_is_filed_under_whose_activities_they_were(history):
    History.log_query(FakeRequest(), 12, "map, viewed by anon: ...", {"sent": 3})
    History.log_query(FakeRequest(user=5), 12, "map, viewed by 5: ...", {"sent": 1})
    History.log_query(FakeRequest(admin=True, user=1), 12, "mine", {})
    await drain()

    anon, viewer = history.docs
    assert anon["user"] == viewer["user"] == 12
    assert anon["stats"] == {"sent": 3, "viewer": None}
    assert viewer["stats"]["viewer"] == 5


def test_a_query_summary_says_what_it_cost():
    s = activities_bp.QuerySummary(owner=12, streams=True, activities=312, sent=312)
    s.counts.cached, s.counts.fetched = 300, 12
    s.seconds = 4.06
    assert s.message(None) == (
        "map, viewed by anon: 312 activities, 300 cached + 12 from Strava, 4.1s"
    )
    assert s.message(12).startswith("map, viewed by owner:")
    assert s.message(5).startswith("map, viewed by 5:")

    s.outcome, s.sent = "closed by the browser", 150
    assert "closed by the browser, sent 150, 4.1s" in s.message(None)

    everyone = activities_bp.QuerySummary(
        what=activities_bp.QueryKind.SUMMARIES, activities=200, excluded=40
    )
    assert everyone.message(5) == (
        "summaries of all athletes, viewed by 5: 200 activities"
        " (+40 already in the browser), 0.0s"
    )


@pytest.mark.parametrize(
    "body, what",
    [
        # the activity list page: the only query asking for stream_status
        ({"streams": False, "stream_status": True, "limit": 0}, "list"),
        # a render with the browser's cache off: one query for everything
        ({"streams": True}, "map"),
        # a cached render's first query, summaries only
        ({"streams": False}, "summaries"),
        # and its second, for the tracks the browser lacks
        ({"streams": True, "activity_ids": [3], "browser_hits": 0}, "tracks"),
    ],
)
async def test_a_query_is_named_for_what_asked_for_it(query_route, body, what):
    # A cached render's summaries used to be called "list", the same as a
    # visit to the activity list page
    entry = await query_route({"user_id": 12, **body})
    assert entry["msg"].startswith(f"{what}, viewed by anon:")
    assert entry["stats"]["what"] == what


@pytest.fixture
async def query_route(monkeypatch, sanic_server, history):
    """POST /activities with Index, Users and Streams faked; returns the entry"""
    athletes = {12: {"_id": 12, "p": False}, 13: {"_id": 13, "p": True}}

    seen: dict = {}

    async def fake_query(**kwargs):
        seen.clear()
        seen.update(kwargs)
        return {"docs": [{"_id": i} for i in range(5)]}

    async def get_user(uid):
        return athletes.get(int(uid)) if uid else None

    async def yes(*args, **kwargs):
        return True

    async def no(*args, **kwargs):
        return False

    async def no_progress(uid):
        return
        yield

    async def sharing_ids():
        return [12]

    async def aiter_query(activity_ids, user=None, counts=None):
        counts.cached = 2
        for aid in activity_ids:
            if aid >= 2:
                counts.fetched += 1
            yield aid, b"x"

    monkeypatch.setattr(Index, "query", fake_query)
    monkeypatch.setattr(Index, "has_user_entries", yes)
    monkeypatch.setattr(Index, "has_legacy_entries", no)
    monkeypatch.setattr(Index, "due_for_update", no)
    monkeypatch.setattr(Index, "import_index_progress", no_progress)
    monkeypatch.setattr(Users, "get", get_user)
    monkeypatch.setattr(Users, "sharing_ids", sharing_ids)
    monkeypatch.setattr(Streams, "aiter_query", aiter_query)

    app = Sanic(f"history_query_test_{time.monotonic_ns()}")
    app.blueprint(activities_bp.bp)
    url = f"{await sanic_server(app)}/activities/"

    async def post(body):
        history.docs.clear()
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=body) as r:
                await r.read()
        for _ in range(50):
            if history.docs:
                break
            await asyncio.sleep(0.01)
        (entry,) = history.docs
        return entry

    # what the route handed Index.query on the last POST
    post.index_query_kwargs = seen
    return post


async def test_a_map_query_is_recorded_once_it_is_over(query_route):
    entry = await query_route({"user_id": 12, "streams": True, "exclude_ids": [9]})

    assert entry["kind"] == History.Kind.REQUEST
    assert entry["user"] == 12
    assert entry["msg"].startswith(
        "map, viewed by anon: 5 activities (+1 already in the browser),"
        " 2 cached + 3 from Strava,"
    )
    stats = entry["stats"]
    assert stats["viewer"] is None
    assert (stats["activities"], stats["sent"]) == (5, 5)
    assert (stats["cached"], stats["fetched"]) == (2, 3)
    assert stats["outcome"] == "ok"
    # the path and method said nothing the route does not
    assert "path" not in entry and "method" not in entry


async def test_a_refused_map_is_recorded_as_refused(query_route):
    entry = await query_route({"user_id": 13, "streams": True})
    assert entry["user"] == 13
    assert entry["stats"]["outcome"] == "refused: private"
    assert "refused: private" in entry["msg"]


def test_read_cost_counts_each_request_sent():
    cost = History.ReadCost()
    for _ in range(3):
        cost.sent()
    assert cost.reads == 3


async def test_a_streams_import_records_what_it_fetched(
    limiter, strava_server, streams_collection, history
):
    await strava_server()
    ids = [
        aid async for aid, _ in Streams.strava_import(list(range(10)), **make_user())
    ]
    await drain()

    assert len(ids) == 10
    (entry,) = [d for d in history.docs if d["kind"] == History.Kind.IMPORT]
    assert entry["streams"] == 10
    assert entry["requested"] == 10
    assert entry["user"] == 1
    assert entry["reads"] == 10


async def test_imports_side_by_side_are_charged_only_their_own_reads(
    limiter, strava_server, streams_collection, history
):
    # Each import's cost was the rise in the app-wide daily meter while it
    # ran, so two at once were each charged for both
    await strava_server()

    async def run(n, uid):
        return [
            aid
            async for aid, _ in Streams.strava_import(
                list(range(uid * 1000, uid * 1000 + n)), **make_user(uid)
            )
        ]

    await asyncio.gather(run(12, 1), run(5, 2))
    await drain()

    imports = [d for d in history.docs if d["kind"] == History.Kind.IMPORT]
    assert {d["user"]: d["reads"] for d in imports} == {1: 12, 2: 5}
    assert "(12 Strava reads)" in next(d["msg"] for d in imports if d["user"] == 1)


async def test_an_index_import_counts_its_own_pages(
    limiter, strava_server, monkeypatch, history
):
    await strava_server(n_activities=450)

    class FakeIndex:
        async def insert_many(self, docs, ordered=True):
            class R:
                inserted_ids = [d["_id"] for d in docs]

            return R()

    async def get_collection():
        return FakeIndex()

    async def nothing(*args, **kwargs):
        return None

    monkeypatch.setattr(Index, "get_collection", get_collection)
    # the fake's activities are bare ids, which mongo_doc rightly rejects
    monkeypatch.setattr(Index, "mongo_doc", lambda id, **rest: {"_id": id})
    monkeypatch.setattr(Index, "delete_user_entries", nothing)
    monkeypatch.setattr(Index, "set_import_flag", nothing)
    monkeypatch.setattr(Index, "clear_import_flag", nothing, raising=False)
    monkeypatch.setattr(Index, "check_import_progress", nothing)
    # something else spending reads meanwhile must not be charged to it
    limiter.read.used_day = 1_000

    await Index.import_user_entries(**make_user(7))
    await drain()

    (entry,) = [d for d in history.docs if d["kind"] == History.Kind.IMPORT]
    # 450 activities at 200 a page. Page 1 goes alone, then a batch of
    # PAGE_BATCH at once, and every page sent is charged, empty or not
    assert entry["reads"] == 1 + Strava.PAGE_BATCH


def make_app(monkeypatch, admin: bool):
    app = Sanic(f"history_test_{time.monotonic_ns()}")
    app.blueprint(history_bp.bp)
    # the page sends a non-admin to log in, so that route has to exist
    app.blueprint(auth_bp.bp)

    async def get(user_id):
        return {"_id": int(user_id)}

    monkeypatch.setattr(Users, "get", get)
    monkeypatch.setattr(Users, "is_admin", lambda uid: admin)
    return app


async def test_the_page_is_not_for_everyone(sanic_server, monkeypatch, history):
    app = make_app(monkeypatch, admin=False)
    base = await sanic_server(app)
    cookie = {sessions.COOKIE_NAME: sessions.sign({"user": 2})}

    async with aiohttp.ClientSession(cookies=cookie) as session:
        async with session.get(f"{base}/history", allow_redirects=False) as r:
            # sent to log in as somebody who may read it, not shown the log
            assert r.status in (301, 302, 303, 307)
            assert "/history" not in await r.text()


async def test_an_admin_sees_the_entries(sanic_server, monkeypatch, history):
    await History.record(History.Kind.ERROR, "could not encode streams", user=42)
    app = make_app(monkeypatch, admin=True)
    base = await sanic_server(app)
    cookie = {sessions.COOKIE_NAME: sessions.sign({"user": 1})}

    async with aiohttp.ClientSession(cookies=cookie) as session:
        async with session.get(f"{base}/history") as r:
            page = await r.text()
        async with session.get(f"{base}/history?output=json") as r:
            entries = await r.json()

    assert "could not encode streams" in page
    assert 'href="/42"' in page
    assert entries[0]["msg"] == "could not encode streams"


async def test_the_page_escapes_what_it_was_told(sanic_server, monkeypatch, history):
    # an activity name is whatever its owner typed, and it reaches an error
    # entry through the exception message
    await History.record(History.Kind.ERROR, "<script>alert(1)</script>", user=42)
    app = make_app(monkeypatch, admin=True)
    base = await sanic_server(app)
    cookie = {sessions.COOKIE_NAME: sessions.sign({"user": 1})}

    async with aiohttp.ClientSession(cookies=cookie) as session:
        async with session.get(f"{base}/history") as r:
            page = await r.text()

    assert "<script>alert(1)</script>" not in page
    assert "&lt;script&gt;" in page


async def test_browser_cache_hits_are_recorded(query_route):
    # A render mostly served from IndexedDB: the browser asks only for what it
    # missed, so without this the history said "2 activities" and gave no sign
    # that 400 more were drawn.
    entry = await query_route(
        {"user_id": 12, "streams": True, "activity_ids": [0, 1], "browser_hits": 400}
    )

    assert entry["stats"]["excluded"] == 400
    assert "(+400 already in the browser)" in entry["msg"]


async def test_browser_hits_is_not_passed_to_the_index_query(query_route):
    # It is a report, not a filter. Index.query takes the request's leftover
    # keys as kwargs, so anything not popped becomes a TypeError.
    await query_route({"user_id": 12, "streams": True, "browser_hits": 7})
    assert "browser_hits" not in query_route.index_query_kwargs
