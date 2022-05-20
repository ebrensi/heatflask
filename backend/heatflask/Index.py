"""
Functions and constants pertaining to the Index datastore.  Each record
represents the summary of a user activity.

***  For Jupyter notebook ***
Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:
    %%cython --annotate    # Compile and run the cell
    %load Index.py         # Load Index.py file into this (empty) cell
    %%writefile Index.py   # Write the contents of this cell to Index.py
"""

from optparse import Option
import os
from tokenize import Name
import polyline
import numpy as np
from logging import getLogger
import datetime
import time
import asyncio
from aiohttp import ClientResponseError
from pymongo import DESCENDING
from pymongo.collection import Collection

from typing import Final, AsyncGenerator, NamedTuple, Optional, TypedDict, cast
from dataclasses import dataclass

from . import DataAPIs
from .DataAPIs import db
from . import Strava
from . import Utility
from . import Users
from .Types import epoch

log = getLogger(__name__)
log.propagate = True
log.setLevel("INFO")

COLLECTION_NAME = "index_v0"

SECS_IN_HOUR = 60 * 60
SECS_IN_DAY = 24 * SECS_IN_HOUR

# How long we store a user's Index
TTL = int(os.environ.get("INDEX_TTL", 20)) * SECS_IN_DAY


@dataclass
class Box:
    collection: Optional[Collection]


