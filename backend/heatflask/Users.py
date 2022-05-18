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
from typing import Final, NamedTuple, Optional, TypedDict, cast
import asyncio
from aiohttp import ClientResponseError

from backend.heatflask.webserver.bp.activities import U

from . import DataAPIs
from . import Utility
from . import Strava
from .Types import epoch, urlstr

log = getLogger(__name__)
log.propagate = True
log.setLevel("INFO")

COLLECTION_NAME = "users_v0"

# Drop a user after a year of inactivity
# not logging in
TTL = 365 * 24 * 3600

# These are IDs of users we consider to be admin users
ADMIN: Final = [15972102]

# This is to limit the number of de-auths in one batch so we
# don't go over our hit quota
MAX_TRIAGE = 10

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(COLLECTION_NAME)
    return myBox.collection


class AuthInfo(NamedTuple):
    access_token: str
    expires_at: epoch
    refresh_token: str


class MongoDoc(TypedDict):
    """MongoDB document for a User. u is just the user without id field."""

    _id: int
    u: tuple[urlstr, str, str, str, str, str, AuthInfo, int, epoch, epoch, bool]


class User(NamedTuple):
    """A tuple representing a user"""

    id: int
    profile: urlstr
    firstname: str
    lastname: str
    city: str
    state: str
    country: str
    auth: AuthInfo
    login_count: int = 0
    last_login: epoch = cast(epoch, 0)
    last_index_access: epoch = cast(epoch, 0)
    public: bool = False

    @classmethod
    def from_strava_login(cls, info: Strava.TokenExchangeResponse):
        a = info["athlete"]
        return cls(
            id=a["id"],
            profile=a["profile_medium"] or a["profile"],
            firstname=a["firstname"],
            lastname=a["lastname"],
            city=a["city"],
            state=a["state"],
            country=a["country"],
            auth=AuthInfo(
                info["access_token"], info["expires_at"], info["refresh_token"]
            ),
        )

    @classmethod
    def from_mongo_doc(cls, doc: MongoDoc):
        return cls(doc["_id"], *doc["u"])

    def mongo_doc(self):
        (id, *theRest) = self
        return MongoDoc(_id=id, u=theRest)

    def is_admin(self):
        return self.id in ADMIN


IndexOf: Final = {field: idx for idx, field in enumerate(User._fields)}

# def encode(obj):
#     if type(obj) in (list, tuple) or isinstance(obj, PVector):
#         return [encode(item) for item in obj]
#     if isinstance(obj, Mapping):
#         encoded_obj = {}
#         for key in obj.keys():
#             encoded_obj[encode(key)] = encode(obj[key])
#         return encoded_obj
#     if isinstance(obj, _native_builtin_types):
#         return obj
#     if isinstance(obj, Set):
#         return ExtType(TYPE_PSET, packb([encode(item) for item in obj], use_bin_type=True))
#     if isinstance(obj, PList):
#         return ExtType(TYPE_PLIST, packb([encode(item) for item in obj], use_bin_type=True))
#     if isinstance(obj, PBag):
#         return ExtType(TYPE_PBAG, packb([encode(item) for item in obj], use_bin_type=True))
#     if isinstance(obj, types.FunctionType):
#         return ExtType(TYPE_FUNC, encode_func(obj))
#     if isinstance(obj, Receiver):
#         return ExtType(TYPE_MBOX, packb(obj.encode(), use_bin_type=True))
#     # assume record
#     cls = obj.__class__
#     return ExtType(0, packb([cls.__module__, cls.__name__] + [encode(item) for item in obj],
#                             use_bin_type=True))


async def add_or_update(
    user: User,
    update_last_login=False,
    update_index_access=False,
    inc_login_count=False,
):
    users = await get_collection()
    old_u = get()
    # TODO: pick up here

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


async def get(user_id: int):
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
        client = Strava.AsyncClient(user_id, user[U.AUTH])
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
