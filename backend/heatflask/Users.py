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

from typing import AsyncGenerator, Final, Optional, Any, cast
from dataclasses import dataclass, asdict, astuple
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


MongoDoc = dict


def clean_dict(d: dict):
    return {k: v for k, v in d.items() if v is not None}


@dataclass(eq=False, order=False, slots=True)
class User:
    """A dataclass object representing a registered Strava Athlete"""

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
        """
        Create a User object with the data we receive from Strava when a user logs in
        """
        a = info["athlete"]
        return cls(
            a["id"],
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
    def from_mongo_doc(cls, doc: dict):
        """Create a User object from a MongoDB document"""
        aid = doc.pop("_id")
        return cls(aid, **doc)

    def mongo_doc(self):
        """Create a MongoDB document for this user"""
        doc = asdict(self)
        doc["_id"] = doc.pop("id")
        return clean_dict(doc)

    def astuple(self):
        return astuple(self)

    def is_admin(self):
        """Whether or not this user is an admin"""
        return self.id in ADMIN


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
    update_login=False,
    update_index_access=False,
):
    """Add a new user or update an existing one"""
    collection = await get_collection()
    if not collection:
        return

    now_ts = cast(epoch, int(datetime.datetime.utcnow().timestamp()))
    if update_login:
        updates.last_login = now_ts

    if update_index_access:
        updates.last_index_access = now_ts

    settings = updates.mongo_doc()
    del settings["_id"]
    mongo_updates = {"$set": settings}

    if update_login:
        mongo_updates["$inc"] = {"login_count": 1}

    log.debug("User %d updated with %s", updates.id, mongo_updates)

    # Creates a new user or updates an existing user (with the same id)
    try:
        return await collection.find_one_and_update(
            {"_id": updates.id},
            mongo_updates,
            upsert=True,
            return_document=pymongo.ReturnDocument.AFTER,
        )
    except Exception:
        log.exception("error adding/updating User %s: %s", updates.id, mongo_updates)


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
    "public",
)

SORT_SPEC = [("last_login", DESCENDING)]


async def dump(admin=False) -> AsyncGenerator[tuple, None]:
    query = {} if admin else {"public": True}
    collection = await get_collection()
    cursor: AsyncGenerator[MongoDoc, None] = collection.find(
        filter=query, sort=SORT_SPEC
    )
    fieldnames = admin_out_fieldnames if admin else default_out_fieldnames
    yield fieldnames

    async for doc in cursor:
        yield tuple(doc[i] for i in fieldnames)


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


async def triage(
    *args, only_find=False, deauthenticate=True, max_triage: int = MAX_TRIAGE
):
    now_ts = datetime.datetime.now().timestamp()
    cutoff = now_ts - TTL
    users = await get_collection()

    cursor = users.find({"last_login": {"$lt": cutoff}}, {"_id": True})
    bad_users_ids = tuple(u["_id"] for u in await cursor.to_list(length=max_triage))

    if only_find:
        return bad_users_ids
    tasks = [
        asyncio.create_task(delete(buid, deauthenticate=deauthenticate))
        for buid in bad_users_ids
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


@dataclass
class OldUserRecord:
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
                    u.id,
                    firstname=u.firstname,
                    lastname=u.lastname,
                    profile=u.profile,
                    city=u.city,
                    state=u.state,
                    country=u.country,
                    #
                    last_login=int(u.dt_last_active.timestamp()),
                    login_count=u.app_activity_count,
                    public=u.share_profile,
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
