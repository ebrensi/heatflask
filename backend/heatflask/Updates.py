"""
***  For Jupyter notebook ***
Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:
    %%cython --annotate     # Compile and run the cell
    %load Updates.py        # Load Updates.py file into this (empty) cell
    %%writefile Updates.py  # Write the contents of this cell to Updates.py
"""

# Updates come from Strava Webhook callbacks

from logging import getLogger
from datetime import datetime
import types


from . import DataAPIs
from . import Strava
from . import Users

log = getLogger(__name__)
log.propagate = True

COLLECTION_NAME = "updates_v0"

# Maximum size of updates history (for capped MongoDB collection)
MAX_UPDATES_BYTES = 1 * 1024 * 1024

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if not myBox.collection:
        myBox.collection = await DataAPIs.init_collection(
            COLLECTION_NAME, capped_size=MAX_UPDATES_BYTES
        )
    return myBox.collection


async def list_subscriptions(cls):
    subs = await Strava.list_subscriptions(**cls.credentials)
    return [sub.id for sub in subs]


"""
async def handle_update_callback(cls, update):

    user_id = update["owner_id"]
    try:
        user = Users.get(user_id)
    except Exception:
        log.exception("problem fetching user for update %s", update)
        return

    if (not user) or (not await Users.index_count(**user)):
        return

    col = await get_collection()
    try:
        col.insert_one(update)
    except Exception:
        log.exception("mongodb error")

    if update["object_type"] == "athlete":
        return

    if update["aspect_type"] == "update":
        aid = update["object_id"]
        updates = update.get("updates")
        if updates:
            # update the activity if it exists
            result = Index.update(aid, updates)
            if not result:
                log.info(
                    "webhook: %s index update failed for update %s",
                    user,
                    updates,
                )
                return

    #  If we got here then we know there are index entries
    #  for this user
    if update.aspect_type == "create":
        # fetch activity and add it to the index
        result = Index.import_by_id(user, [_id])
        if result:
            log.debug("webhook: %s create %s %s", user, _id, result)
        else:
            log.info("webhook: %s create %s failed", user, _id)

    elif update.aspect_type == "delete":
        # delete the activity from the index
        Index.delete(_id)

@staticmethod
def iter_updates(limit=0):
    updates = mongodb.updates.find(sort=[("$natural", pymongo.DESCENDING)]).limit(
        limit
    )

    for u in updates:
        u["_id"] = str(u["_id"])
        yield u
"""
