"""
***  For Jupyter notebook ***
Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:
    %%cython --annotate       # Compile and run the cell
    %load Users.py            # Load Users.py file into this (empty) cell
    %%writefile Users.py      # Write the contents of this cell to Users.py
"""

from logging import getLogger
import datetime
import pymongo
import types
import asyncio

from . import DataAPIs
from . import Utility

log = getLogger(__name__)
log.propagate = True

COLLECTION_NAME = "users"

# Drop a user after a year of inactivity
TTL = 365 * 24 * 3600

ADMIN = [15972102]

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(COLLECTION_NAME)
    return myBox.collection


fields = [
    ID := "_id",
    TS := "ts",
    FIRSTNAME := "f",
    LASTNAME := "l",
    PROFILE := "P",
    CITY := "c",
    STATE := "s",
    COUNTRY := "C",
    ACCESS_COUNT := "#",
    AUTH := "@",
    PRIVATE := "p",
]


def mongo_doc(
    # From Strava Athlete record
    id=None,
    firstname=None,
    lastname=None,
    profile_medium=None,
    profile=None,
    city=None,
    state=None,
    country=None,
    # my additions
    _id=None,
    ts=None,
    auth=None,
    access_count=None,
    private=None,
    **extras,
):
    if not (id or _id):
        log.error("cannot create user with no id")
        return

    return Utility.cleandict(
        {
            ID: int(_id or id),
            FIRSTNAME: firstname,
            LASTNAME: lastname,
            PROFILE: profile_medium or profile,
            CITY: city,
            STATE: state,
            COUNTRY: country,
            TS: ts,
            ACCESS_COUNT: access_count,
            AUTH: auth,
            PRIVATE: private or False,
        }
    )


def is_admin(user_id):
    return int(user_id) in ADMIN


async def add_or_update(update_ts=False, inc_access_count=False, **strava_athlete):
    users = await get_collection()
    # log.debug("Athlete: %s", strava_athlete)
    doc = mongo_doc(**strava_athlete)
    if not doc:
        log.exception("error adding/updating user: %s", doc)
        return

    if update_ts:
        doc[TS] = datetime.datetime.utcnow()

    # We cannot technically "update" the _id field if this user exists
    # in the database, so we need to remove that field from the updates
    user_info = {**doc}
    user_id = user_info.pop(ID)
    updates = {"$set": user_info}

    if inc_access_count:
        updates["$inc"] = {ACCESS_COUNT: 1}

    log.debug("calling mongodb update_one with updates %s", updates)

    # Creates a new user or updates an existing user (with the same id)
    try:
        return await users.find_one_and_update(
            {ID: user_id},
            updates,
            upsert=True,
            return_document=pymongo.ReturnDocument.AFTER,
        )
    except Exception:
        log.exception("error adding/updating user: %s", doc)


async def get(user_id):
    if not user_id:
        return
    users = await get_collection()
    uid = int(user_id)
    query = {ID: uid}
    try:
        return await users.find_one(query)
    except Exception:
        log.exception("Failed mongodb query: %s", query)


# Returns an async iterator
async def get_all():
    users = await get_collection()
    return users.find()


default_out_fields = {
    ID: True,
    FIRSTNAME: True,
    LASTNAME: True,
    PROFILE: True,
    CITY: True,
    STATE: True,
    COUNTRY: True,
    #
    # TS: False,
    # ACCESS_COUNT: False,
    # AUTH: False,
    # PRIVATE: False,
}


async def dump(admin=False, output="json"):
    query = {} if admin else {PRIVATE: False}

    out_fields = {**default_out_fields}
    if admin:
        out_fields.update(
            {
                TS: True,
                ACCESS_COUNT: True,
                PRIVATE: True,
            }
        )
    users = await get_collection()
    cursor = users.find(filter=query, projection=out_fields)
    keys = list(out_fields.keys())
    csv = output == "csv"
    if csv:
        yield keys
    async for u in cursor:
        if admin and (TS in u):
            u[TS] = u[TS].timestamp()
        yield [u.get(k, "") for k in keys] if csv else u


async def delete(user_id):
    users = await get_collection()
    uid = int(user_id)
    try:
        return await users.delete_one({ID: uid})

    except Exception:
        log.exception("error deleting user %d", uid)


async def triage():
    now_ts = datetime.datetime.now().timestamp()
    users = await get_collection()
    bad = [
        (u[ID], u[AUTH])
        async for u in users.find()
        if now_ts - u[TS].timestamp() >= TTL
    ]
    # TODO: continue this


def stats():
    return DataAPIs.stats(COLLECTION_NAME)


def drop():
    return DataAPIs.drop(COLLECTION_NAME)


#  #### Legacy ######
import os
from sqlalchemy import create_engine, text
import json


async def migrate():
    # Import legacy Users database
    log.info("Importing users from legacy db")
    pgurl = os.environ["REMOTE_POSTGRES_URL"]
    results = None
    with create_engine(pgurl).connect() as conn:
        result = conn.execute(text("select * from users"))
    results = result.all()

    docs = []

    for (
        id,
        username,
        firstname,
        lastname,
        profile,
        access_token,
        measurement_preference,
        city,
        state,
        country,
        email,
        dt_last_active,
        app_activity_count,
        share_profile,
        xxx,
    ) in results:
        if (id in ADMIN) or (dt_last_active is None):
            log.info("skipping %d", id)
            continue
        try:
            docs.append(
                mongo_doc(
                    # From Strava Athlete record
                    id=id,
                    firstname=firstname,
                    lastname=lastname,
                    profile=profile,
                    city=city,
                    state=state,
                    country=country,
                    #
                    ts=dt_last_active,
                    auth=json.loads(access_token),
                    access_count=app_activity_count,
                    private=not share_profile,
                )
            )
        except json.JSONDecodeError:
            pass

    ids = [u[ID] for u in docs]
    users = await get_collection()
    await users.delete_many({ID: {"$in": ids}})
    await users.insert_many(docs)
