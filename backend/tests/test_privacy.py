# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
Who can see which activities.

The filter tests run Index.query against a real MongoDB, because what matters
is how Mongo evaluates the filter ($ne and $nin on missing fields). They use
a throwaway database on localhost, and skip if there is no MongoDB running.
"""

import os
import socket
import time

import aiohttp
import msgpack
import pytest
from pymongo import AsyncMongoClient
from sanic import Sanic

from heatflask import Index, Users
from heatflask.webserver import sessions
from heatflask.webserver.bp import activities, main

F = Index.ActivitySummaryFields
OWNER, OTHER = 1, 2

ACTIVITIES = [
    # (id, owner, private, visibility)
    (10, OWNER, False, "everyone"),
    (11, OWNER, True, "only_me"),
    (12, OWNER, False, "followers"),
    (13, OWNER, None, None),  # an older entry without the fields
    (20, OTHER, False, "everyone"),
    (21, OTHER, True, "everyone"),  # flagged private, whatever visibility says
]


def mongo_is_running() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", 27017), timeout=0.5):
            return True
    except OSError:
        return False


@pytest.fixture
async def index(monkeypatch):
    if not mongo_is_running():
        pytest.skip("no MongoDB on localhost:27017")

    client = AsyncMongoClient("mongodb://127.0.0.1:27017", tz_aware=True)
    db = client[f"heatflask_test_{os.getpid()}_{time.monotonic_ns()}"]
    coll = db["index"]
    docs = []
    for aid, owner, private, visibility in ACTIVITIES:
        doc = {F.ACTIVITY_ID: aid, F.USER_ID: owner, F.UTC_START_TIME: aid}
        if private is not None:
            doc[F.FLAG_PRIVATE] = private
        if visibility is not None:
            doc[F.VISIBILITY] = visibility
        docs.append(doc)
    await coll.insert_many(docs)

    async def get_collection():
        return coll

    monkeypatch.setattr(Index, "get_collection", get_collection)
    yield
    await client.drop_database(db.name)
    await client.close()


async def ids(**query) -> set[int]:
    result = await Index.query(update_index_access=False, **query)
    return {doc[F.ACTIVITY_ID] for doc in result["docs"]}


async def test_anonymous_viewers_see_only_public_activities_of_sharing_athletes(
    index,
):
    assert await ids(privacy=Index.visible_to(None, sharing=[OWNER, OTHER])) == {
        10,
        13,
        20,
    }
    assert await ids(privacy=Index.visible_to(None, sharing=[OTHER])) == {20}
    assert await ids(privacy=Index.visible_to(None, sharing=[])) == set()


async def test_owners_see_all_of_their_own_shared_or_not(index):
    for sharing in ([], [OWNER]):
        assert await ids(privacy=Index.visible_to(OWNER, sharing=sharing)) == {
            10,
            11,
            12,
            13,
        }
    assert await ids(privacy=Index.visible_to(OWNER, sharing=[OTHER])) == {
        10,
        11,
        12,
        13,
        20,
    }


async def test_public_on_strava_is_not_enough_without_sharing(index):
    """OWNER's activity 10 is public on Strava, but OWNER has not opted in"""
    assert await ids(privacy=Index.visible_to(OTHER, sharing=[OTHER])) == {20, 21}


async def test_privacy_holds_when_asking_for_ids_directly(index):
    asked = [11, 12, 21, 20, 10]
    assert await ids(
        activity_ids=asked, privacy=Index.visible_to(OTHER, sharing=[OWNER, OTHER])
    ) == {21, 20, 10}
    assert await ids(
        activity_ids=asked, privacy=Index.visible_to(None, sharing=[OWNER, OTHER])
    ) == {20, 10}
    assert await ids(
        activity_ids=asked, privacy=Index.visible_to(None, sharing=[OTHER])
    ) == {20}


async def test_privacy_holds_with_other_filters_and_exclusions(index):
    async def got(sharing):
        result = await Index.query(
            update_index_access=False,
            user_id=OWNER,
            exclude_ids=[10],
            privacy=Index.visible_to(OTHER, sharing=sharing),
        )
        return {d[F.ACTIVITY_ID] for d in result["docs"]}

    assert await got([OWNER]) == {13}
    assert await got([OTHER]) == set()


async def test_admins_see_everything(index):
    assert await ids() == {a[0] for a in ACTIVITIES}


SHARING = 3  # an athlete who has turned sharing on

