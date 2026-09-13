"""Strava webhook deliveries"""

import pytest

from heatflask import Index, Streams, Updates, Users


@pytest.fixture
def world(monkeypatch):
    """Record what the handler does, with a user who has an index"""
    calls = []
    users = {7: {"_id": 7, "@": {}}}
    indexed = {7}

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

    def recorder(name):
        async def record(*args, **kwargs):
            calls.append((name, args, kwargs))

        return record

    monkeypatch.setattr(Updates, "get_collection", get_collection)
    monkeypatch.setattr(Users, "get", get_user)
    monkeypatch.setattr(Index, "has_user_entries", has_user_entries)
    monkeypatch.setattr(Index, "import_one", recorder("import_one"))
    monkeypatch.setattr(Index, "update_one", recorder("update_one"))
    monkeypatch.setattr(Index, "delete_one", recorder("delete_one"))
    monkeypatch.setattr(Streams, "delete", recorder("streams.delete"))
    return calls


def update(aspect_type, owner_id=7, object_type="activity", **updates):
    return {
        "object_type": object_type,
        "object_id": 123,
        "aspect_type": aspect_type,
        "updates": updates,
        "owner_id": owner_id,
        "subscription_id": 1,
        "event_time": 1_789_300_000,
    }


async def test_create_imports_the_activity(world):
    await Updates.handle_update_callback(update("create"))
    assert world[0] == ("record", "create")
    name, args, kwargs = world[1]
    assert name == "import_one"
    assert args == (123,)
    assert kwargs["_id"] == 7


async def test_update_passes_the_changes(world):
    await Updates.handle_update_callback(update("update", title="Morning Ride"))
    assert world[1] == ("update_one", (123,), {"title": "Morning Ride"})


async def test_delete_removes_the_activity_and_its_track(world):
    await Updates.handle_update_callback(update("delete"))
    assert [c[0] for c in world] == ["record", "delete_one", "streams.delete"]
    assert world[2][1] == ([123],)


async def test_users_without_an_index_are_only_recorded(world):
    await Updates.handle_update_callback(update("create", owner_id=99))
    assert world == [("record", "create")]


async def test_athlete_updates_are_only_recorded(world):
    await Updates.handle_update_callback(
        update("update", object_type="athlete", authorized="false")
    )
    assert world == [("record", "update")]


async def test_recording_does_not_change_the_update(world):
    delivery = update("create")
    await Updates.handle_update_callback(delivery)
    assert "_id" not in delivery


async def test_a_recording_failure_does_not_stop_the_update(world, monkeypatch):
    async def broken():
        raise RuntimeError("mongo is down")

    monkeypatch.setattr(Updates, "get_collection", broken)
    await Updates.handle_update_callback(update("delete"))
    assert [c[0] for c in world] == ["delete_one", "streams.delete"]