myBox = Box(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(COLLECTION_NAME)
    return myBox.collection


class LatLng(NamedTuple):
    lat: float
    lng: float


class LLBounds(NamedTuple):
    SW: LatLng
    NE: LatLng


def polyline_bounds(poly: str) -> LLBounds | None:
    try:
        latlngs = np.array(polyline.decode(poly), dtype=np.float32)
    except Exception:
        return None

    lats = latlngs[:, 0]
    lngs = latlngs[:, 1]

    return LLBounds(
        SW=LatLng(float(lats.min()), float(lngs.min())),
        NE=LatLng(float(lats.max()), float(lngs.max())),
    )


def overlaps(b1: LLBounds, b2: LLBounds) -> bool:
    b1_left, b1_bottom = b1.SW
    b1_right, b1_top = b1.NE
    b2_left, b2_bottom = b2.SW
    b2_right, b2_top = b2.NE
    return (
        (b1_left < b2_right)
        and (b1_right > b2_left)
        and (b1_top > b2_bottom)
        and (b1_bottom < b2_top)
    )
    """
    {
        f"{F.LATLNG_BOUNDS}.NE.0": {"$gt": b1_left},
        f"{F.LATLNG_BOUNDS}.SW.0": {"$lt": b1_right},
        f"{F.LATLNG_BOUNDS}.SW.1": {"$lt": b1_top},
        f"{F.LATLNG_BOUNDS}.NE.1": {"$gt": b1_bottom}
    }
    """


class MongoDoc(TypedDict):
    """
    MongoDB document for a Activity. We store it as a MongoDB Array,
    much like a Activity object except with the id field removed and used as
    the document index
    """

    _id: int
    a: tuple[
        int, str, int, int, int, int, epoch, int, int, int, LLBounds, bool, bool, int
    ]


class Activity(NamedTuple):
    """A (named) tuple representing a Strava Activity"""

    id: int
    user_id: int
    name: str
    type: int | Strava.ActivityType
    n_athletes: int
    n_photos: int
    elevation_gain: int
    utc_start_time: epoch
    utc_local_offset: int
    distance_meters: int
    time_seconds: int
    latlng_bounds: LLBounds
    flag_commute: bool
    flag_private: bool
    visibility: int | Strava.ActivityVisibility

    @classmethod
    def from_strava(cls, a: Optional[Strava.Activity]):
        """Create Activity object from Strava Activity data"""
        if not a:
            return

        start_dt = Utility.to_datetime(a["start_date"])
        if not (start_dt and a["map"] and a["map"].get("summary_polyline")):
            return
        llb = polyline_bounds(a["map"]["summary_polyline"])
        if not llb:
            return

        atype = a["type"]
        avis = a["visibility"]
        start_epoch = cast(epoch, int(start_dt.timestamp()))
        return cls(
            id=a["id"],
            user_id=a["athlete"]["id"],
            name=a["name"],
            type=Strava.ATYPES_LOOKUP.get(atype, atype),
            n_athletes=a["athlete_count"],
            n_photos=a["total_photo_count"],
            elevation_gain=int(a["total_elevation_gain"] + 0.5),
            utc_start_time=start_epoch,
            utc_local_offset=a["utc_offset"],
            distance_meters=int(a["distance"] + 0.5),
            time_seconds=a["elapsed_time"],
            latlng_bounds=llb,
            flag_commute=a["commute"],
            flag_private=a["private"],
            visibility=Strava.VISTYPES_LOOKUP.get(avis, avis),
        )

    @classmethod
    def from_mongo_doc(cls, doc: MongoDoc):
        """Create a Activity object from a MongoDB document"""
        return cls(doc["_id"], *doc["a"])

    def mongo_doc(self):
        """Create a MongoDB document for this Activity"""
        (id, *theRest) = self
        return MongoDoc(_id=id, a=theRest)


"""Index of a given field in the MongoDB array for a User"""
IndexOf: Final = {field: idx for idx, field in enumerate(Activity._fields[1:])}


def selector(idx_or_fieldname: int | str):
    """The mongodb selector for an array element"""
    idx = (
        idx_or_fieldname
        if isinstance(idx_or_fieldname, int)
        else IndexOf[idx_or_fieldname]
    )
    return f"a.{idx}"


# # **************************************
IMPORT_FLAG_PREFIX = "I:"
IMPORT_FLAG_TTL = 20  # secods
IMPORT_ERROR_TTL = 5


def import_flag_key(user_id: int):
    return f"{IMPORT_FLAG_PREFIX}{user_id}"


async def set_import_flag(user_id: int, val: str):
    await db.redis.setex(import_flag_key(user_id), IMPORT_FLAG_TTL, val)
    log.debug(f"{user_id} import flag set to '%s'", val)


async def set_import_error(user_id: int, e: ClientResponseError):
    val = f"Strava error ${e.status}: ${e.message}"
    await db.redis.setex(import_flag_key(user_id), 5, val)


async def clear_import_flag(user_id: int):
    await db.redis.delete(import_flag_key(user_id))
    log.debug(f"{user_id} import flag unset")


async def check_import_progress(user_id: int):
    result = await db.redis.get(import_flag_key(user_id))
    return result.decode("utf-8") if result else None


# # **************************************
async def fake_import(user_id: int):
    log.info("Starting fake import for user %s", user_id)
    await set_import_flag(user_id, "Building index...")
    for i in range(10):
        await asyncio.sleep(1)
        log.info("fake import %d", i)
        await set_import_flag(user_id, f"Building index...{i}")
    log.info("Finished fake import")
    await clear_import_flag(user_id)


async def import_index_progress(user_id: int, poll_delay: float = 0.5):
    last_msg: str = ""
    msg: str = "1"
    while msg:
        msg = await check_import_progress(user_id)
        if msg != last_msg:
            yield msg
            last_msg = msg
        await asyncio.sleep(poll_delay)


async def import_user_entries(user: Users.User):
    if await check_import_progress(user.id):
        log.info(f"Already importing entries for user {user.id}")
        return

    t0 = time.perf_counter()
    await set_import_flag(user.id, "Building index...")
    strava = Strava.AsyncClient(user.id, user.auth)
    await strava.update_access_token()

    docs = []
    count = 0
    try:
        async for a in strava.get_all_activities():
            A = Activity.from_strava(a)
            if A is not None:
                docs.append(A.mongo_doc())
                count += 1
                if count % Strava.PER_PAGE == 0:
                    await set_import_flag(user.id, f"Building index...{count}")
    except ClientResponseError as e:
        log.info(
            "%d Index import aborted due to Strava error %d: %s",
            user.id,
            e.message,
            e.status,
        )
        await set_import_error(user.id, e)
        return

    docs = list(filter(None, docs))
    t1 = time.perf_counter()
    fetch_time = (t1 - t0) * 1000

    if not docs:
        return

    index = await get_collection()
    await delete_user_entries(user.id)
    try:
        insert_result = await index.insert_many(docs, ordered=False)
    except Exception:
        log.exception("Index insert error")
        log.error(docs)
        return
    insert_time = (time.perf_counter() - t1) * 1000
    count = len(insert_result.inserted_ids)

    await clear_import_flag(user.id)
    log.debug(
        "fetched %s entries in %dms, insert_many %dms", count, fetch_time, insert_time
    )


async def import_one(user: Users.User, activity_id: int):
    client = Strava.AsyncClient(user.id, user.auth)
    try:
        A = Activity.from_strava(
            await client.get_activity(activity_id, raise_exception=True)
        )
        assert A
    except Exception:
        log.error("can't import activity %d", activity_id)
        return

    index = await get_collection()
    try:
        await index.replace_one({"_id": activity_id}, A.mongo_doc(), upsert=True)
    except Exception:
        log.exception("mongo error?")
    else:
        log.debug("%s imported activity %d", user.id, activity_id)


async def update_one(activity_id: int, updates: Strava.Updates):
    collection = await get_collection()
    settings: dict[str, str | int | bool] = {}

    if "title" in updates:
        settings[selector("name")] = updates["title"]

    if "type" in updates:
        settings[selector("type")] = updates["type"]

    if "private" in updates:
        settings[selector("private")] = updates["private"]
        settings[selector("visibility")] = Strava.VISTYPES_LOOKUP["only_me"]

    try:
        await collection.update_one({"_id": activity_id}, {"$set": settings})
    except Exception:
        log.exception("mongo error?")
    else:
        log.debug("updated activity %d: %s", activity_id, settings)


async def delete_one(activity_id: int):
    index = await get_collection()
    return await index.delete_one({"_id": activity_id})


async def delete_user_entries(user_id: int):
    index = await get_collection()
    result = await index.delete_many({selector("user_id"): user_id})
    log.debug("%d deleted %s entries", user_id, result.deleted_count)


async def count_user_entries(user_id: int):
    index = await get_collection()
    return await index.count_documents({selector("user_id"): user_id})


async def has_user_entries(user_id: int):
    index = await get_collection()
    return not not (
        await index.find_one({selector("user_id"): user_id}, projection={"_id": True})
    )


async def triage(*args):
    now_ts = datetime.datetime.now().timestamp()
    cutoff = now_ts - TTL
    users = await get_collection()
    cursor: AsyncGenerator[Users.User, None] = users.find(
        {Users.IndexOf["last_index_access"]: {"$lt": cutoff}}, {"_id": True}
    )
    stale_ids = [u.id async for u in cursor]
    tasks = [asyncio.create_task(delete_user_entries(sid)) for sid in stale_ids]
    await asyncio.gather(*tasks)


SORT_SPECS = [(selector("utc_start_time"), DESCENDING)]


class ActivityQueryResult(TypedDict):
    activities: list[Activity]
    delete: Optional[list[int]]


async def query(
    user_id: int = None,
    activity_ids: list[int] = None,
    exclude_ids: list[int] = None,
    after: int = None,
    before: int = None,
    limit: int = None,
    activity_type: list[str] = None,
    commute: bool = None,
    private: bool = None,
    visibility: list[Strava.ActivityVisibility] = None,
    overlaps: tuple = None,
    #
    update_index_access=True,
):
    mongo_query: dict = {}
    projection = None

    limit = int(limit) if limit else 0

    if user_id:
        uidfield = selector("user_id")
        mongo_query[uidfield] = user_id
        projection = {uidfield: False}

    if before or after:
        mongo_query[selector("utc_start_time")] = Utility.cleandict(
            {
                "$lt": None if before is None else Utility.to_epoch(before),
                "$gte": None if after is None else Utility.to_epoch(after),
            }
        )

    if activity_ids:
        mongo_query["_id"] = {"$in": list(set(aid for aid in activity_ids))}

    if activity_type:
        mongo_query[selector("type")] = {"$in": activity_type}

    if visibility:
        vlist = [Strava.VISTYPES_LOOKUP[v] for v in visibility]
        mongo_query[selector("visibility")] = {"$in": vlist}

    if private is not None:
        mongo_query[selector("FLAG_PRIVATE")] = private

    if commute is not None:
        mongo_query[selector("flag_commute")] = commute

    if overlaps is not None:
        otherbounds = cast(LLBounds, overlaps)
        # Find all activities whose bounding box overlaps
        # a box implied by bounds
        bounds_left, bounds_bottom = otherbounds.SW
        bounds_right, bounds_top = otherbounds.NE
        llselector = selector("latlng_bounds")
        mongo_query.update(
            {
                f"{llselector}.1.0": {"$gt": bounds_left},
                f"{llselector}.0.0": {"$lt": bounds_right},
                f"{llselector}.0.1": {"$lt": bounds_top},
                f"{llselector}.1.1": {"$gt": bounds_bottom},
            }
        )

    to_delete = None

    index = await get_collection()

    result = {}

    if exclude_ids:
        t0 = time.perf_counter()
        cursor = index.find(
            filter=mongo_query,
            projection={"_id": True},
            sort=SORT_SPECS,
            limit=limit,
        )

        # These are the ids of activities that matched the mongo_query
        mongo_query_ids = set([doc["_id"] async for doc in cursor])
        excl = set(int(aid) for aid in exclude_ids)
        to_fetch = list(mongo_query_ids - excl)
        to_delete = list(excl - mongo_query_ids)

        result["delete"] = to_delete
        mongo_query = {"_id": {"$in": to_fetch}}

        elapsed = (time.perf_counter() - t0) * 1000
        log.debug("queried %d ids in %dms", len(mongo_query_ids), elapsed)

    t0 = time.perf_counter()
    cursor = index.find(
        filter=mongo_query,
        projection=projection,
        sort=SORT_SPECS,
        limit=limit,
    )

    activities = [Activity.from_mongo_doc(a) async for a in cursor]
    result["activities"] = activities

    t1 = time.perf_counter()
    elapsed = (t1 - t0) * 1000
    log.debug("queried %d activities in %dms", len(activities), elapsed)

    if update_index_access:
        if user_id:
            await Users.add_or_update(Users.User(user_id), update_index_access=True)
        else:
            uidfield = selector("user_id")
            ids = set(A.user_id for A in activities)
            tasks = [
                asyncio.create_task(
                    Users.add_or_update(Users.User(user_id), update_index_access=True)
                )
                for user_id in ids
            ]
            await asyncio.gather(*tasks)
    return cast(ActivityQueryResult, result)


def stats():
    return DataAPIs.stats(COLLECTION_NAME)


def drop():
    return DataAPIs.drop(COLLECTION_NAME)
