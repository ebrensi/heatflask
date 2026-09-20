# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
Users.triage: inactive users are deauthorized before their record (and with it
the only token that can revoke our access) is dropped.
"""

import time

import pytest

from heatflask import Index, Updates, Users

U = Users.U
YEAR = Users.TTL
ACTIVE, STALE = 1, 2


class Collection:
    """find/find_one/update_one/delete_one over dicts, for the queries triage makes"""

    def __init__(self, docs):
        self.docs = {d[U.ID]: d for d in docs}

    def _match(self, doc, query):
        for k, v in query.items():
            if isinstance(v, dict) and "$lt" in v:
                if not (k in doc and doc[k] < v["$lt"]):
                    return False
            elif doc.get(k) != v:
                return False
        return True

    def find(self, query, projection=None):
        found = [d for d in list(self.docs.values()) if self._match(d, query)]

        async def cursor():
            for d in found:
                yield d

        return cursor()

    async def find_one(self, query, projection=None):
        return next((d for d in self.docs.values() if self._match(d, query)), None)

    async def update_one(self, query, update):
        doc = await self.find_one(query)
        if doc:
            doc.update(update["$set"])

    async def delete_one(self, query):
        doc = await self.find_one(query)
        if doc:
            del self.docs[doc[U.ID]]


def user(uid, last_login):
    return {
        U.ID: uid,
        U.LAST_LOGIN: last_login,
        # current, so no refresh happens first
        U.AUTH: {
            "access_token": f"access-{uid}",
            "refresh_token": "refresh-0",
            "expires_at": int(time.time()) + 6 * 3600,
        },
    }


@pytest.fixture
async def setup(monkeypatch, strava_server, limiter):
    strava = await strava_server()
    now = time.time()
    coll = Collection([user(ACTIVE, now - 3600), user(STALE, now - YEAR - 3600)])

    async def get_collection():
        return coll

    monkeypatch.setattr(Users, "get_collection", get_collection)
    return strava, coll


async def test_a_confirmed_deauthorization_drops_the_user(setup):
    strava, coll = setup
    counts = await Users.triage()
    assert counts == {"deleted": 1}
    assert strava.deauths == [f"Bearer access-{STALE}"]
    assert list(coll.docs) == [ACTIVE]


async def test_triage_works_when_started_as_a_sanic_task(setup):
    # add_task(Users.triage) calls Users.triage(app)
    strava, coll = setup
    assert await Users.triage(object()) == {"deleted": 1}
    assert list(coll.docs) == [ACTIVE]


async def test_a_passing_failure_keeps_the_user_and_token(setup):
    strava, coll = setup
    strava.deauth_status = 503
    assert await Users.triage() == {"error": 1}
    assert U.AUTH in coll.docs[STALE]
    assert U.DEAUTH_REFUSALS not in coll.docs[STALE]


async def test_refused_credentials_are_dropped_only_after_repeated_runs(setup):
    strava, coll = setup
    strava.deauth_status = 401
    for run in range(1, Users.MAX_DEAUTH_REFUSALS):
        assert await Users.triage() == {"refused": 1}
        assert coll.docs[STALE][U.DEAUTH_REFUSALS] == run
    assert await Users.triage() == {"deleted": 1}
    assert list(coll.docs) == [ACTIVE]


async def test_a_deauthorization_webhook_forgets_the_athlete(setup, monkeypatch):
    strava, coll = setup
    dropped = []

    async def delete_user_entries(**user):
        dropped.append(user[U.ID])

    async def record(update):
        pass

    monkeypatch.setattr(Index, "delete_user_entries", delete_user_entries)
    monkeypatch.setattr(Updates, "record", record)
    await Updates.handle_update_callback(
        {
            "object_type": "athlete",
            "object_id": ACTIVE,
            "aspect_type": "update",
            "updates": {"authorized": "false"},
            "owner_id": ACTIVE,
            "subscription_id": strava.subscription,
        }
    )
    assert ACTIVE not in coll.docs
    assert dropped == [ACTIVE]
    # its token is already dead; nothing to revoke
    assert strava.deauths == []
