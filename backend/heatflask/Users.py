"""
Functions and constants directly pertaining to our User database
"""

from logging import getLogger
import datetime
import pymongo
from pymongo import DESCENDING

import types
from typing import Final, TypedDict
import asyncio
from aiohttp import ClientResponseError
from . import DataAPIs
from . import Utility
from . import Strava

log = getLogger(__name__)
log.propagate = True
log.setLevel("INFO")

COLLECTION_NAME = "users_v0"

# Deauthorize and drop a user after a year of inactivity
# not logging in
TTL = 365 * 24 * 3600

# Triage runs at each server start (Heroku restarts dynos daily). This is on
# how many runs Strava must refuse a stale user's credentials before we give up
# on revoking them and drop the record
MAX_DEAUTH_REFUSALS = 3

# These are IDs of users we consider to be admin users
ADMIN = [15972102]

myBox = types.SimpleNamespace(collection=None)


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(COLLECTION_NAME)
    return myBox.collection


class UserField:
    ID: Final = "_id"
    LAST_LOGIN: Final = "ts"
    LOGIN_COUNT: Final = "#"
    LAST_INDEX_ACCESS: Final = "I"
    FIRSTNAME: Final = "f"
    LASTNAME: Final = "l"
    PROFILE: Final = "P"
    CITY: Final = "c"
    STATE: Final = "s"
    COUNTRY: Final = "C"
    AUTH: Final = "@"
    PRIVATE: Final = "p"
    DEAUTH_REFUSALS: Final = "x"


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


# The fields of a token response worth keeping. The code exchange at login
# also returns the athlete, which is stored separately.
AUTH_FIELDS = (
    "token_type",
    "access_token",
    "expires_at",
    "expires_in",
    "refresh_token",
)


class UserTokenStore:
    """An athlete's Strava credentials, kept on their user record"""

    def __init__(self, user_id: int):
        self.user_id = int(user_id)

    async def load(self):
        users = await get_collection()
        doc = await users.find_one({U.ID: self.user_id}, {U.AUTH: True})
        return doc.get(U.AUTH) if doc else None

    async def save(self, auth) -> None:
        stored = {k: auth[k] for k in AUTH_FIELDS if k in auth}
        users = await get_collection()
        await users.update_one({U.ID: self.user_id}, {"$set": {U.AUTH: stored}})
        log.debug("%d saved refreshed Strava credentials", self.user_id)


def strava_client(user: dict) -> Strava.AsyncClient:
    """
    A Strava client acting as this user, which saves refreshed credentials.

    Use this rather than Strava.AsyncClient(user_id, user[U.AUTH]): a client
    made that way refreshes the token and forgets the new refresh token, which
    Strava has just made the only valid one.
    """
    return Strava.AsyncClient(
        user[U.ID], user[U.AUTH], token_store=UserTokenStore(user[U.ID])
    )


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

    # .utcnow() returns a naive datetime whose .timestamp() re-interprets it as
    # local time -- wrong by the UTC offset anywhere but a UTC machine
    now_ts = datetime.datetime.now(datetime.timezone.utc).timestamp()
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
    # Shown as "last active" in the public directory, which is also what the
    # listing is sorted by (SORT_SPEC below). Only users who have opted in to
    # being public appear there at all, and master's directory showed the same
    # column.
    U.LAST_LOGIN: True,
    #
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
        client = strava_client(user)
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


async def deauthorize(user: dict) -> str:
    """
    Revoke our Strava access for this user. Returns
      "revoked"  Strava confirmed it
      "refused"  Strava would not take our credentials: the athlete already
                 revoked us, or the stored refresh token is dead. A refresh that
                 failed for a passing reason looks the same, hence the retries
                 in retire().
      "limited"  out of API budget; stop and try again later
      "error"    anything else (network, Strava 5xx); try again later
    """
    if U.AUTH not in user:
        return "refused"
    try:
        # bulk: this can wait for rate-limit budget; nobody is waiting on it
        await strava_client(user).deauthenticate(raise_exception=True, bulk=True)
    except Strava.RateLimitExceeded:
        return "limited"
    except ClientResponseError as e:
        if e.status in (400, 401, 403):
            return "refused"
        log.info("user %s deauthorization failed: %s %s", user[U.ID], e.status, e.message)
        return "error"
    except Exception:
        log.exception("user %s deauthorization failed", user[U.ID])
        return "error"
    return "revoked"


