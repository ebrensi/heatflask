"""
***  For Jupyter notebook ***
Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:
  %%cython --annotate    # Compile and run the cell
  %load Events.py        # Load Events.py file into this (empty) cell
  %%writefile Events.py  # Write the contents of this cell to Events.py
"""
from logging import getLogger
from DataAPIs import init_collection
from bson import ObjectId
import pymongo
import asyncio
import types

log = getLogger(__name__)
log.propagate = True

COLLECTION_NAME = "events"

# Maximum size of event history (for capped MongoDB collection)
MAX_EVENTS_BYTES = 2 * 1024 * 1024  # 2MB

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await init_collection(
            COLLECTION_NAME, capped_size=MAX_EVENTS_BYTES
        )
    return myBox.collection


async def get(event_id):
    col = await get_collection()
    event = await col.find_one({"_id": ObjectId(event_id)})
    event["ts"] = event["_id"].generation_time
    del event["_id"]
    return event


SORT_SPEC = ("$natural", pymongo.DESCENDING)


async def get_all(cls, limit=0):
    col = await get_collection()
    events = await col.find(sort=SORT_SPEC, limit=limit).to_list(length=None)
    for e in events:
        e["ts"] = e["_id"].generation_time
        del e["_id"]
    return events


async def tail(cls, ts=None):
    col = await get_collection()

    if not ts:
        first = await col.find(sort=SORT_SPEC, limit=1).next()
        ts = first["_id"].generation_time

    cursor = col.find(
        {"ts": {"$gt": ts}}, cursor_type=pymongo.CursorType.TAILABLE_AWAIT
    )

    abort_signal = None
    while cursor.alive and not abort_signal:
        async for e in cursor:
            e["ts"] = e["_id"].generation_time
            e["_id"] = str(e["_id"])

            abort_signal = yield e
            if abort_signal:
                log.info("live-updates aborted")
                return
        asyncio.sleep(2)


async def new_event(**event):
    col = await get_collection()
    log.info("creating new event: %s", event)
    # try:
    #     await col.insert_one(event)
    # except Exception:
    #     log.exception("error inserting event %s", event)


def log_request(request, **args):
    args.update(
        {
            # "ip": req.access_route[-1],
            "ip": request.remote_addr or request.ip,
            "agent": vars(request.user_agent),
        }
    )
    return new_event(**args)