USERS = {
    OWNER: {"_id": OWNER, "f": "A", "l": "B", "p": True},
    OTHER: {"_id": OTHER, "f": "C", "l": "D"},  # never asked: counts as not sharing
    SHARING: {"_id": SHARING, "f": "E", "l": "F", "p": False},
}


@pytest.fixture
async def route(monkeypatch, sanic_server):
    """
    POST to /activities with Index and Users faked. Returns what the client
    received and what Index was asked to do.
    """
    calls = {}

    async def fake_query(**kwargs):
        calls["query"] = kwargs
        return {"docs": []}

    async def get_user(uid):
        return USERS.get(int(uid)) if uid else None

    async def sharing_ids():
        return [uid for uid, u in USERS.items() if Users.is_sharing(u)]

    async def has_user_entries(**user):
        return True

    async def has_legacy_entries(**user):
        return False

    async def due_for_update(uid):
        calls["top_up"] = uid
        return False

    async def import_index_progress(uid):
        return
        yield

    monkeypatch.setattr(Index, "query", fake_query)
    monkeypatch.setattr(Index, "has_user_entries", has_user_entries)
    monkeypatch.setattr(Index, "has_legacy_entries", has_legacy_entries)
    monkeypatch.setattr(Index, "due_for_update", due_for_update)
    monkeypatch.setattr(Index, "import_index_progress", import_index_progress)
    monkeypatch.setattr(Users, "get", get_user)
    monkeypatch.setattr(Users, "sharing_ids", sharing_ids)

    app = Sanic(f"privacy_test_{time.monotonic_ns()}")
    app.blueprint(activities.bp)
    url = f"{await sanic_server(app)}/activities/"

    async def post(body, cookie=None):
        calls.clear()
        cookies = {sessions.COOKIE_NAME: cookie} if cookie else None
        async with aiohttp.ClientSession(cookies=cookies) as session:
            async with session.post(url, json=body) as r:
                data = await r.read()
        unpacker = msgpack.Unpacker()
        unpacker.feed(data)
        return list(unpacker), dict(calls)

    return post


def as_user(uid):
    return sessions.sign({"user": uid})


async def test_the_route_sets_privacy_whatever_the_client_sends(route):
    """A client asking for everyone's activities, with its own privacy={}"""
    body = {"activity_ids": [11, 21], "privacy": {}, "private": None}

    async def privacy(cookie=None):
        _, calls = await route(body, cookie)
        return calls["query"].get("privacy")

    assert await privacy() == Index.visible_to(None, sharing=[SHARING])
    assert await privacy(as_user(OWNER)) == Index.visible_to(OWNER, sharing=[SHARING])
    # a forged, unsigned cookie is anonymous
    assert await privacy('{"user": 1}') == Index.visible_to(None, sharing=[SHARING])
    assert await privacy(as_user(Users.ADMIN[0])) is None


async def test_an_unshared_map_is_refused_to_everyone_but_its_owner(route):
    for cookie in (None, as_user(SHARING), '{"user": 1}'):
        for target in (OWNER, OTHER):
            sent, calls = await route({"user_id": target}, cookie)
            assert len(sent) == 1 and "private" in sent[0]["error"]
            # nothing queried, imported or topped up with the owner's token
            assert calls == {}

    sent, calls = await route({"user_id": OWNER}, as_user(OWNER))
    assert "error" not in sent[0]
    assert calls["query"]["privacy"] == Index.visible_to(OWNER, sharing=[])
    assert calls["top_up"] == OWNER

    _, calls = await route({"user_id": OWNER}, as_user(Users.ADMIN[0]))
    assert calls["query"].get("privacy") is None


async def test_a_shared_map_shows_only_its_owners_public_activities(route):
    sent, calls = await route({"user_id": SHARING})
    assert "error" not in sent[0]
    assert calls["query"]["privacy"] == Index.visible_to(None, sharing=[SHARING])
    assert "top_up" not in calls

    _, calls = await route({"user_id": SHARING}, as_user(OWNER))
    assert calls["query"]["privacy"] == Index.visible_to(OWNER, sharing=[SHARING])


def test_the_map_page_names_only_athletes_who_share():
    def info(target, viewer=None, admin=False):
        viewer = USERS[viewer] if viewer else None
        return main.target_info(USERS[target], viewer, admin)

    hidden = {"id": OWNER, "private": True}
    assert info(OWNER) == hidden
    assert info(OWNER, viewer=SHARING) == hidden
    assert info(OTHER) == {"id": OTHER, "private": True}
    assert info(OWNER, viewer=OWNER)["name"] == "A B"
    assert info(OWNER, admin=True)["name"] == "A B"
    assert info(SHARING)["name"] == "E F"
