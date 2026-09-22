# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
The sport-type filter, against a real MongoDB as test_privacy.py does, since
it leans on how Mongo treats a missing field. Skips without one on localhost.
"""

import time

import aiohttp
import pytest
from sanic import Sanic

from heatflask import Index, Strava, Users
from heatflask.webserver import sessions
from heatflask.webserver.bp import activities

from test_privacy import mongo_is_running

F = Index.ActivitySummaryFields
OWNER, OTHER = 1, 2
RUN = Strava.ATYPES_LOOKUP["Run"]
RIDE = Strava.ATYPES_LOOKUP["Ride"]

ACTIVITIES = [
    # (id, owner, legacy type, sport_type or None for an entry made before it)
    (1, OWNER, RUN, "Run"),
    (2, OWNER, RUN, "TrailRun"),
    (3, OWNER, RIDE, "GravelRide"),
    (4, OWNER, Strava.ATYPES_LOOKUP["Workout"], "Pickleball"),
    (5, OTHER, RUN, None),
    (6, OTHER, RIDE, None),
    (7, OTHER, "WaterSport", None),  # a type Strava.ATYPES has not heard of
]


@pytest.fixture
async def index(monkeypatch):
    if not mongo_is_running():
        pytest.skip("no MongoDB on localhost:27017")
    from pymongo import AsyncMongoClient

    client = AsyncMongoClient("mongodb://127.0.0.1:27017", tz_aware=True)
    db = client[f"heatflask_test_{time.monotonic_ns()}"]
    coll = db["index"]
    docs = []
    for aid, owner, t, st in ACTIVITIES:
        doc = {F.ACTIVITY_ID: aid, F.USER_ID: owner, F.UTC_START_TIME: aid}
        doc[F.ACTIVITY_TYPE] = t
        if st:
            doc[F.SPORT_TYPE] = st
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


async def test_filter_matches_sport_types_exactly(index):
    assert await ids(user_id=OWNER, sport_type=["TrailRun"]) == {2}
    assert await ids(user_id=OWNER, sport_type=["Run", "GravelRide"]) == {1, 3}
    assert await ids(user_id=OWNER, sport_type=["Pickleball"]) == {4}
    assert await ids(user_id=OWNER) == {1, 2, 3, 4}


async def test_legacy_entries_match_by_their_activity_type(index):
    """Before sport_type was stored, a TrailRun filter can only find Runs"""
    assert await ids(user_id=OTHER, sport_type=["TrailRun"]) == {5}
    assert await ids(user_id=OTHER, sport_type=["MountainBikeRide"]) == {6}
    assert await ids(user_id=OTHER, sport_type=["WaterSport"]) == {7}
    assert await ids(user_id=OTHER, sport_type=["Swim"]) == set()


async def test_exclusion_leaves_out_only_those(index):
    assert await ids(user_id=OWNER, exclude_sport_type=["TrailRun"]) == {1, 3, 4}
    assert await ids(user_id=OWNER, exclude_sport_type=["Run", "GravelRide"]) == {
        2,
        4,
    }


async def test_exclusion_keeps_legacy_entries_unless_their_type_is_named(index):
    """A legacy Run may or may not have been a trail run; it stays"""
    assert await ids(user_id=OTHER, exclude_sport_type=["TrailRun"]) == {5, 6, 7}
    assert await ids(user_id=OTHER, exclude_sport_type=["Run"]) == {6, 7}
    assert await ids(user_id=OTHER, exclude_sport_type=["WaterSport"]) == {5, 6}


async def test_filter_keeps_privacy(index):
    privacy = Index.visible_to(None, sharing=[OTHER])
    assert await ids(sport_type=["Run"], privacy=privacy) == {5}
    assert await ids(exclude_sport_type=["Run"], privacy=privacy) == {6, 7}
    # the exclusion path rebuilds the query from ids; the filter must hold
    result = await Index.query(
        update_index_access=False,
        sport_type=["Run"],
        exclude_ids=[1, 3],
        privacy=Index.visible_to(OWNER, sharing=[]),
    )
    assert {d[F.ACTIVITY_ID] for d in result["docs"]} == set()
    assert set(result["delete"]) == {3}


async def test_legacy_indexes_are_recognized(index):
    assert not await Index.has_legacy_entries(**{"_id": OWNER})
    assert await Index.has_legacy_entries(**{"_id": OTHER})
    assert not await Index.has_legacy_entries(**{"_id": 99})


async def test_counts_name_legacy_entries_by_their_type(index):
    assert await Index.sport_type_counts(None, OWNER) == {
        "Run": 1,
        "TrailRun": 1,
        "GravelRide": 1,
        "Pickleball": 1,
    }
    assert await Index.sport_type_counts(None, None) == {
        "Run": 2,
        "TrailRun": 1,
        "GravelRide": 1,
        "Pickleball": 1,
        "Ride": 1,
        "WaterSport": 1,
    }
    shared = Index.visible_to(None, sharing=[OTHER])
    assert await Index.sport_type_counts(shared, None) == {
        "Run": 1,
        "Ride": 1,
        "WaterSport": 1,
    }


def test_new_entries_always_have_a_sport_type():
    base = dict(
        id=1,
        athlete={"id": 2},
        start_date="2026-09-21T00:00:00Z",
        map={"summary_polyline": "_p~iF~ps|U_ulLnnqC"},
    )
    assert Index.mongo_doc(**base, type="Run", sport_type="TrailRun")["st"] == (
        "TrailRun"
    )
    # were it ever missing, a missing field would rebuild the index every query
    assert Index.mongo_doc(**base, type="Run")["st"] == "Run"


def test_every_sport_type_has_a_legacy_type_strava_knows():
    for st in Strava.SPORT_TYPES:
        assert Strava.legacy_type(st) in Strava.ATYPES


@pytest.fixture
async def counts_route(monkeypatch, sanic_server):
    USERS = {
        OWNER: {"_id": OWNER, "f": "A", "l": "B", "p": True},
        OTHER: {"_id": OTHER, "f": "C", "l": "D", "p": False},
    }
    asked = {}

    async def fake_counts(privacy, user_id):
        asked.update(privacy=privacy, user_id=user_id)
        return {"Run": 1}

    async def get_user(uid):
        return USERS.get(int(uid)) if uid else None

    async def sharing_ids():
        return [OTHER]

    monkeypatch.setattr(Index, "sport_type_counts", fake_counts)
    monkeypatch.setattr(Users, "get", get_user)
    monkeypatch.setattr(Users, "sharing_ids", sharing_ids)

    app = Sanic(f"sport_types_test_{time.monotonic_ns()}")
    app.blueprint(activities.bp)
    url = f"{await sanic_server(app)}/activities/sport_types"

    async def get(user=None, viewer=None):
        asked.clear()
        cookie = sessions.sign({"user": viewer}) if viewer else None
        cookies = {sessions.COOKIE_NAME: cookie} if cookie else None
        params = {"user": user} if user else {}
        async with aiohttp.ClientSession(cookies=cookies) as session:
            async with session.get(url, params=params) as r:
                return await r.json(), dict(asked)

    return get


async def test_counts_route_keeps_unshared_maps_private(counts_route):
    # OWNER has not opted in to sharing
    assert await counts_route(user=OWNER) == ({}, {})
    got, asked = await counts_route(user=OWNER, viewer=OWNER)
    assert got == {"Run": 1}
    assert asked["privacy"] == Index.visible_to(OWNER, sharing=[])

    got, asked = await counts_route(user=OTHER)
    assert asked == {
        "privacy": Index.visible_to(None, sharing=[OTHER]),
        "user_id": OTHER,
    }
    _, asked = await counts_route()
    assert asked == {
        "privacy": Index.visible_to(None, sharing=[OTHER]),
        "user_id": None,
    }
