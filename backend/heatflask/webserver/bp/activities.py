import sanic.response as Response
import sanic
import msgpack

from logging import getLogger

from ... import Index
from ... import Users
from ... import Streams
from ... import Utility

from ..config import APP_NAME

log = getLogger(__name__)
bp = sanic.Blueprint("activities", url_prefix="/activities")

# **** Activities ******
def index_dict_to_fields(d):
    return [d[f] for f in Index.fields]


@bp.post("/query")
async def query(request):
    # If queried user's index is currently being imported we
    # have to wait for that, while sending progress indicators
    query = request.json
    target_user_id = query.get("user_id")
    streams = query.pop("streams", True)

    is_owner_or_admin = request.ctx.current_user and (
        (request.ctx.current_user["_id"] == target_user_id)
        or Users.is_admin(request.ctx.current_user["_id"])
    )

    # Query will only return private activities if current_user
    # is owner of the activities (or admin)
    if not is_owner_or_admin:
        query["private"] = False

    response = await request.respond(content_type="application/msgpack")
    async for msg in Index.import_index_progress(target_user_id):
        await response.send(msgpack.packb({"msg": msg}))
        log.info("awaiting index import finish: %s", msg)

    query_result = await Index.query(**query)
    if "delete" in query_result:
        await response.send(msgpack.packb({"delete": query_result["delete"]}))

    summaries = query_result["docs"]
    for A in summaries:
        A["ts"] = A["ts"].timestamp()
    await response.send(msgpack.packb({"count": len(summaries)}))

    if not streams:
        for A in summaries:
            await response.send(msgpack.packb(A))
        return

    summaries_lookup = {A["_id"]: A for A in summaries}
    ids = list(summaries_lookup.keys())

    user = Users.get(target_user_id)
    streams_iter = Streams.aiter_query(activity_ids=ids, user=user)
    async for aid, streams in streams_iter:
        A = summaries_lookup[aid]
        A["mpk"] = streams
        packed = msgpack.packb(A)
        await response.send(packed)


@bp.get("/index")
async def index_page(request):
    current_user_id = (
        request.ctx.current_user["_id"] if request.ctx.current_user else None
    )
    target_user_id = request.args.get("user", current_user_id)

    is_owner_or_admin = current_user_id == target_user_id
    if not is_owner_or_admin:
        return Response.text("Sorry, you are not authorized for this action")

    query_url = request.url_for("activities.query")
    query_obj = Utility.cleandict(
        {"user_id": target_user_id, "limit": 0, "streams": False}
    )

    params = {
        "app_name": APP_NAME,
        "runtime_json": {"query_url": query_url, "query_obj": query_obj},
    }
    html = request.ctx.render_template("activities-page.html", **params)
    return Response.html(html)
