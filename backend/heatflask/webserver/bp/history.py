# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
Defines the /history endpoints: the internal log of what the server did.

Admin only, and rendered here rather than in the frontend. Every other page
is a Parcel build read out of frontend/dist, which is the right arrangement
for a page people use; this one is a tool for looking at the server, it has
no translations and no state, and it should keep working when a frontend
build is half-written.
"""

import datetime
import html
from logging import getLogger

import sanic
import sanic.response as Response
from sanic.request import Request

from ... import History
from ..sessions import session_cookie

log = getLogger(__name__)
log.setLevel("INFO")
log.propagate = True

bp = sanic.Blueprint("history", url_prefix="/history")

# Entry fields rendered in their own columns; anything else an entry carries
# goes in the last one, so a new kind of record shows up without a change here
COLUMNS = ("ts", "kind", "user", "msg")


def ago(ts: datetime.datetime, now: datetime.datetime) -> str:
    """How long ago, at a length that fits in a table cell."""
    secs = (now - ts).total_seconds()
    if secs < 90:
        return f"{int(secs)}s"
    if secs < 5400:
        return f"{int(secs / 60)}m"
    if secs < 172800:
        return f"{secs / 3600:.1f}h"
    return f"{secs / 86400:.1f}d"


def render_row(entry: dict, now: datetime.datetime) -> str:
    ts = entry.get("ts")
    when = ts.strftime("%m-%d %H:%M:%S") if ts else "?"
    user = entry.get("user")
    kind = entry.get("kind", "")

    # everything the entry carries beyond the named columns
    extra = " ".join(f"{k}={v}" for k, v in sorted(entry.items()) if k not in COLUMNS)

    user_cell = (
        f'<a href="/{user}">{user}</a>'
        if user is not None
        else '<span class="anon">anon</span>'
    )

    return (
        f'<tr class="{html.escape(kind)}">'
        f'<td class="ts" title="{html.escape(str(ts))}">{when}'
        f'<span class="ago">{ago(ts, now) if ts else ""}</span></td>'
        f'<td class="kind">{html.escape(kind)}</td>'
        f"<td>{user_cell}</td>"
        f'<td class="msg">{html.escape(str(entry.get("msg", "")))}</td>'
        f'<td class="extra">{html.escape(extra)}</td>'
        "</tr>"
    )


STYLE = """
body { background:#1a1a1a; color:#ddd; font: 13px/1.5 -apple-system, sans-serif;
       margin:0; padding:1rem 1.25rem; }
h1 { font-size:1.1rem; font-weight:600; margin:0 0 .25rem; }
.sub { color:#888; margin:0 0 1rem; }
.filters a { color:#7fd7ff; margin-right:.75rem; text-decoration:none; }
.filters a.on { color:#fff; text-decoration:underline; }
table { border-collapse:collapse; width:100%; }
th { text-align:left; color:#888; font-weight:500; border-bottom:1px solid #333;
     padding:.3rem .5rem; position:sticky; top:0; background:#1a1a1a; }
td { padding:.3rem .5rem; border-bottom:1px solid #262626; vertical-align:top; }
tr:hover td { background:#222; }
.ts { white-space:nowrap; color:#999; font-variant-numeric:tabular-nums; }
.ago { color:#666; margin-left:.5rem; }
.kind { white-space:nowrap; }
tr.error .kind { color:#ff6b6b; }
tr.import .kind { color:#ffd166; }
tr.account .kind { color:#7ee787; }
tr.request .kind { color:#7fd7ff; }
.msg { word-break:break-word; }
.extra { color:#888; word-break:break-word; }
.anon { color:#666; }
a { color:#7fd7ff; }
.empty { color:#888; padding:2rem 0; }
"""


@bp.get("/")
@session_cookie(get=True, flashes=True)
async def page(request: Request):
    """
    The log, newest first.

        ?n=500          how many entries (default 200)
        ?kind=error     one kind only
        ?user=1234      one athlete only
        ?output=json    the same entries as JSON

    Admin only: it names every athlete who has used the site this month.
    """
    if not request.ctx.is_admin:
        state = request.path + (
            f"?{request.query_string}" if request.query_string else ""
        )
        return Response.redirect(request.app.url_for("auth.authorize", state=state))

    kind = request.args.get("kind")
    user = request.args.get("user")
    limit = request.args.get("n", History.DEFAULT_LIMIT)

    try:
        entries = await History.recent(
            limit=limit, kind=kind, user=int(user) if user else None
        )
    except (TypeError, ValueError):
        raise sanic.exceptions.SanicException("bad query", status_code=400, quiet=True)

    if request.args.get("output") == "json":
        return Response.json(entries, default=str)

    now = History.now()
    rows = "\n".join(render_row(e, now) for e in entries)

    def link(label: str, **args) -> str:
        url = request.app.url_for("history.page", **args)
        on = " class='on'" if args.get("kind") == kind else ""
        return f"<a href='{url}'{on}>{label}</a>"

    filters = " ".join([link("all")] + [link(k, kind=k) for k in History.ALL_KINDS])

    body = (
        f"<table><thead><tr><th>when</th><th>kind</th><th>who</th>"
        f"<th>what</th><th></th></tr></thead><tbody>{rows}</tbody></table>"
        if entries
        else "<p class='empty'>Nothing recorded yet.</p>"
    )

    return Response.html(
        "<!DOCTYPE html><html><head><meta charset='utf-8'>"
        "<title>Heatflask history</title>"
        f"<style>{STYLE}</style></head><body>"
        "<h1>History</h1>"
        f"<p class='sub'>{len(entries)} entries, newest first. "
        f"Kept {History.TTL // 86400} days.</p>"
        f"<p class='filters'>{filters}</p>"
        f"{body}</body></html>"
    )
