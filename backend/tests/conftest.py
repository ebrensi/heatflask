"""
Shared fixtures: a fake Strava, a fresh rate limiter with windows shrunk from
15 minutes to seconds, and an in-memory stand-in for a Mongo collection.

Run from the repo root, inside the dev shell (numpy needs its libraries):

    nix develop -c bash -c "source backend/.venv/heatflask/bin/activate && pytest backend/tests"

Nothing touches the network beyond 127.0.0.1. test_privacy.py uses a MongoDB
on localhost if one is running, in a throwaway database, and skips otherwise;
nothing else needs one.
"""

import asyncio
import os
import socket
import sys
import time
from pathlib import Path

import pytest

# Strava.py reads these at import
os.environ.setdefault("STRAVA_CLIENT_ID", "1")
os.environ.setdefault("STRAVA_CLIENT_SECRET", "test-secret")
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from aiohttp import web  # noqa: E402

from heatflask import RateLimit, Strava  # noqa: E402

# One "15-minute" window, in seconds, for tests that pace across windows
WINDOW = 2


class FakeStrava:
    """
    Enough of Strava's API for the import paths: streams, the activity list,
    and single activities, with rate-limit headers and 429s like the real one.

    `other_usage` is requests some other process on the same registration has
    already made in the first window -- usage our limiter cannot know about
    until a response reports it.
    """

    def __init__(self, limit15=10_000, other_usage=0, latency=0.02, n_activities=0):
        self.limit15 = limit15
        self.other_usage = other_usage
        self.latency = latency
        self.n_activities = n_activities
        self.usage: dict[int, int] = {}
        self.requests = 0
        self.refused = 0
        self.no_streams: set[int] = set()
        # what GET /activities/{id} answers: this status, and these fields over
        # a public ride with a track
        self.activity_status = 200
        self.activity_fields: dict = {}
        self.url = ""

    def count(self) -> int:
        window = int(time.time() // RateLimit.WINDOW)
        if window not in self.usage:
            self.usage[window] = 0 if self.usage else self.other_usage
        self.usage[window] += 1
        return self.usage[window]

    def headers(self, used: int) -> dict[str, str]:
        return {
            "X-ReadRateLimit-Limit": f"{self.limit15},30000",
            "X-ReadRateLimit-Usage": f"{used},{used}",
            "X-RateLimit-Limit": "3300,165000",
            "X-RateLimit-Usage": f"{used},{used}",
        }

    def metered(self):
        self.requests += 1
        used = self.count()
        if used > self.limit15:
            self.refused += 1
            return None, used
        return True, used

    async def streams(self, request):
        ok, used = self.metered()
        if not ok:
            return web.json_response(
                {"message": "Rate Limit Exceeded"},
                status=429,
                headers=self.headers(used),
            )
        await asyncio.sleep(self.latency)
        aid = int(request.match_info["id"])
        if aid in self.no_streams:
            return web.json_response({"message": "Not Found"}, status=404)
        n = 3
        body = {
            "time": {"data": list(range(n)), "original_size": n},
            "altitude": {"data": [1.0] * n},
            "latlng": {"data": [[45.0 + i * 1e-4, -122.0] for i in range(n)]},
        }
        return web.json_response(body, headers=self.headers(used))

    async def activities(self, request):
        ok, used = self.metered()
        await asyncio.sleep(self.latency)
        page = int(request.query["page"])
        per = int(request.query["per_page"])
        start = (page - 1) * per
        ids = range(start, min(start + per, self.n_activities))
        return web.json_response([{"id": i} for i in ids], headers=self.headers(used))

    async def activity(self, request):
        ok, used = self.metered()
        if self.activity_status != 200:
            return web.json_response({"message": "no"}, status=self.activity_status)
        body = {
            "id": int(request.match_info["id"]),
            "athlete": {"id": 1},
            "name": "Morning Ride",
            "start_date": "2026-09-13T08:00:00Z",
            "private": False,
            "visibility": "everyone",
            "map": {"summary_polyline": "_p~iF~ps|U_ulLnnqC"},
            **self.activity_fields,
        }
        return web.json_response(body, headers=self.headers(used))


@pytest.fixture
def fast_windows(monkeypatch):
    """Shrink Strava's 15-minute window to WINDOW seconds"""
    monkeypatch.setattr(RateLimit, "WINDOW", WINDOW)
    monkeypatch.setattr(RateLimit, "SETTLE", 0.1)
    monkeypatch.setattr(RateLimit, "JITTER", 0.1)


@pytest.fixture
def limiter(monkeypatch):
    """A fresh limiter in place of the module-wide one"""
    lim = RateLimit.RateLimiter(reserve=5, concurrency=10)
    monkeypatch.setattr(RateLimit, "limiter", lim)
    monkeypatch.setattr(Strava, "limiter", lim)
    return lim


@pytest.fixture
async def strava_server(monkeypatch):
    """Start a FakeStrava; call the fixture with its constructor arguments"""
    runners = []

    async def start(**kwargs) -> FakeStrava:
        fake = FakeStrava(**kwargs)
        app = web.Application()
        app.router.add_get("/api/v3/activities/{id}/streams", fake.streams)
        app.router.add_get("/api/v3/activities/{id}", fake.activity)
        app.router.add_get("/api/v3/athlete/activities", fake.activities)
        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]
        fake.url = f"http://127.0.0.1:{port}"
        monkeypatch.setattr(Strava, "DOMAIN", fake.url)
        runners.append(runner)
        return fake

    yield start
    for runner in runners:
        await runner.cleanup()


