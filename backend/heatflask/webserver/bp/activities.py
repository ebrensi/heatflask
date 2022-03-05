"""
Defines all the /activities/* webserver endpoints
for querying the Index and Streams data stores
"""

import sanic.response as Response
import sanic
import msgpack
import json

from logging import getLogger

from ... import Index
from ... import Users
from ... import Streams
from ... import Utility
from ... import Strava

from ..config import APP_NAME
from ..sessions import session_cookie
from ..files import render_template

log = getLogger(__name__)
bp = sanic.Blueprint("activities", url_prefix="/activities")


def index_dict_to_fields(d):
    return [d[f] for f in Index.fields]


@bp.post("/query")
@session_cookie(get=True)
async def query(request):
    # If queried user's index is currently being imported we
    # have to wait for that, while sending progress indicators
    query = request.json
    streams = query.pop("streams", True)
    response = await request.respond(content_type="application/msgpack")

    target_user_id = query.get("user_id")
    if target_user_id:
        is_owner_or_admin = request.ctx.current_user and (
            request.ctx.is_admin
            or (request.ctx.current_user[Users.ID] == target_user_id)
        )

        # Query will only return private activities if current_user
        # is owner of the activities (or admin)
        if not is_owner_or_admin:
            query["private"] = False

        async for msg in Index.import_index_progress(target_user_id):
            await response.send(msgpack.packb({"msg": msg}))
            log.info("awaiting index import finish: %s", msg)
    elif not request.ctx.is_admin:
        # If there is no target_user then this is most likely
        # a multi-user query. We need to make sure a user is not accessing
        # other users' private activities
        pass

    query_result = await Index.query(**query)
    if "delete" in query_result:
        await response.send(msgpack.packb({"delete": query_result["delete"]}))

    summaries = query_result["docs"]
    await response.send(msgpack.packb({"count": len(summaries)}))

    if not target_user_id:
        uids = list(set(A[Index.USER_ID] for A in summaries))
        users = await Users.get_collection()
        cursor = users.find({Users.ID: {"$in": uids}}, {Users.ID: True, Users.PROFILE: True})
        profile_lookup = {u[Users.ID]: u[Users.PROFILE] async for u in cursor}
        for A in summaries:
            A["profile"] = profile_lookup[A[Index.USER_ID]]
    if not streams:
        for A in summaries:
            await response.send(msgpack.packb(A))
        return

    summaries_lookup = {A[Index.ACTIVITY_ID]: A for A in summaries}
    ids = list(summaries_lookup.keys())

    user = Users.get(target_user_id)
    streams_iter = Streams.aiter_query(activity_ids=ids, user=user)
    async for aid, streams in streams_iter:
        A = summaries_lookup[aid]
        A["mpk"] = streams
        packed = msgpack.packb(A)
        await response.send(packed)


@bp.get("/")
@session_cookie(get=True, set=True)
async def index_page(request):
    all_users = request.args.pop("all", False)
    query = {"streams": False}
    if "limit" not in query:
        query["limit"] = 0

    current_user_id = (
        request.ctx.current_user["_id"] if request.ctx.current_user else None
    )
    target_user_id = request.args.get("user_id", None if all_users else current_user_id)
    if target_user_id:
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
            "atypes": Strava.ATYPES,
        },
    }
    html = render_template("activities-page.html", **params)
    return Response.html(html)
