"""
Functions and constants directly pertaining to our User database

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

log = getLogger(__name__)
log.propagate = True
log.setLevel("INFO")

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


class UserField:
    ID = "_id"
    LAST_LOGIN = "ts"
    LOGIN_COUNT = "#"
    LAST_INDEX_ACCESS = "I"
    FIRSTNAME = "f"
    LASTNAME = "l"
    PROFILE = "P"
    CITY = "c"
    STATE = "s"
    COUNTRY = "C"
    AUTH = "@"
    PRIVATE = "p"


U = UserField


def mongo_doc(
    # From Strava Athlete record
    id: int = None,
    firstname: str = None,
    lastname: str = None,
    profile_medium: str = None,
    profile: str = None,
    city: str = None,
    state: str = None,
    country: str = None,
    # my additions
    last_login=None,
    login_count: int = None,
    last_index_access=None,
    private: bool = None,
    auth: dict[str, str | int] = None,
    **kwargs,
) -> dict | None:
    if not (id or kwargs.get(U.ID)):
        log.error("cannot create user with no id")
        return None

    return Utility.cleandict(
        {
            U.ID: int(kwargs.get(U.ID, id)),
            U.FIRSTNAME: firstname,
            U.LASTNAME: lastname,
            U.PROFILE: profile_medium or profile,
            U.CITY: city,
            U.STATE: state,
            U.COUNTRY: country,
            U.LAST_LOGIN: last_login,
            U.LOGIN_COUNT: login_count,
            U.LAST_INDEX_ACCESS: last_index_access,
            U.AUTH: auth,
            U.PRIVATE: private,
        }
    )


def is_admin(user_id: int | str):
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
        doc[U.LAST_LOGIN] = now_ts

    if update_index_access:
        doc[U.LAST_INDEX_ACCESS] = now_ts

    # We cannot technically "update" the _id field if this user exists
    # in the database, so we need to remove that field from the updates
    user_info = {**doc}
    user_id = user_info.pop(U.ID)
    updates = {"$set": user_info}

    if inc_login_count:
        updates["$inc"] = {U.LOGIN_COUNT: 1}

    log.debug("%d updated with %s", user_id, updates)

    # Creates a new user or updates an existing user (with the same id)
    try:
        return await users.find_one_and_update(
            {U.ID: user_id},
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
    query = {U.ID: uid}
    try:
        return await users.find_one(query)
    except Exception:
        log.exception("Failed mongodb query: %s", query)


# Returns an async iterator
async def get_all():
    users = await get_collection()
    return users.find()


default_out_fields = {
    U.ID: True,
    U.FIRSTNAME: True,
    U.LASTNAME: True,
    U.PROFILE: True,
    U.CITY: True,
    U.STATE: True,
    U.COUNTRY: True,
    #
    # U.LAST_LOGIN=False
    # U.LOGIN_COUNT=False
    # U.LAST_INDEX_ACCESS=False
    # U.AUTH: False,
    # U.PRIVATE: False,
}


SORT_SPEC = [(U.LAST_LOGIN, DESCENDING)]


async def dump(admin=False, output="json"):
    query = {} if admin else {U.PRIVATE: False}

    out_fields = {**default_out_fields}
    if admin:
        out_fields.update(
            {
                U.LAST_LOGIN: True,
                U.LOGIN_COUNT: True,
                U.LAST_INDEX_ACCESS: True,
                U.PRIVATE: True,
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
    user = await get(user_id)

    # attempt to de-authenticate the user. we
    #  will no longer access data on their behalf.
    #  We need their stored access_token in order to do this
    #  and we won't be able to if we delete that info, so we must
    #  make sure it is done before deleting this user from mongodb.
    #  Afterwards it is useless so we can delete it.
    if user and (U.AUTH in user) and deauthenticate:
        client = Strava.AsyncClient(user_id, **user[U.AUTH])
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
        await users.delete_one({U.ID: user_id})

    except Exception:
        log.exception("error deleting user %d", user_id)
    else:
        log.info("deleted user %s", user_id)


async def triage(*args, only_find=False, deauthenticate=True, max_triage=MAX_TRIAGE):
    now_ts = datetime.datetime.now().timestamp()
    cutoff = now_ts - TTL
    users = await get_collection()
    cursor = users.find(
        {U.LAST_LOGIN: {"$lt": cutoff}}, {U.ID: True, U.LAST_LOGIN: True}
    )
    bad_users = await cursor.to_list(length=max_triage)
    # log.debug({u[U.ID]: str(datetime.datetime.fromtimestamp(u[U.LAST_LOGIN]).date()) for u in bad_users})
    if only_find:
        return bad_users
    tasks = [
        asyncio.create_task(delete(bu[U.ID], deauthenticate=deauthenticate))
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

    ids = [u[U.ID] for u in docs]
    users = await get_collection()
    await users.delete_many({U.ID: {"$in": ids}})
    insert_result = await users.insert_many(docs)
    log.info("Done migrating %d users", len(insert_result.inserted_ids))
