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
import asyncio
from aiohttp import ClientResponseError

from typing import AsyncGenerator, Final, NamedTuple, Optional, TypedDict, Any, cast
from dataclasses import dataclass
from pymongo.collection import Collection

from . import DataAPIs
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


@dataclass
class Box:
    collection: Optional[Collection]


myBox: Final = Box(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(COLLECTION_NAME)
    return myBox.collection


class MongoDoc(TypedDict):
    """
    MongoDB document for a User. We store the user as a MongoDB Array,
    much like a User object except with the id field removed and used as
    the document index
    """

    _id: int
    u: tuple[urlstr, str, str, str, str, str, Strava.AuthInfo, int, epoch, epoch, bool]


class User(NamedTuple):
    """A (named) tuple representing a registered Strava Athlete"""

    id: int
    profile: Optional[urlstr] = None
    firstname: Optional[str] = None
    lastname: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    auth: Optional[Strava.AuthInfo] = None
    login_count: Optional[int] = None
    last_login: Optional[epoch] = None
    last_index_access: Optional[epoch] = None
    public: Optional[bool] = None

    @classmethod
    def from_strava_login(cls, info: Strava.TokenExchangeResponse):
        """Create a User object with the data we receive from Strava when a user logs in"""
        a = info["athlete"]
        return cls(
            id=a["id"],
            profile=a["profile_medium"] or a["profile"],
            firstname=a["firstname"],
            lastname=a["lastname"],
            city=a["city"],
            state=a["state"],
            country=a["country"],
            auth=Strava.AuthInfo(
                info["access_token"], info["expires_at"], info["refresh_token"]
            ),
        )

    @classmethod
    def from_mongo_doc(cls, doc: MongoDoc):
        """Create a User object from a MongoDB document"""
        return cls(doc["_id"], *doc["u"])

    def mongo_doc(self):
        """Create a MongoDB document for this user"""
        (id, *theRest) = self
        return MongoDoc(_id=id, u=theRest)

    def is_admin(self):
        """Whether or not this user is an admin"""
        return self.id in ADMIN


"""Index of a given field in the MongoDB array for a User"""
IndexOf: Final = {field: idx for idx, field in enumerate(User._fields[1:])}


def selector(idx_or_fieldname: int | str):
    """The mongodb selector for an array element"""
    idx = (
        idx_or_fieldname
        if isinstance(idx_or_fieldname, int)
        else IndexOf[idx_or_fieldname]
    )
    return f"u.{idx}"


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


async def get(user_id: int) -> User | None:
    """Retrieve a User from the database"""
    db = await get_collection()
    query = {"_id": user_id}
    try:
        doc: MongoDoc = await db.find_one(query)
        return User.from_mongo_doc(doc)
    except Exception:
        log.exception("Failed mongodb query: %s", query)
        return None


async def get_all() -> AsyncGenerator[User, None]:
    """Returns an async iterator of all users"""
    db = await get_collection()
    docs: AsyncGenerator[MongoDoc, None] = db.find()
    async for doc in docs:
        u = User.from_mongo_doc(doc)
        if u:
            yield u


async def add_or_update(
    updates: User,
    update_last_login=False,
    update_index_access=False,
    inc_login_count=False,
):
    """Add a new user or update an existing one"""
    collection = await get_collection()
    if not collection:
        return

    now_ts = cast(epoch, int(datetime.datetime.utcnow().timestamp()))
    update_array = list(updates[1:])
    if update_last_login:
        update_array[IndexOf["last_login"]] = now_ts

    if update_index_access:
        update_array[IndexOf["last_index_access"]] = now_ts

    mongo_updates = {
        "$set": {selector(i): v for i, v in enumerate(update_array) if v is not None}
    }

    if inc_login_count:
        mongo_updates["$inc"] = {selector("login_count"): 1}

    log.debug("Users updated with %s", mongo_updates)

    # Creates a new user or updates an existing user (with the same id)
    try:
        return await collection.find_one_and_update(
            {"_id": updates.id},
            mongo_updates,
            upsert=True,
            return_document=pymongo.ReturnDocument.AFTER,
        )
    except Exception:
        log.exception("error adding/updating Users: %s", mongo_updates)


default_out_fieldnames = (
    "id",
    "firstname",
    "lastname",
    "profile",
    "city",
    "state",
    "country",
)
admin_out_fieldnames = default_out_fieldnames + (
    "last_login",
    "login_count",
    "last_index_access",
    "private",
)

SORT_SPEC = [(selector("last_login"), DESCENDING)]


async def dump(admin=False) -> AsyncGenerator[tuple, None]:
    query = {} if admin else {selector("private"): False}
    collection = await get_collection()
    cursor: AsyncGenerator[MongoDoc, None] = collection.find(
        filter=query, sort=SORT_SPEC
    )
    fieldnames = admin_out_fieldnames if admin else default_out_fieldnames
    yield fieldnames

    idx = tuple(IndexOf[f] for f in fieldnames[1:])
    async for m in cursor:
        yield tuple(m["u"][i] for i in idx)


async def delete(user_id, deauthenticate=True):
    user = await get(user_id)

    # attempt to de-authenticate the user. we
    #  will no longer access data on their behalf.
    #  We need their stored access_token in order to do this
    #  and we won't be able to if we delete that info, so we must
    #  make sure it is done before deleting this user from mongodb.
    #  Afterwards it is useless so we can delete it.
    if user and (user.auth) and deauthenticate:
        client = Strava.AsyncClient(user_id, user.auth)
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
        await users.delete_one({"_id": user_id})

    except Exception:
        log.exception("error deleting user %d", user_id)
    else:
        log.info("deleted user %s", user_id)


async def triage(*args, only_find=False, deauthenticate=True, max_triage=MAX_TRIAGE):
    now_ts = datetime.datetime.now().timestamp()
    cutoff = now_ts - TTL
    users = await get_collection()

    cursor = users.find({selector("last_login"): {"$lt": cutoff}}, {"_id": True})
    bad_users: list[MongoDoc] = await cursor.to_list(length=max_triage)

    if only_find:
        return bad_users
    tasks = [
        asyncio.create_task(delete(bu["_id"], deauthenticate=deauthenticate))
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


class OldUserRecord(NamedTuple):
    id: int
    username: str
    firstname: str
    lastname: str
    profile: str
    access_token: str
    measurement_preference: str
    city: str
    state: str
    country: str
    email: str
    dt_last_active: datetime.datetime
    app_activity_count: int
    share_profile: bool
    xxx: Any


async def migrate():
    # Import legacy Users database
    log.info("Importing users from legacy db")
    pgurl = os.environ[POSTGRES_URL]
    with create_engine(pgurl).connect() as conn:
        result = conn.execute(text("select * from users"))

    docs = []

    for m in result.all():
        u = OldUserRecord(*m)

        if (u.id in ADMIN) or (u.dt_last_active is None):
            log.info("skipping %d", u.id)
            continue
        try:
            docs.append(
                User(
                    # From Strava Athlete record
                    id=u.id,
                    firstname=u.firstname,
                    lastname=u.lastname,
                    profile=u.profile,
                    city=u.city,
                    state=u.state,
                    country=u.country,
                    #
                    last_login=int(u.dt_last_active.timestamp()),
                    login_count=u.app_activity_count,
                    private=not u.share_profile,
                    auth=json.loads(u.access_token),
                ).mongo_doc()
            )
        except json.JSONDecodeError:
            pass

    docs = cast(list[MongoDoc], docs)
    ids = [u["_id"] for u in docs]
    collection = await get_collection()
    await collection.delete_many({"_id": {"$in": ids}})
    insert_result = await collection.insert_many(docs)
    log.info("Done migrating %d users", len(insert_result.inserted_ids))
