"""
What /<athlete_id> does for an athlete we no longer have.

Old bookmarks and links shared years ago still arrive, and triage retires the
users behind them, so this is a normal thing to happen, not an error.
"""

import time

import aiohttp
import pytest
from sanic import Sanic

from heatflask import History, Users
from heatflask.webserver import sessions
from heatflask.webserver.bp import main

GONE = 4347315


@pytest.fixture
async def base_url(monkeypatch, sanic_server):
    async def no_such_user(uid):
        return None

    monkeypatch.setattr(Users, "get", no_such_user)
    # the history entries this made, without a MongoDB to write them to
    recorded = []
    monkeypatch.setattr(
        History,
        "record_soon",
        lambda kind, msg, user=None, **extra: recorded.append((kind, msg, user, extra)),
    )

    app = Sanic(f"user_page_test_{time.monotonic_ns()}")
    app.blueprint(main.bp)
    return await sanic_server(app), recorded


async def test_an_unregistered_athlete_goes_to_the_splash_page(base_url):
    base_url, recorded = base_url
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{base_url}/{GONE}", allow_redirects=False) as r:
            assert r.status == 302
            assert r.headers["Location"] == "/"
            cookie = r.cookies[sessions.COOKIE_NAME].value

    # the message the splash page will show, carried in the session cookie
    flashes = sessions.unsign(cookie)["flashes"]
    assert flashes == [f"Strava athlete {GONE} is not registered with Heatflask"]

    # and the hit is in the history log, since the redirect leaves nothing else
    assert len(recorded) == 1
    kind, msg, user, extra = recorded[0]
    assert kind == History.Kind.REQUEST
    assert msg == f"link to unregistered athlete {GONE}"
    assert user is None
    assert extra["athlete"] == GONE
    assert extra["path"] == f"/{GONE}"
