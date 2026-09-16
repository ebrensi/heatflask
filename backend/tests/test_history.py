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

from heatflask import History, Streams, Users
from heatflask.webserver import sessions
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


def test_read_cost_counts_what_strava_charged(limiter):
    limiter.read.used_day = 100
    cost = History.ReadCost()
    limiter.read.used_day = 143
    assert cost.reads == 43


def test_read_cost_is_never_negative(limiter):
    limiter.read.used_day = 100
    cost = History.ReadCost()
    # the daily meter rolled over mid-import
    limiter.read.used_day = 0
    assert cost.reads == 0


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
    assert entry["reads"] >= 0


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
