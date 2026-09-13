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
from heatflask.webserver.bp import activities

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


async def test_anonymous_viewers_see_only_public_activities(index):
    assert await ids(privacy=Index.visible_to(None)) == {10, 13, 20}


async def test_owners_see_all_of_their_own(index):
    assert await ids(privacy=Index.visible_to(OWNER)) == {10, 11, 12, 13, 20}


async def test_privacy_holds_when_asking_for_ids_directly(index):
    asked = [11, 12, 21, 20]
    assert await ids(activity_ids=asked, privacy=Index.visible_to(OTHER)) == {
        21,
        20,
    }
    assert await ids(activity_ids=asked, privacy=Index.visible_to(None)) == {20}


async def test_privacy_holds_with_other_filters_and_exclusions(index):
    got = await Index.query(
        update_index_access=False,
        user_id=OWNER,
        exclude_ids=[10],
        privacy=Index.visible_to(OTHER),
    )
    assert {d[F.ACTIVITY_ID] for d in got["docs"]} == {13}


async def test_admins_see_everything(index):
    assert await ids() == {a[0] for a in ACTIVITIES}


async def test_the_route_sets_privacy_whatever_the_client_sends(
    monkeypatch, sanic_server
):
    """A client asking for everyone's activities, with its own privacy={}"""
    captured = {}

    async def fake_query(**kwargs):
        captured.update(kwargs)
        return {"docs": []}

    async def get_user(uid):
        return {"_id": int(uid), "f": "A", "l": "B"} if uid else None

    monkeypatch.setattr(Index, "query", fake_query)
    monkeypatch.setattr(Users, "get", get_user)

    app = Sanic(f"privacy_test_{time.monotonic_ns()}")
    app.blueprint(activities.bp)
    url = f"{await sanic_server(app)}/activities/"
    body = {"activity_ids": [11, 21], "privacy": {}, "private": None}

    async def post(cookie=None):
        captured.clear()
        cookies = {sessions.COOKIE_NAME: cookie} if cookie else None
        async with aiohttp.ClientSession(cookies=cookies) as session:
            async with session.post(url, json=body) as r:
                msgpack.unpackb(await r.read())  # the {"count": 0} etc.
        return captured.get("privacy")

    assert await post() == Index.visible_to(None)
    assert await post(sessions.sign({"user": OWNER})) == Index.visible_to(OWNER)
    # a forged, unsigned cookie is anonymous
    assert await post('{"user": 1}') == Index.visible_to(None)
    admin = Users.ADMIN[0]
    assert await post(sessions.sign({"user": admin})) is None
