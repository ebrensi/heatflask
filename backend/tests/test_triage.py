# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""Index.triage: dropping the index of users who have not used it in a while"""

import time

from heatflask import Index, Users


class Collection:
    def __init__(self, docs):
        self.docs = docs

    def find(self, query, projection=None):
        ((field, condition),) = query.items()
        cutoff = condition["$lt"]
        found = [d for d in self.docs if field in d and d[field] < cutoff]

        async def cursor():
            for d in found:
                yield d

        return cursor()


async def test_triage_drops_stale_indexes_found_in_the_users_collection(monkeypatch):
    now = time.time()
    users = Collection(
        [
            {"_id": 1, "I": now - Index.TTL - 60},  # stale
            {"_id": 2, "I": now - 60},  # recent
            {"_id": 3},  # never queried
        ]
    )
    index = Collection([{"_id": 99, "U": 1}])  # index entries have no "I"
    deleted = []

    async def users_collection():
        return users

    async def index_collection():
        return index

    async def delete_user_entries(**user):
        deleted.append(user["_id"])

    monkeypatch.setattr(Users, "get_collection", users_collection)
    monkeypatch.setattr(Index, "get_collection", index_collection)
    monkeypatch.setattr(Index, "delete_user_entries", delete_user_entries)

    await Index.triage()

    assert deleted == [1]
