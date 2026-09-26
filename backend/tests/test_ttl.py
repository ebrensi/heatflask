# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
TTLs are set on the collection, so an app that shares another's database
(SKIP_TTL) must leave them alone. Runs against a throwaway database on
localhost, and skips if there is no MongoDB running.
"""

import os
import socket
import time

import pytest
from pymongo import AsyncMongoClient

from heatflask import DataAPIs

DAY = 86400


def mongo_is_running() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", 27017), timeout=0.5):
            return True
    except OSError:
        return False


@pytest.fixture
async def mongodb(monkeypatch):
    if not mongo_is_running():
        pytest.skip("no MongoDB on localhost:27017")

    client = AsyncMongoClient("mongodb://127.0.0.1:27017", tz_aware=True)
    db = client[f"heatflask_test_{os.getpid()}_{time.monotonic_ns()}"]
    monkeypatch.setattr(DataAPIs.db, "mongodb", db)
    yield db
    await client.drop_database(db.name)
    await client.close()


async def ttl_of(db, name):
    info = await db[name].index_information()
    return info["ts"].get("expireAfterSeconds")


async def test_an_app_sets_the_ttl_to_its_own(mongodb):
    await DataAPIs.init_collection("c", ttl=20 * DAY)
    await DataAPIs.init_collection("c", ttl=10 * DAY)
    assert await ttl_of(mongodb, "c") == 10 * DAY


async def test_skip_ttl_leaves_the_existing_ttl_alone(mongodb, monkeypatch):
    await DataAPIs.init_collection("c", ttl=20 * DAY)
    monkeypatch.setattr(DataAPIs, "SKIP_TTL", True)
    await DataAPIs.init_collection("c", ttl=10 * DAY)
    assert await ttl_of(mongodb, "c") == 20 * DAY


async def test_skip_ttl_still_gives_a_collection_without_one_a_ttl(
    mongodb, monkeypatch
):
    monkeypatch.setattr(DataAPIs, "SKIP_TTL", True)
    await DataAPIs.init_collection("new", ttl=10 * DAY)
    assert await ttl_of(mongodb, "new") == 10 * DAY

    await mongodb.create_collection("old")  # predates its TTL
    await DataAPIs.init_collection("old", ttl=10 * DAY)
    assert await ttl_of(mongodb, "old") == 10 * DAY
