# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""Strava webhook deliveries"""

import pytest

from heatflask import Index, Links, Streams, Updates, Users

from conftest import make_user

OUR_SUBSCRIPTION = 555


@pytest.fixture
def world(monkeypatch):
    """Record what the handler does, with a user who has an index"""
    calls = []
    users = {7: {"_id": 7, "@": {}}}
    indexed = {7}
    outcome = {"value": "imported"}

    class Recorder:
        async def insert_one(self, doc):
            calls.append(("record", doc["aspect_type"]))
            doc["_id"] = "mutated"

    async def get_collection():
        return Recorder()

    async def get_user(uid):
        return users.get(uid)

    async def has_user_entries(**user):
        return user["_id"] in indexed

    async def refresh_one(activity_id, **user):
        calls.append(("refresh_one", activity_id, user["_id"]))
        return outcome["value"]

    async def delete_streams(ids):
        calls.append(("streams.delete", ids))

    async def delete_link(activity_id):
        calls.append(("links.delete", activity_id))

    async def subscription_id(recheck=False):
        return OUR_SUBSCRIPTION

    monkeypatch.setattr(Updates, "get_collection", get_collection)
    monkeypatch.setattr(Updates, "subscription_id", subscription_id)
    monkeypatch.setattr(Users, "get", get_user)
    monkeypatch.setattr(Index, "has_user_entries", has_user_entries)
    monkeypatch.setattr(Index, "refresh_one", refresh_one)
    monkeypatch.setattr(Streams, "delete", delete_streams)
    monkeypatch.setattr(Links, "delete_one", delete_link)
    return calls, outcome


def update(aspect_type, owner_id=7, object_type="activity", sub=OUR_SUBSCRIPTION, **u):
    return {
        "object_type": object_type,
        "object_id": 123,
        "aspect_type": aspect_type,
        "updates": u,
        "owner_id": owner_id,
        "subscription_id": sub,
        "event_time": 1_789_300_000,
    }


@pytest.mark.parametrize("aspect_type", ["create", "update", "delete"])
async def test_every_event_refreshes_the_activity_from_strava(world, aspect_type):
    calls, _ = world
    await Updates.handle_update_callback(update(aspect_type, title="ignored"))
    assert calls == [("record", aspect_type), ("refresh_one", 123, 7)]


async def test_a_removed_activity_loses_its_cached_track(world):
    calls, outcome = world
    outcome["value"] = "removed"
    await Updates.handle_update_callback(update("delete"))
    assert calls[-2:] == [("streams.delete", [123]), ("links.delete", 123)]


async def test_another_subscriptions_delivery_is_recorded_and_ignored(world):
    calls, _ = world
    await Updates.handle_update_callback(update("update", sub=1, private="false"))
    assert calls == [("record", "update")]


async def test_users_without_an_index_are_only_recorded(world):
    calls, _ = world
    await Updates.handle_update_callback(update("create", owner_id=99))
    assert calls == [("record", "create")]


async def test_athlete_updates_are_only_recorded(world):
    calls, _ = world
    await Updates.handle_update_callback(
        update("update", object_type="athlete", authorized="false")
    )
    assert calls == [("record", "update")]


async def test_recording_does_not_change_the_update(world):
    delivery = update("create")
    await Updates.handle_update_callback(delivery)
    assert "_id" not in delivery


async def test_a_recording_failure_does_not_stop_the_update(world, monkeypatch):
    calls, _ = world

    async def broken():
        raise RuntimeError("mongo is down")

    monkeypatch.setattr(Updates, "get_collection", broken)
    await Updates.handle_update_callback(update("delete"))
    assert calls == [("refresh_one", 123, 7)]


# ---- Index.refresh_one, against a fake Strava ------------------------------


class FakeIndex:
    def __init__(self):
        self.docs = {123: {"_id": 123, "p": False}}

    async def find_one(self, query, projection=None, sort=None):
        return None  # no TTL clock to share; the real query is tested below

    async def replace_one(self, query, doc, upsert=False):
        self.docs[query["_id"]] = doc

    async def delete_one(self, query):
        self.docs.pop(query["_id"], None)


