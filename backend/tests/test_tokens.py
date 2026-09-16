"""
Refreshing Strava tokens.

Strava invalidates a refresh token the moment it issues the next one, so the
new one has to be kept, and two refreshes for the same athlete must not race.
"""

import asyncio
import time

import pytest

from heatflask import Strava, Users

USER = 42


class MemoryStore:
    """Users.UserTokenStore, without Mongo"""

    def __init__(self, auth):
        self.auth = dict(auth)
        self.saves = 0

    async def load(self):
        return dict(self.auth)

    async def save(self, auth):
        self.saves += 1
        self.auth = {k: auth[k] for k in Users.AUTH_FIELDS if k in auth}


def expired_auth():
    return {
        "token_type": "Bearer",
        "access_token": "access-0",
        "expires_at": int(time.time()) - 60,
        "expires_in": 0,
        "refresh_token": "refresh-0",
    }


@pytest.fixture
def store(monkeypatch):
    store = MemoryStore(expired_auth())
    monkeypatch.setattr(Users, "UserTokenStore", lambda user_id: store)
    return store


def user_as_loaded_earlier():
    # a user document read before any refresh, still holding refresh-0
    return {"_id": USER, "@": expired_auth()}


async def test_a_refreshed_token_is_saved(limiter, strava_server, store):
    fake = await strava_server()
    await Users.strava_client(user_as_loaded_earlier()).get_activity(1)

    assert fake.token_requests == 1
    assert store.auth["refresh_token"] == "refresh-1"
    assert store.auth["refresh_token"] in fake.valid_refresh_tokens


async def test_the_next_request_uses_the_saved_token(limiter, strava_server, store):
    fake = await strava_server()
    await Users.strava_client(user_as_loaded_earlier()).get_activity(1)

    # later, another request starts from the user document it read before the
    # refresh -- the one holding a refresh token Strava has since invalidated
    client = Users.strava_client(user_as_loaded_earlier())
    await client.get_activity(2)

    assert fake.token_requests == 1  # it picked up the saved token instead
    assert client.access_token == "access-1"


async def test_concurrent_refreshes_for_one_athlete_take_turns(
    limiter, strava_server, store
):
    fake = await strava_server()
    clients = [Users.strava_client(user_as_loaded_earlier()) for _ in range(5)]

    await asyncio.gather(*(c.get_activity(i) for i, c in enumerate(clients)))

    assert fake.token_requests == 1
    assert {c.access_token for c in clients} == {"access-1"}
    assert store.saves == 1


async def test_without_a_store_the_second_refresh_fails(limiter, strava_server):
    """What happened before: nothing kept the new token"""
    from heatflask import Strava

    fake = await strava_server()
    first = Strava.AsyncClient(USER, expired_auth())
    await first.update_access_token()
    second = Strava.AsyncClient(USER, expired_auth())
    assert await second.update_access_token() is None  # refresh-0 is dead
    assert fake.token_requests == 2


async def test_a_failed_refresh_does_not_log_the_client_secret(
    strava_server, limiter, caplog
):
    await strava_server()
    client = Strava.AsyncClient(
        "someone",
        {"access_token": "a", "refresh_token": "not-valid", "expires_at": 0},
    )
    with caplog.at_level("DEBUG"):
        assert await client.update_access_token() is None
    # only our records: the fake server's own access log shows the URL
    ours = "\n".join(
        r.getMessage() for r in caplog.records if r.name.startswith("heatflask")
    )
    assert "token refresh failed: 400" in ours
    assert Strava.CLIENT_SECRET not in ours
    assert "not-valid" not in ours
