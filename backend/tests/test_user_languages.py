# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""Which translation a logged-in user sees, recorded for the /users listing"""

import pytest

from heatflask import Users

U = Users.UserField


@pytest.mark.parametrize(
    "value, expected",
    [
        ("ja", "ja"),
        ("pt-BR", "pt-BR"),
        ("zh-Hans", "zh-Hans"),
        (" de-DE ", "de-DE"),
        ("", None),
        (None, None),
        ("*", None),
        ("en; q=0.9", None),
        ('ja"><script>', None),
        ("x" * 40, None),
    ],
)
def test_only_language_tags_are_kept(value, expected):
    assert Users.lang_tag(value) == expected


@pytest.fixture
def writes(monkeypatch):
    calls = []

    class FakeUsers:
        async def update_one(self, spec, update):
            calls.append((spec, update))

    async def get_collection():
        return FakeUsers()

    monkeypatch.setattr(Users, "get_collection", get_collection)
    return calls


async def test_a_change_is_written(writes):
    user = {U.ID: 5, U.LANG: "en"}
    await Users.set_languages(user, "ja", "ja-JP")
    assert writes == [({U.ID: 5}, {"$set": {U.LANG: "ja", U.BROWSER_LANG: "ja-JP"}})]


async def test_nothing_new_costs_no_write(writes):
    """Every query calls this, so the usual case must not touch Mongo"""
    user = {U.ID: 5, U.LANG: "ja", U.BROWSER_LANG: "ja-JP"}
    await Users.set_languages(user, "ja", "ja-JP")
    await Users.set_languages(user, None, "")
    await Users.set_languages(user, "not a tag!", None)
    assert writes == []