@pytest.fixture
async def strava(monkeypatch, limiter, strava_server):
    fake = await strava_server()
    index = FakeIndex()

    async def get_collection():
        return index

    monkeypatch.setattr(Index, "get_collection", get_collection)
    return fake, index


async def test_refresh_stores_what_strava_says_not_what_the_delivery_said(strava):
    fake, index = strava
    # say a forged delivery claimed private=false; Strava says private
    fake.activity_fields = {"private": True, "visibility": "only_me"}
    assert await Index.refresh_one(123, **make_user(1)) == "imported"
    assert index.docs[123][Index.F.FLAG_PRIVATE] is True


@pytest.mark.parametrize("status", [404, 403])
async def test_refresh_removes_what_strava_will_not_show(strava, status):
    fake, index = strava
    fake.activity_status = status
    assert await Index.refresh_one(123, **make_user(1)) == "removed"
    assert 123 not in index.docs


async def test_refresh_removes_an_activity_without_a_track(strava):
    fake, index = strava
    fake.activity_fields = {"map": {"summary_polyline": ""}}
    assert await Index.refresh_one(123, **make_user(1)) == "removed"


async def test_refresh_leaves_the_entry_alone_when_strava_fails(strava):
    fake, index = strava
    fake.activity_status = 500
    assert await Index.refresh_one(123, **make_user(1)) == "unchanged"
    assert 123 in index.docs


async def test_refresh_stores_moving_time(strava):
    fake, index = strava
    fake.activity_fields = {"moving_time": 3000, "elapsed_time": 3600}
    await Index.refresh_one(123, **make_user(1))
    doc = index.docs[123]
    assert (doc[Index.F.MOVING_SECONDS], doc[Index.F.TIME_SECONDS]) == (3000, 3600)


# ---- our subscription ----------------------------------------------------


@pytest.fixture
def fresh_subscription_box(monkeypatch):
    monkeypatch.setattr(
        Updates,
        "subscriptionBox",
        type(Updates.subscriptionBox)(id=None, looked_up_at=0.0),
    )


async def test_subscription_id_is_looked_up_once(strava, fresh_subscription_box):
    fake, _ = strava
    assert await Updates.subscription_id() == 555
    assert await Updates.subscription_id() == 555
    assert fake.subscription_lookups == 1


async def test_a_replaced_subscription_is_noticed(
    strava, fresh_subscription_box, monkeypatch
):
    fake, _ = strava
    assert await Updates.subscription_id() == 555
    fake.subscription = 777  # deleted and recreated, as moving hosts does

    # within the interval, a recheck does not ask Strava again
    assert await Updates.subscription_id(recheck=True) == 555
    assert fake.subscription_lookups == 1

    monkeypatch.setattr(Updates, "SUBSCRIPTION_LOOKUP_INTERVAL", 0)
    assert await Updates.subscription_id(recheck=True) == 777


async def test_delete_subscription_puts_the_id_in_the_path(strava):
    from heatflask import Strava

    fake, _ = strava
    admin = Strava.AsyncClient("admin")
    assert await admin.delete_subscription(555, raise_exception=True) is True
    assert fake.subscription is None


# ---- the TTL clock a webhook entry gets, against a real MongoDB -------------


@pytest.fixture
async def mongo_index(monkeypatch, limiter, strava_server):
    import datetime
    import os
    import socket
    import time

    from pymongo import AsyncMongoClient

    try:
        socket.create_connection(("127.0.0.1", 27017), timeout=0.5).close()
    except OSError:
        pytest.skip("no MongoDB on localhost:27017")

    client = AsyncMongoClient("mongodb://127.0.0.1:27017", tz_aware=True)
    db = client[f"heatflask_test_{os.getpid()}_{time.monotonic_ns()}"]
    coll = db["index"]

    async def get_collection():
        return coll

    monkeypatch.setattr(Index, "get_collection", get_collection)
    await strava_server()
    yield coll, datetime
    await client.drop_database(db.name)
    await client.close()


