"""
Defines all the /activities/* webserver endpoints
for querying the Index and Streams data stores
"""

from typing import AsyncGenerator
from sanic.exceptions import SanicException
import sanic
import msgpack
import asyncio

from typing import Optional

from logging import getLogger

from ... import Index
from ... import Users
from ... import Streams
from ... import Utility
from ... import Strava

from ..config import APP_NAME
from ..sessions import session_cookie, SessionRequest
from ..files import render_template

log = getLogger(__name__)
log.setLevel("INFO")
log.propagate = True

bp = sanic.Blueprint("activities", url_prefix="/activities")


@bp.post("/")
@session_cookie(get=True)
async def query(request: SessionRequest):
    """
    Get the activity list JSON for currently logged-in user
    """
    query = request.json

    streams = query.pop("streams", False)
    response = await request.respond(content_type="application/msgpack")

    def sendPacked(doc):
        return response.send(msgpack.packb(doc))

    target_user_id = query.get("user_id")
    if target_user_id:
        is_owner_or_admin = request.ctx.current_user and (
            request.ctx.is_admin or (request.ctx.current_user.id == target_user_id)
        )

        target_user = await Users.get(target_user_id)
        if not target_user:
            raise SanicException(
                f"user {target_user_id} not registered", status_code=404
            )

        # Query will only return private activities if current_user
        # is owner of the activities (or admin)
        if not is_owner_or_admin:
            query["private"] = False

        # If there are no index entries for this user and they aren't
        #  currently being imported, start importing them now
        if (not await Index.has_user_entries(target_user_id)) and (
            not await Index.check_import_progress(target_user_id)
        ):
            request.app.add_task(Index.import_user_entries(target_user))
            # We do this to make sure asyncio starts doing the import task
            # by the time we start looking at import progress
            await asyncio.sleep(0)

        async for msg in Index.import_index_progress(target_user_id):
            # If queried user's index is currently being imported we
            # have to wait for that, while sending progress indicators
            await sendPacked({"msg": msg})
            log.debug("awaiting index import finish: %s", msg)

    elif not request.ctx.is_admin:
        # If there is no target_user then this is a multi-user query.

        # We need to make sure a user is not accessing
        # other users' private activities
        pass

    query_result = await Index.query(**query)
    if "delete" in query_result:
        await sendPacked({"delete": query_result["delete"]})

    activities = query_result["activities"]
    await sendPacked({"count": len(activities)})

    info = {
        "atypes": Strava.ATYPES,
        "vistypes": Strava.VISTYPES,
        "polyline_precision": Streams.POLYLINE_PRECISION,
    }
    if not target_user_id:
        # If there is no target_user_id then this is a general
        # activity query and we will send activity owner id
        # along with each activity.  We create a lookup here
        # for the avatar associated with each owner.
        uids = tuple(set(A.user_id for A in activities))
        users = await Users.get_collection()
        cursor: AsyncGenerator[Users.MongoDoc, None] = users.find(
            {"_id": {"$in": uids}}
        )
        profile_lookup = {
            u.id: u.profile
            async for u in (Users.User.from_mongo_doc(m) async for m in cursor)
        }
        info["avatars"] = profile_lookup

    await sendPacked({"info": info})

    if not streams:
        for A in activities:
            await sendPacked(A)
        return

    summaries_lookup = {A.id: A for A in activities}
    ids = list(summaries_lookup.keys())

    user = await Users.get(target_user_id)
    streams_iter = Streams.aiter_query(ids, user)
    errors = set()
    async for aid, packed_streams in streams_iter:
        if streams:
            A = summaries_lookup[aid]
            await sendPacked((*A, packed_streams))
        else:
            errors.add(aid)
            await sendPacked({"error": aid})
    if len(errors):
        log.error("Errors importing activities: %s", errors)


@bp.get("/")
@session_cookie(get=True, set=True)
async def activities_page(request: SessionRequest):
    """
    Activity list HTML page for currently logged-in user
    """
    all_users = request.args.pop("all", False)
    query: dict = {"streams": False}
    if "limit" not in query:
        query["limit"] = 0

    current_user_id = request.ctx.current_user.id if request.ctx.current_user else None
    target_user_id = request.args.get("user_id", None if all_users else current_user_id)
    if target_user_id:
        target_user = request.ctx.current_user or await Users.get(target_user_id)
        if not target_user:
            raise SanicException(
                f"user {target_user_id} not registered", status_code=404
            )

        query["user_id"] = target_user_id
        is_owner = current_user_id == target_user_id
        if not (is_owner or request.ctx.is_admin):
            query["private"] = False

    elif not request.ctx.is_admin:
        # For now, users cannot see private activities in the general index,
        # even if that user is the owner of those activities.
        #
        # TODO: We need to allow a user to see their own private activities
        #  when looking at a general (multi-user) query.
        query["private"] = False

    query_url = request.url_for("activities.query")
    query_obj = Utility.cleandict(query)

    params = {
        "app_name": APP_NAME,
        "runtime_json": {
            "query_url": query_url,
            "query_obj": query_obj,
        },
    }
    html = render_template("activities-page.html", **params)
    return sanic.response.html(html)
