# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
"""
Short links to one activity: heatflask.com/a/<activity id>.

These go in Strava activity descriptions ("View it live at ..."), where people
read them, so they carry only the activity id. Which athlete it belongs to is
looked up here. The index knows, but its entries expire 60 days after their
owner last used Heatflask, and a link in a description has to keep working
long after that. So a link the owner makes is recorded here, with no TTL: one
small document per link, mapping the activity to its athlete.

An activity that is still in the index works without a record, so a link
copied by someone other than the owner works too, for as long as the index
holds the activity.

The records go when the athlete's account does (main.delete and the
deauthorization webhook) and when Strava says the activity was deleted.
"""

import datetime
import types
from logging import getLogger

from . import DataAPIs
from . import Index

log = getLogger(__name__)
log.propagate = True

COLLECTION_NAME = "links_v0"
USER_ID = "U"

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if myBox.collection is None:
        coll = await DataAPIs.init_collection(COLLECTION_NAME)
        # for deleting an athlete's links with their account
        await coll.create_index(USER_ID, name=USER_ID)
        myBox.collection = coll
    return myBox.collection


async def indexed_owner(activity_id: int) -> int | None:
    """The athlete whose activity this is, if it is in the index"""
    index = await Index.get_collection()
    doc = await index.find_one(
        {Index.F.ACTIVITY_ID: activity_id}, projection={Index.F.USER_ID: True}
    )
    return doc[Index.F.USER_ID] if doc else None


async def owner_of(activity_id: int) -> int | None:
    """The athlete a link to this activity leads to, or None if it leads nowhere"""
    links = await get_collection()
    doc = await links.find_one({"_id": activity_id})
    if doc:
        return doc[USER_ID]
    return await indexed_owner(activity_id)


async def record(activity_id: int, user_id: int) -> bool:
    """
    Keep a link to user_id's activity working after the index forgets it.
    False if the index does not have that activity as theirs.
    """
    if await indexed_owner(activity_id) != user_id:
        return False
    links = await get_collection()
    await links.update_one(
        {"_id": activity_id},
        {
            "$set": {USER_ID: user_id},
            "$setOnInsert": {"ts": datetime.datetime.now(datetime.timezone.utc)},
        },
        upsert=True,
    )
    return True


async def delete_user_links(user_id: int) -> None:
    links = await get_collection()
    result = await links.delete_many({USER_ID: user_id})
    if result.deleted_count:
        log.info("deleted %d links of user %s", result.deleted_count, user_id)


async def delete_one(activity_id: int) -> None:
    links = await get_collection()
    await links.delete_one({"_id": activity_id})