class FakeCollection:
    """The handful of AsyncCollection methods the streams code uses"""

    def __init__(self, docs=()):
        self.docs = {d["_id"]: d for d in docs}
        self.inserts: list[int] = []

    async def insert_many(self, docs, ordered=True):
        self.inserts.append(len(docs))
        for d in docs:
            self.docs[d["_id"]] = d

    def find(self, query, projection=None):
        ids = query["_id"]["$in"]
        found = [self.docs[i] for i in ids if i in self.docs]

        async def cursor():
            for d in found:
                yield d

        return cursor()

    async def update_many(self, *args, **kwargs):
        pass

    async def delete_many(self, query):
        for i in query["_id"]["$in"]:
            self.docs.pop(i, None)


@pytest.fixture
def streams_collection(monkeypatch):
    from heatflask import Streams

    coll = FakeCollection()

    async def get_collection():
        return coll

    monkeypatch.setattr(Streams, "get_collection", get_collection)
    return coll


def make_client() -> Strava.AsyncClient:
    client = Strava.AsyncClient("test")
    client.access_token = "token"
    return client


def make_user(uid=1) -> dict:
    # an access token good for a while, so no refresh is attempted
    return {
        "_id": uid,
        "@": {
            "access_token": "token",
            "refresh_token": "refresh",
            "expires_at": time.time() + 3600,
        },
    }


async def wait_for_window_start():
    """Start just after a boundary, so a test's windows are predictable"""
    now = time.time()
    await asyncio.sleep(RateLimit.next_window(now) - now + 0.05)


@pytest.fixture
async def sanic_server():
    """
    Serve a Sanic app on a free port; call with the app, get back its base URL.

    Two Sanic quirks this works around: port=0 is treated as unset and binds
    8000, which the dev server is usually using; and Sanic's "touchup", which
    rewrites some of its own methods when a server starts, fails the second
    time it runs in one process (KeyError: '_run_response_middleware').
    """
    servers = []

    async def start(app) -> str:
        app.config.TOUCHUP = False
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        server = await app.create_server(
            host="127.0.0.1", port=port, return_asyncio_server=True
        )
        await server.startup()
        await server.before_start()
        await server.after_start()
        servers.append(server)
        return f"http://127.0.0.1:{port}"

    yield start
    for server in servers:
        await server.close()
