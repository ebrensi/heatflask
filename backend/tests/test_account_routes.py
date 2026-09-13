"""Routes that change a user's account accept POST only"""

import time

import aiohttp
import pytest
from sanic import Sanic

from heatflask import Index, Users
from heatflask.webserver import sessions
from heatflask.webserver.bp import auth, main

USER = 1


@pytest.fixture
async def app_url(monkeypatch, sanic_server):
    calls = []
    users = {USER: {"_id": USER, "p": True, "f": "A", "l": "B"}}

    async def get_user(uid):
        return users.get(int(uid)) if uid else None

    async def add_or_update(**kwargs):
        calls.append(("add_or_update", kwargs))
        users[USER]["p"] = kwargs["private"]
        return users[USER]

    async def delete_user(uid, deauthenticate=True):
        calls.append(("delete", uid, deauthenticate))

    async def delete_user_entries(**user):
        calls.append(("delete_index", user["_id"]))

    monkeypatch.setattr(Users, "get", get_user)
    monkeypatch.setattr(Users, "add_or_update", add_or_update)
    monkeypatch.setattr(Users, "delete", delete_user)
    monkeypatch.setattr(Index, "delete_user_entries", delete_user_entries)

    app = Sanic(f"account_test_{time.monotonic_ns()}")
    app.blueprint(main.bp)
    app.blueprint(auth.bp)
    base = await sanic_server(app)
    return base, calls


def logged_in():
    return {sessions.COOKIE_NAME: sessions.sign({"user": USER})}


async def test_a_get_cannot_change_anything(app_url):
    base, calls = app_url
    async with aiohttp.ClientSession(cookies=logged_in()) as s:
        for path in ("/delete", "/visibility/on", "/visibility/off"):
            async with s.get(base + path, allow_redirects=False) as r:
                assert r.status == 405, path
    assert calls == []


async def test_visibility_changes_on_post(app_url):
    base, calls = app_url
    async with aiohttp.ClientSession(cookies=logged_in()) as s:
        async with s.post(f"{base}/visibility/on") as r:
            assert r.status == 200
            assert await r.json() is True
    assert calls == [("add_or_update", {"_id": USER, "private": False})]


async def test_delete_revokes_strava_access(app_url):
    base, calls = app_url
    async with aiohttp.ClientSession(cookies=logged_in()) as s:
        async with s.post(f"{base}/delete", allow_redirects=False) as r:
            assert r.status == 302
    assert ("delete", USER, True) in calls
    assert ("delete_index", USER) in calls


async def test_nothing_happens_without_a_session(app_url):
    base, calls = app_url
    async with aiohttp.ClientSession() as s:
        async with s.post(f"{base}/delete", allow_redirects=False) as r:
            assert r.status == 400
    assert calls == []
