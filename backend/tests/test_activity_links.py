# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
Short activity links, /a/<id>: where they lead, who can make one permanent,
and that a permanent one outlives the index entry it was made from.

Run against a throwaway database on a local MongoDB, like test_privacy.py, and
skipped without one.
"""

import os
import time

import aiohttp
import pytest
from pymongo import AsyncMongoClient
from sanic import Sanic

from heatflask import History, Index, Links, Users
from heatflask.webserver import sessions
from heatflask.webserver.bp import main

from test_privacy import mongo_is_running

F = Index.ActivitySummaryFields
OWNER, OTHER = 1, 2
ACTIVITY = 10


@pytest.fixture
async def base(monkeypatch, sanic_server):
    if not mongo_is_running():
        pytest.skip("no MongoDB on localhost:27017")
    client = AsyncMongoClient("mongodb://127.0.0.1:27017", tz_aware=True)
    db = client[f"heatflask_test_{os.getpid()}_{time.monotonic_ns()}"]
    index, links = db["index"], db["links"]
    await index.insert_one({F.ACTIVITY_ID: ACTIVITY, F.USER_ID: OWNER})

    async def get_index():
        return index

    async def get_links():
        return links

    monkeypatch.setattr(Index, "get_collection", get_index)
    monkeypatch.setattr(Links, "get_collection", get_links)
    monkeypatch.setattr(History, "log_request", lambda *a, **k: None)

    async def get_user(uid):
        return {"_id": int(uid)} if uid else None

    monkeypatch.setattr(Users, "get", get_user)

    app = Sanic(f"links_test_{time.monotonic_ns()}")
    app.blueprint(main.bp)
    yield await sanic_server(app), index
    await client.drop_database(db.name)
    await client.close()


def as_user(uid):
    return {sessions.COOKIE_NAME: sessions.sign({"user": uid})}


async def where(s, url) -> str:
    async with s.get(url, allow_redirects=False) as r:
        assert r.status == 302
        return r.headers["Location"]


async def test_link_leads_to_the_owners_map_of_that_activity_tilted(base):
    url, _ = base
    async with aiohttp.ClientSession() as s:
        assert await where(s, f"{url}/a/{ACTIVITY}") == (
            f"/{OWNER}?id={ACTIVITY}&pitch={main.LINK_PITCH}"
        )
        # one Heatflask has never seen goes to the splash page
        assert await where(s, f"{url}/a/99") == "/"


async def test_only_the_owner_can_make_a_link_permanent(base):
    url, _ = base
    async with aiohttp.ClientSession() as s:
        async with s.post(f"{url}/a/{ACTIVITY}") as r:
            assert r.status == 401
    async with aiohttp.ClientSession(cookies=as_user(OTHER)) as s:
        async with s.post(f"{url}/a/{ACTIVITY}") as r:
            assert r.status == 403
    async with aiohttp.ClientSession(cookies=as_user(OWNER)) as s:
        async with s.post(f"{url}/a/99") as r:
            assert r.status == 403
        async with s.post(f"{url}/a/{ACTIVITY}") as r:
            assert r.status == 200


async def test_a_permanent_link_outlives_the_index_and_not_the_account(base):
    url, index = base
    async with aiohttp.ClientSession(cookies=as_user(OWNER)) as s:
        async with s.post(f"{url}/a/{ACTIVITY}") as r:
            assert r.status == 200

    await index.delete_many({})  # the index entry expires
    async with aiohttp.ClientSession() as s:
        assert (await where(s, f"{url}/a/{ACTIVITY}")).startswith(f"/{OWNER}?")

        await Links.delete_user_links(OWNER)  # the athlete leaves
        assert await where(s, f"{url}/a/{ACTIVITY}") == "/"
