# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
Defines all the /activities/* webserver endpoints
for querying the Index and Streams data stores
"""

from sanic.exceptions import SanicException
import sanic
import msgpack
import asyncio
import time
from contextlib import aclosing
from dataclasses import dataclass, field

from logging import getLogger

from ... import History
from ... import Index
from ... import Users
from ... import Streams
from ... import Utility
from ... import Strava

from ..config import APP_BASE_NAME
from ..sessions import session_cookie, SessionRequest
from ..files import render_template

log = getLogger(__name__)
log.setLevel("INFO")
log.propagate = True

bp = sanic.Blueprint("activities", url_prefix="/activities")
I = Index.ActivitySummaryFields  # noqa: E741  (a namespace alias, as U is below)
U = Users.UserField


@dataclass
class QuerySummary:
    """What one POST /activities asked for and got, for its History entry"""

    owner: int | None = None
    streams: bool = False
    # which of the four kinds of query this was; see QueryKind. Not "kind",
    # which every History entry already has: request, import, and so on
    what: str = "map"
    # the browser's own cache: activities it already had and did not ask for.
    # Reported by the client, because only it knows -- a render served
    # entirely from IndexedDB never reaches us at all, and one served partly
    # from it asks only for what it missed.
    excluded: int = 0
    # activities the top-up found on Strava before the query ran
    new: int = 0
    # matched the query, and of those, sent before the response ended
    activities: int = 0
    sent: int = 0
    counts: Streams.QueryCounts = field(default_factory=Streams.QueryCounts)
    outcome: str = "ok"
    seconds: float = 0.0

    def message(self, viewer: int | None) -> str:
        what = self.what
        if self.owner is None:
            what += " of all athletes"
        who = "owner" if viewer and viewer == self.owner else (viewer or "anon")
        parts = [f"{self.activities} activities"]
        if self.excluded:
            parts[0] += f" (+{self.excluded} already in the browser)"
        if self.streams and self.activities:
            parts.append(
                f"{self.counts.cached} cached + {self.counts.fetched} from Strava"
            )
        if self.new:
            parts.append(f"{self.new} new on Strava")
        if self.outcome != "ok":
            parts.append(self.outcome)
            if self.sent < self.activities:
                parts.append(f"sent {self.sent}")
        parts.append(f"{self.seconds:.1f}s")
        return f"{what}, viewed by {who}: " + ", ".join(parts)

    def stats(self) -> dict:
        return {
            "what": self.what,
            "streams": self.streams,
            "excluded": self.excluded,
            "new": self.new,
            "activities": self.activities,
            "sent": self.sent,
            "cached": self.counts.cached,
            "fetched": self.counts.fetched,
            "outcome": self.outcome,
            "seconds": round(self.seconds, 2),
        }


class QueryKind:
    """
    What a query was for, as its History entry names it.

    The server is told none of this outright. It goes by what each client
    already sends, and every query comes from one of these:

        list          the activity list page, which alone asks for
                      stream_status
        map           a map render with the browser's track cache off: one
                      query, summaries and tracks together
        summaries     the first of a cached render's two queries, which asks
                      for summaries only
        tracks        the second, for the tracks the browser lacks; it
                      alone reports browser_hits

    A "summaries" entry with no "tracks" after it is a render the
    browser drew entirely from its own cache: with nothing missing, there is
    no second query. Every one of these used to be called "list" if it asked
    for no tracks and "map" if it did, so a cached render looked like a visit
    to the activity list page.
    """

    LIST = "list"
    MAP = "map"
    SUMMARIES = "summaries"
    TRACKS = "tracks"

    @classmethod
    def of(cls, query: dict) -> str:
        if query.get("stream_status"):
            return cls.LIST
        if not query.get("streams"):
            return cls.SUMMARIES
        if "browser_hits" in query:
            return cls.TRACKS
        return cls.MAP


@bp.post("/")
@session_cookie(get=True)
async def query(request: SessionRequest):
    """
    Get the activity list JSON for currently logged-in user

    Recorded in History once it is over, however it ended: what was asked for
    and what it cost only exist by then. It used to be recorded on the way in,
    which gave the path and the viewer and nothing else.
    """
    summary = QuerySummary()
    t0 = time.monotonic()
    try:
        await run_query(request, summary)
    except asyncio.CancelledError:
        # Sanic cancels the handler when the client goes away
        summary.outcome = "closed by the browser"
        raise
    except Exception as e:
        summary.outcome = f"failed: {e}"
        raise
    finally:
        summary.seconds = time.monotonic() - t0
        _, viewer = History.viewer_of(request)
        History.log_query(
            request, summary.owner, summary.message(viewer), summary.stats()
        )


@dataclass
class Access:
    """
    What a viewer may see of one athlete's map, or of everyone's. Decided from
    the session alone: nothing in the request can override it.
    """

    target_user: dict | None = None
    is_owner: bool = False
    # a Mongo filter for Index.query
    privacy: dict | None = None
    # why the viewer may see nothing at all
    refused: str | None = None

    @classmethod
    async def of(cls, request: SessionRequest, target_user_id) -> "Access":
        access = cls()
        if target_user_id:
            access.target_user = await Users.get(target_user_id)
            if not access.target_user:
                raise SanicException(
                    f"user {target_user_id} not registered", status_code=404, quiet=True
                )
        target_user = access.target_user

        viewer = request.ctx.current_user
        access.is_owner = bool(
            viewer and target_user and viewer[U.ID] == target_user[U.ID]
        )
        # No exception for the admin: the privacy rules are the owners', and
        # being able to read the database does not make someone their audience.
        viewer_id = viewer[U.ID] if viewer else None
        if target_user is None:
            sharing = await Users.sharing_ids()
        elif Users.is_sharing(target_user):
            sharing = [target_user[U.ID]]
        elif access.is_owner:
            sharing = []
        else:
            # Someone else's map, and they have not chosen to share it
            access.refused = "This athlete's map is private" + (
                "" if viewer else ". If it is yours, log in to see it."
            )
            return access
        access.privacy = Index.visible_to(viewer_id, sharing=sharing)
        return access


@bp.get("/sport_types")
@session_cookie(get=True)
async def sport_types(request: SessionRequest):
    """
    How many activities of each sport type the viewer can see on this map
    (?user=<id>), or on the map of everyone who shares theirs: what the query
    tab's sport filter offers. Nothing is imported for it.
    """
    access = await Access.of(request, request.args.get("user"))
    if access.refused:
        return sanic.json({})
    counts = await Index.sport_type_counts(
        access.privacy, access.target_user and access.target_user[U.ID]
    )
    return sanic.json(counts)


async def run_query(request: SessionRequest, summary: QuerySummary):
    query = request.json
    summary.what = QueryKind.of(query)

    streams = query.pop("streams", False)
    # The activity list asks for this to show which activities we hold streams
    # for. Off by default, so the render path never pays for the extra lookup.
    stream_status = query.pop("stream_status", False)
    summary.streams = bool(streams)
    # popped, not read in place: this is a report about the client's cache,
    # not a filter, and Index.query takes its kwargs from whatever is left
    summary.excluded = int(query.pop("browser_hits", 0) or 0) or len(
        query.get("exclude_ids") or []
    )
    response = await request.respond(content_type="application/msgpack")

    def sendPacked(doc):
        return response.send(msgpack.packb(doc))

    # Privacy is decided here, from the session, and nothing in the request
    # can override it. The query is the client's JSON splatted into
    # Index.query, and only queries naming a user used to be restricted -- so a
    # query without one (an ?id= link, the all-users list) returned anyone's
    # private activities, and their cached tracks, to anyone who asked.
    query.pop("privacy", None)

    target_user_id = query.get("user_id")
    if target_user_id:
        summary.owner = int(target_user_id)
    access = await Access.of(request, target_user_id)
    target_user, is_owner = access.target_user, access.is_owner

    if access.refused:
        # Refused before anything below can import their index with their token
        summary.outcome = "refused: private"
        # Accounts start private, so the anonymous visitor refused here is
        # often the owner, not yet logged in: the page offers them a login.
        await sendPacked(
            {"error": access.refused, "login": request.ctx.current_user is None}
        )
        return
    if access.privacy:
        query["privacy"] = access.privacy

    if target_user:
        # If there are no index entries for this user and they aren't
        # currently being imported, start importing them now. So too for an
        # index made before we stored sport_type, once, so the sport filter
        # works on it.
        needs_import = not await Index.has_user_entries(
            **target_user
        ) or await Index.has_legacy_entries(**target_user)
        if needs_import and not await Index.check_import_progress(target_user_id):
            request.app.add_task(Index.import_user_entries(**target_user))
            # We do this to make sure asyncio starts doing the import task
            # by the time we start looking at import progress
            await asyncio.sleep(0)

        elif is_owner or request.ctx.is_admin:
            # The index exists, so nothing above will touch it again and only
            # a Strava webhook would keep it current -- which never happens in
            # local development, and misses anything recorded while a webhook
            # was dropped. Top it up with whatever was recorded since the
            # newest activity we hold.
            #
            # Awaited rather than backgrounded, so an activity finished ten
            # minutes ago is in the results of *this* query rather than the
            # next one. It costs a single Strava request, and only for the
            # owner of the index, at most once per UPDATE_INTERVAL.
            if await Index.due_for_update(target_user_id):
                added = await Index.update_user_entries(**target_user)
                summary.new = added or 0
                if added:
                    await sendPacked({"msg": f"{added} new activities"})

        # If queried user's index is currently being imported we have to wait
        # for that, while sending progress indicators
        progress = with_wait_notices(
            Index.import_index_progress(target_user_id), sendPacked
        )
        async with aclosing(progress):
            async for msg in progress:
                await sendPacked({"msg": msg})
                log.debug("awaiting index import finish: %s", msg)

    query_result = await Index.query(**query)
    if "delete" in query_result:
        await sendPacked({"delete": query_result["delete"]})

    summaries = query_result["docs"]
    summary.activities = len(summaries)
    await sendPacked({"count": len(summaries)})

    info = {"atypes": Strava.ATYPES, "polyline_precision": Streams.POLYLINE_PRECISION}
    if not target_user_id:
        # If there is no target_user_id then this is a general
        # activity query and we will send activity owner id
        # along with each activity.  We create a lookup here
        # for the avatar associated with each owner.
        uids = list(set(A[I.USER_ID] for A in summaries))
        users = await Users.get_collection()
        cursor = users.find({U.ID: {"$in": uids}}, {U.ID: True, U.PROFILE: True})
        profile_lookup = {u[U.ID]: u[U.PROFILE] async for u in cursor}
        info["avatars"] = profile_lookup

    await sendPacked({"info": info})

    if stream_status:
        # Which of these we hold streams for, so the activity list can show
        # what is already cached server-side. Sent ahead of the summaries so
        # the page has it before it builds a single row.
        ids = [A[I.ACTIVITY_ID] for A in summaries]
        await sendPacked({"cached": await Streams.cached_ids(ids)})

    if not streams:
        for A in summaries:
            await sendPacked(A)
            summary.sent += 1
        return

    summaries_lookup = {A[I.ACTIVITY_ID]: A for A in summaries}
    ids = list(summaries_lookup.keys())

    # the owner's token pays for whatever Mongo does not hold; with no target
    # (the all-athletes map) only Mongo's streams are served
    streams_iter = Streams.aiter_query(
        activity_ids=ids, user=target_user, counts=summary.counts
    )
    items = with_wait_notices(
        streams_iter, sendPacked, owner=target_user[U.ID] if target_user else None
    )
    try:
        async with aclosing(items):
            async for aid, packed_streams in items:
                A = summaries_lookup[aid]
                A["mpk"] = packed_streams
                await sendPacked(A)
                summary.sent += 1
    except Strava.RateLimitExceeded as e:
        summary.outcome = "rationed for today" if e.rationed else "rate limit"
        # The message is for the log. The browser says it in the reader's
        # language, from the rest.
        await sendPacked(
            {
                "error": e.message,
                "until": round(e.resume_at),
                "daily": e.daily,
                "rationed": e.rationed,
            }
        )


# While a query is stalled waiting on Strava's rate limit, the browser is told
# when it will resume, this often. It doubles as a keepalive: a proxy will
# close a streaming response that goes quiet for long enough, and a wait for
# the rate limit to reset can last up to 15 minutes.
WAIT_NOTICE_INTERVAL = 10


async def with_wait_notices(aiterator, sendPacked, owner: int | None = None):
    """
    Yield from aiterator, sending {"wait": epoch} whenever it has produced
    nothing for WAIT_NOTICE_INTERVAL seconds and Strava's rate limit is why.

    With `rationed` too, when `owner` has had their DAILY_QUOTA of tracks
    today: the browser tells them why they, in particular, are slower.

    On the way out, for any reason -- finished, failed, or cancelled because
    the client disconnected -- aiterator is closed, which stops its Strava
    requests.
    """
    try:
        while True:
            next_item = asyncio.ensure_future(anext(aiterator, StopAsyncIteration))
            try:
                while True:
                    done, _ = await asyncio.wait(
                        {next_item}, timeout=WAIT_NOTICE_INTERVAL
                    )
                    if done:
                        break
                    resume_at = Strava.limiter.waiting_until
                    if resume_at:
                        await sendPacked(
                            {
                                "wait": round(resume_at),
                                "rationed": Strava.limiter.is_rationed(owner),
                            }
                        )
            except BaseException:
                next_item.cancel()
                await asyncio.gather(next_item, return_exceptions=True)
                raise

            item = next_item.result()
            if item is StopAsyncIteration:
                return
            yield item
    finally:
        await aiterator.aclose()


@bp.get("/")
@session_cookie(get=True, set=True)
async def activities_page(request: SessionRequest):
    """
    Activity list HTML page for currently logged-in user
    """
    all_users = request.args.pop("all", False)
    query = {"streams": False}
    if "limit" not in query:
        query["limit"] = 0

    current_user_id = (
        request.ctx.current_user[U.ID] if request.ctx.current_user else None
    )
    target_user_id = request.args.get("user_id", None if all_users else current_user_id)
    if target_user_id:
        target_user = request.ctx.current_user or await Users.get(target_user_id)
        if not target_user:
            raise SanicException(
                f"user {target_user_id} not registered", status_code=404, quiet=True
            )

        query["user_id"] = target_user_id
        is_owner = current_user_id == target_user_id
        if not is_owner:
            query["private"] = False

    else:
        # For now, users cannot see private activities in the general index,
        # even if that user is the owner of those activities.
        #
        # TODO: We need to allow a user to see their own private activities
        #  when looking at a general (multi-user) query.
        query["private"] = False

    query_url = request.url_for("activities.query")
    query_obj = Utility.cleandict(query)

    params = {
        "app_name": APP_BASE_NAME,
        "runtime_json": {
            "query_url": query_url,
            "query_obj": query_obj,
            # The page shows a "cached in this browser" column, and the local
            # cache only ever holds your own activities, so it needs to know
            # whether this list is yours.
            "current_user_id": current_user_id,
        },
    }
    html = render_template("activities-page.html", **params)
    # sanic has no `Response` attribute; the response helpers live in the
    # sanic.response module (the other blueprints alias it as Response)
    return sanic.response.html(html)
