"""Strava webhook deliveries"""

import pytest

from heatflask import Index, Streams, Updates, Users

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

    async def subscription_id(recheck=False):
        return OUR_SUBSCRIPTION

    monkeypatch.setattr(Updates, "get_collection", get_collection)
    monkeypatch.setattr(Updates, "subscription_id", subscription_id)
    monkeypatch.setattr(Users, "get", get_user)
    monkeypatch.setattr(Index, "has_user_entries", has_user_entries)
    monkeypatch.setattr(Index, "refresh_one", refresh_one)
    monkeypatch.setattr(Streams, "delete", delete_streams)
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
    assert calls[-1] == ("streams.delete", [123])


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