async def test_a_webhook_entry_expires_with_the_rest_of_the_index(mongo_index):
    """An athlete who stops visiting but keeps recording: if each new activity
    restarted its own TTL clock, the index would expire all but those, and the
    remainder would never be rebuilt"""
    coll, datetime = mongo_index
    F = Index.F
    now = datetime.datetime.now(datetime.timezone.utc)
    oldest = (now - datetime.timedelta(days=59)).replace(microsecond=0)
    await coll.insert_many(
        [
            {F.ACTIVITY_ID: 1, F.USER_ID: 1, F.TIMESTAMP: oldest},
            {F.ACTIVITY_ID: 2, F.USER_ID: 1, F.TIMESTAMP: now},
            {F.ACTIVITY_ID: 3, F.USER_ID: 1},  # older than ts: never expires
            # someone else's older clock is not this athlete's
            {F.ACTIVITY_ID: 4, F.USER_ID: 2, F.TIMESTAMP: oldest.replace(year=2020)},
        ]
    )

    assert await Index.refresh_one(123, **make_user(1)) == "imported"
    doc = await coll.find_one({F.ACTIVITY_ID: 123})
    assert doc[F.TIMESTAMP] == oldest


async def test_an_athlete_with_no_clock_gets_now(mongo_index):
    coll, datetime = mongo_index
    before = datetime.datetime.now(datetime.timezone.utc).replace(microsecond=0)
    assert await Index.refresh_one(123, **make_user(1)) == "imported"
    doc = await coll.find_one({Index.F.ACTIVITY_ID: 123})
    assert doc[Index.F.TIMESTAMP] >= before


@pytest.fixture
async def touched(mongo_index, monkeypatch):
    """mongo_index with flags of its own and no users collection: who got
    their index clock restarted, read back as the entries' ts"""
    coll, datetime = mongo_index
    flags = coll.database["flags"]

    async def get_flag_collection():
        return flags

    async def add_or_update(**kw):
        pass

    monkeypatch.setattr(Index, "get_flag_collection", get_flag_collection)
    monkeypatch.setattr(Index.Users, "add_or_update", add_or_update)
    F = Index.F
    old = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
    await coll.insert_many(
        [
            {F.ACTIVITY_ID: 1, F.USER_ID: 1, F.UTC_START_TIME: 1, F.TIMESTAMP: old},
            {F.ACTIVITY_ID: 2, F.USER_ID: 1, F.UTC_START_TIME: 2, F.TIMESTAMP: old},
            {F.ACTIVITY_ID: 3, F.USER_ID: 2, F.UTC_START_TIME: 3, F.TIMESTAMP: old},
            {F.ACTIVITY_ID: 4, F.USER_ID: 3, F.UTC_START_TIME: 4, F.TIMESTAMP: old},
        ]
    )

    async def fresh():
        return {d[F.ACTIVITY_ID] async for d in coll.find({F.TIMESTAMP: {"$gt": old}})}

    return coll, flags, fresh


async def test_any_query_of_a_map_keeps_its_index(touched):
    """The index saves Strava reads whoever is looking, so a shared map that
    people keep opening is kept just as its owner's visits would keep it.
    Index.query does not know who is asking, which is the point."""
    coll, flags, fresh = touched
    await Index.query(user_id=1)
    assert await fresh() == {1, 2}


async def test_the_clock_restarts_at_most_once_a_day(touched):
    """Not a bulk write per page view"""
    coll, flags, fresh = touched
    import datetime

    F = Index.F
    old = (await coll.find_one({F.ACTIVITY_ID: 3}))[F.TIMESTAMP]
    await Index.query(user_id=1)
    await coll.update_many({}, {"$set": {F.TIMESTAMP: old}})

    await Index.query(user_id=1)
    assert await fresh() == set()

    # a day on
    flag = await flags.find_one({"_id": "touch:1"})
    day = Index.TOUCH_INTERVAL
    await flags.update_one(
        {"_id": "touch:1"},
        {"$set": {"ts": flag["ts"] - datetime.timedelta(seconds=day)}},
    )
    await Index.query(user_id=1)
    assert await fresh() == {1, 2}


async def test_the_global_map_keeps_everyone_it_matched(touched):
    """Including athletes whose activities the browser already had, and so
    were not sent again"""
    coll, flags, fresh = touched
    await Index.query(activity_ids=[1, 3], exclude_ids=["3"])
    assert await fresh() == {1, 2, 3}
