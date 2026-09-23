# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
What keeps a long-open page, or an installed app, current across deploys:
/version says which build is running and is never cached, and the
content-hashed bundles are cached for good while the pages naming them are not.
"""

import time

import aiohttp
import pytest
from sanic import Sanic

from heatflask.webserver import files
from heatflask.webserver.bp import main
from heatflask.webserver.config import APP_BUILD


async def test_version_is_the_running_build_and_never_cached(sanic_server):
    app = Sanic(f"version_test_{time.monotonic_ns()}")
    app.blueprint(main.bp)
    base_url = await sanic_server(app)

    async with aiohttp.ClientSession() as s:
        async with s.get(f"{base_url}/version") as r:
            assert r.status == 200
            assert await r.text() == APP_BUILD
            assert r.headers["Cache-Control"] == "no-store"


@pytest.fixture
async def dist(tmp_path, sanic_server):
    for name in (
        "main-page.6405933c.js",
        "main-page.6405933c.js.map",
        "logo.44e79cfd.png",
        "app.webmanifest",
        "favicon.ico",
    ):
        (tmp_path / name).write_bytes(b"x")

    app = Sanic(f"static_test_{time.monotonic_ns()}")
    app.static("", str(tmp_path), name="dist")
    app.register_middleware(files.cache_hashed_files, "response")
    return await sanic_server(app)


@pytest.mark.parametrize(
    "name",
    ["main-page.6405933c.js", "main-page.6405933c.js.map", "logo.44e79cfd.png"],
)
async def test_hashed_files_are_kept(dist, name):
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{dist}/{name}") as r:
            assert r.status == 200
            assert r.headers["Cache-Control"] == files.IMMUTABLE


@pytest.mark.parametrize("name", ["app.webmanifest", "favicon.ico"])
async def test_unhashed_files_are_revalidated(dist, name):
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{dist}/{name}") as r:
            assert r.status == 200
            assert r.headers["Cache-Control"] == "no-cache"
