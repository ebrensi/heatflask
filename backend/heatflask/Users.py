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
from pymongo import DESCENDING
import types
import asyncio
from aiohttp.client_exceptions import ClientResponseError

from . import DataAPIs
from . import Utility
from . import Strava
from . import Index

log = getLogger(__name__)
log.propagate = True

COLLECTION_NAME = "users_v0"

# Drop a user after a year of inactivity
# not logging in
TTL = 365 * 24 * 3600

# These are IDs of users we consider to be admin users
ADMIN = [15972102]

# This is to limit the number of de-auths in one batch so we
# don't go over our hit quota
MAX_TRIAGE = 10

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(COLLECTION_NAME)
    return myBox.collection


fields = [
    ID := "_id",
    LAST_LOGIN := "ts",
    LOGIN_COUNT := "#",
    LAST_INDEX_ACCESS := "I",
    FIRSTNAME := "f",
    LASTNAME := "l",
    PROFILE := "P",
    CITY := "c",
    STATE := "s",
    COUNTRY := "C",
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
    last_login=None,
    login_count=None,
    last_index_access=None,
    private=None,
    auth=None,
    **kwargs,
):
    if not (id or kwargs.get(ID)):
        log.error("cannot create user with no id")
        return

    return Utility.cleandict(
        {
            ID: int(kwargs.get(ID, id)),
            FIRSTNAME: firstname,
            LASTNAME: lastname,
            PROFILE: profile_medium or profile,
            CITY: city,
            STATE: state,
            COUNTRY: country,
            LAST_LOGIN: last_login,
            LOGIN_COUNT: login_count,
            LAST_INDEX_ACCESS: last_index_access,
            AUTH: auth,
            PRIVATE: private,
        }
    )


def is_admin(user_id):
    return int(user_id) in ADMIN


async def add_or_update(
    update_last_login=False,
    update_index_access=False,
    inc_login_count=False,
    **strava_athlete,
):
    users = await get_collection()
    # log.debug("Athlete: %s", strava_athlete)
    doc = mongo_doc(**strava_athlete)
    if not doc:
        log.exception("error adding/updating user: %s", doc)
        return

    now_ts = datetime.datetime.utcnow().timestamp()
    if update_last_login:
        doc[LAST_LOGIN] = now_ts

    if update_index_access:
        doc[LAST_INDEX_ACCESS] = now_ts

    # We cannot technically "update" the _id field if this user exists
    # in the database, so we need to remove that field from the updates
    user_info = {**doc}
    user_id = user_info.pop(ID)
    updates = {"$set": user_info}

    if inc_login_count:
        updates["$inc"] = {LOGIN_COUNT: 1}

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
    # LAST_LOGIN=False
    # LOGIN_COUNT=False
    # LAST_INDEX_ACCESS=False
    # AUTH: False,
    # PRIVATE: False,
}


SORT_SPEC = [(LAST_LOGIN, DESCENDING)]


async def dump(admin=False, output="json"):
    query = {} if admin else {PRIVATE: False}

    out_fields = {**default_out_fields}
    if admin:
        out_fields.update(
            {
                LAST_LOGIN: True,
                LOGIN_COUNT: True,
                LAST_INDEX_ACCESS: True,
                PRIVATE: True,
            }
        )
    users = await get_collection()
    cursor = users.find(filter=query, projection=out_fields, sort=SORT_SPEC)
    keys = list(out_fields.keys())
    csv = output == "csv"
    if csv:
        yield keys
    async for u in cursor:
        yield [u.get(k, "") for k in keys] if csv else u


async def delete(user_id, deauthenticate=True):
    # First we delete the user's index
    await Index.delete_user_entries(**{ID: user_id})

    user = await get(user_id)

    # attempt to de-authenticate the user. we
    #  will no longer access data on their behalf.
    #  We need their stored access_token in order to do this
    #  and we won't be able to if we delete that info, so we must
    #  make sure it is done before deleting this user from mongodb.
    #  Afterwards it is useless so we can delete it.
    if user and (AUTH in user) and deauthenticate:
        client = Strava.AsyncClient(user_id, **user[AUTH])
        async with Strava.get_limiter():
            try:
                await client.deauthenticate(raise_exception=True)
            except ClientResponseError as e:
                log.info(
                    "user %s is already deauthenticated? (%s, %s)",
                    user_id,
                    e.status,
                    e.message,
                )
            except Exception:
                log.exception("strava error?")

    users = await get_collection()
    try:
        await users.delete_one({ID: user_id})

    except Exception:
        log.exception("error deleting user %d", user_id)
    else:
        log.info("deleted user %s", user_id)


async def triage(*args, only_find=False, deauthenticate=True, max_triage=MAX_TRIAGE):
    now_ts = datetime.datetime.now().timestamp()
    cutoff = now_ts - TTL
    users = await get_collection()
    cursor = users.find({LAST_LOGIN: {"$lt": cutoff}}, {ID: True, LAST_LOGIN: True})
    bad_users = await cursor.to_list(length=max_triage)
    # log.debug({u[ID]: str(datetime.datetime.fromtimestamp(u[LAST_LOGIN]).date()) for u in bad_users})
    if only_find:
        return bad_users
    tasks = [
        asyncio.create_task(delete(bu[ID], deauthenticate=deauthenticate))
        for bu in bad_users
    ]
    await asyncio.gather(*tasks)


def stats():
    return DataAPIs.stats(COLLECTION_NAME)


def drop():
    return DataAPIs.drop(COLLECTION_NAME)


#  #### Legacy ######
import os
from sqlalchemy import create_engine, text
import json
from .webserver.config import POSTGRES_URL


async def migrate():
    # Import legacy Users database
    log.info("Importing users from legacy db")
    pgurl = os.environ[POSTGRES_URL]
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
                    last_login=dt_last_active.timestamp(),
                    login_count=app_activity_count,
                    private=not share_profile,
                    auth=json.loads(access_token),
                )
            )
        except json.JSONDecodeError:
            pass

    ids = [u[ID] for u in docs]
    users = await get_collection()
    await users.delete_many({ID: {"$in": ids}})
    insert_result = await users.insert_many(docs)
    log.info("Done migrating %d users", len(insert_result.inserted_ids))
