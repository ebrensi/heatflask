# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""Session cookies: signed, so the user id in them cannot be forged"""

import base64
import json

from heatflask.webserver import sessions


def test_a_signed_session_round_trips():
    session = {"user": 15972102, "flashes": ["hello. world"]}
    assert sessions.unsign(sessions.sign(session)) == session


def test_changing_the_user_id_invalidates_the_cookie():
    value = sessions.sign({"user": 1})
    _, mac = value.split(".")
    forged_payload = base64.urlsafe_b64encode(json.dumps({"user": 2}).encode()).decode()
    assert sessions.unsign(f"{forged_payload}.{mac}") == {}


def test_an_unsigned_cookie_from_before_is_ignored():
    # what the cookie used to hold, and what anyone could have written
    assert sessions.unsign(json.dumps({"user": 15972102})) == {}


def test_a_cookie_signed_with_another_secret_is_ignored():
    value = sessions.sign({"user": 1}, secret="someone else's")
    assert sessions.unsign(value) == {}


def test_garbage_is_ignored():
    for value in (None, "", ".", "a.b", "a.b.c", "!!!.???"):
        assert sessions.unsign(value) == {}


def test_a_signed_non_object_is_ignored():
    assert sessions.unsign(sessions.sign([1, 2, 3])) == {}
