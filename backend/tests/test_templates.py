# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""Pages built from templates: nothing substituted into them becomes markup"""

import html
import json
import re
from pathlib import Path
from string import Template

from heatflask.webserver import files

PAGE = (
    Path(__file__).resolve().parents[2]
    / "frontend/src/webpages/main-page/main-page.html"
)

EVIL_NAME = '</div><script>alert("name")</script>'
EVIL_FLASH = "Error: <img src=x onerror=alert(1)>"


def element_text(page: str, element_id: str) -> str:
    """What the browser's textContent would give for this element"""
    match = re.search(rf'<div[^>]*id="{element_id}"[^>]*>(.*?)</div>', page, re.S)
    assert match, element_id
    return html.unescape(match.group(1))


def test_hostile_names_and_flashes_stay_text(monkeypatch):
    monkeypatch.setitem(files.templates, "test.html", Template(PAGE.read_text()))
    runtime = {"TARGET_USER": {"id": 1, "name": EVIL_NAME}}

    page = files.render_template(
        "test.html",
        APP_NAME="Heatflask",
        runtime_json=runtime,
        flashes=json.dumps([EVIL_FLASH]),
    )

    assert "<script>alert" not in page
    assert "<img src=x" not in page
    # and the page's own JSON.parse still gets exactly what was sent
    assert json.loads(element_text(page, "runtime_json")) == runtime
    assert json.loads(element_text(page, "flashes")) == [EVIL_FLASH]