async def retire(user: dict) -> str:
    """
    Deauthorize an inactive user and drop their record, but never drop a record
    whose token might still revoke access: once it is gone, Strava keeps
    sending us that athlete's webhook events and nothing can stop it.
    """
    outcome = await deauthorize(user)
    users = await get_collection()
    refusals = user.get(U.DEAUTH_REFUSALS, 0) + (outcome == "refused")

    if outcome == "revoked" or refusals >= MAX_DEAUTH_REFUSALS:
        await users.delete_one({U.ID: user[U.ID]})
        log.info("retired user %s (%s)", user[U.ID], outcome)
        return "deleted"
    if outcome == "refused":
        await users.update_one(
            {U.ID: user[U.ID]}, {"$set": {U.DEAUTH_REFUSALS: refusals}}
        )
    return outcome


async def triage(*_app, only_find=False):
    """
    Retire every user who has not logged in for TTL.

    `*_app` because Sanic's add_task calls a task with the app as its first
    argument; without it the app landed in only_find, and triage quietly
    listed users and did nothing.
    """
    cutoff = datetime.datetime.now().timestamp() - TTL
    users = await get_collection()
    query = {U.LAST_LOGIN: {"$lt": cutoff}}
    # ids first: retiring thousands of users at the rate limit's pace would
    # outlive a cursor
    ids = [u[U.ID] async for u in users.find(query, {U.ID: True})]
    if only_find:
        return ids

    counts: dict[str, int] = {}
    for uid in ids:
        # re-read: they may have logged in, or had their token refreshed
        user = await users.find_one({U.ID: uid, **query})
        if not user:
            continue
        outcome = await retire(user)
        counts[outcome] = counts.get(outcome, 0) + 1
        if outcome == "limited":
            break
    log.info("user triage of %d: %s", len(ids), counts)
    return counts


def stats():
    return DataAPIs.stats(COLLECTION_NAME)


def drop():
    return DataAPIs.drop(COLLECTION_NAME)


#  #### Legacy ######
# One-shot import of the pre-2022 Postgres users table, kept only until the
# legacy database is decommissioned. Needs requirements-migrate.txt installed
# and LEGACY_POSTGRES_URL in the environment.
import os
import json


async def migrate():
    # Imported here so the app does not need SQLAlchemy installed just to boot
    from sqlalchemy import create_engine, text

    # Import legacy Users database
    log.info("Importing users from legacy db")
    # was: os.environ[POSTGRES_URL], which indexed the environment with a
    # connection string -- POSTGRES_URL was already the value, not the key
    pgurl = os.environ["LEGACY_POSTGRES_URL"]
    # .all() must be called inside the connection context: in SQLAlchemy 2.x
    # the Result is invalidated once the connection closes
    # Columns are named rather than "select *": the table has a dt_indexed
    # column between dt_last_active and app_activity_count, and positional
    # unpacking shifted login_count and private by one
    with create_engine(pgurl).connect() as conn:
        results = conn.execute(
            text(
                "select id, firstname, lastname, profile, access_token,"
                " city, state, country, dt_last_active, app_activity_count,"
                " share_profile from users"
            )
        ).all()

    docs = []

    for (
        id,
        firstname,
        lastname,
        profile,
        access_token,
        city,
        state,
        country,
        dt_last_active,
        app_activity_count,
        share_profile,
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
                    # Stored naive from datetime.utcnow(); without the
                    # tzinfo, .timestamp() would read it as local time
                    last_login=dt_last_active.replace(
                        tzinfo=datetime.timezone.utc
                    ).timestamp(),
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
