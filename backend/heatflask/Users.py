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

import DataAPIs
import Utility

log = getLogger(__name__)
log.propagate = True

COLLECTION_NAME = "users"

# Drop a user after a year of inactivity
MONGO_TTL = 365 * 24 * 3600

ADMIN = [15972102]


class Box:
    collection = None


myBox = Box()


async def get_collection():
    if myBox.collection is None:
        myBox.collection = await DataAPIs.init_collection(
            COLLECTION_NAME, ttl=MONGO_TTL
        )
    return myBox.collection


def mongo_doc(
    # From Strava Athlete record
    id=None,
    username=None,
    firstname=None,
    lastname=None,
    profile_medium=None,
    profile=None,
    measurement_preference=None,
    city=None,
    state=None,
    country=None,
    email=None,
    # my additions
    _id=None,
    ts=None,
    auth=None,
    access_count=None,
    private=None,
    **extras
):
    if not (id or _id):
        log.error("cannot create user with no id")
        return

    return Utility.cleandict(
        {
            "_id": int(_id or id),
            "username": username,
            "firstname": firstname,
            "lastname": lastname,
            "profile": profile_medium or profile,
            "units": measurement_preference,
            "city": city,
            "state": state,
            "country": country,
            "email": email,
            #
            "ts": ts,
            "access_count": access_count,
            "auth": auth,
            "private": private,
        }
    )


async def add_or_update(update_ts=False, inc_access_count=False, **strava_athlete):
    users = await get_collection()
    doc = mongo_doc(**strava_athlete)
    if not doc:
        log.exception("error adding/updating user: %s", doc)
        return

    if update_ts:
        doc["ts"] = datetime.datetime.utcnow()

    # We cannot technically "update" the _id field if this user exists
    # in the database, so we need to remove that field from the updates
    user_info = {**doc}
    user_id = user_info.pop("_id")
    updates = {"$set": user_info}

    if inc_access_count:
        updates["$inc"] = {"access_count": 1}

    log.debug("calling mongodb update_one with updates %s", updates)

    # Creates a new user or updates an existing user (with the same id)
    try:
        return await users.find_one_and_update(
            {"_id": user_id},
            updates,
            upsert=True,
            return_document=pymongo.ReturnDocument.AFTER,
        )
    except Exception:
        log.exception("error adding/updating user: %s", doc)


async def get(user_id):
    users = await get_collection()
    uid = int(user_id)
    query = {"_id": uid}
    try:
        return await users.find_one(query)
    except Exception:
        log.exception("Failed mongodb query: %s", query)


# Returns an async iterator
async def get_all():
    users = await get_collection()
    return users.find()


async def delete(user_id):
    users = await get_collection()
    uid = int(user_id)
    try:
        return await users.delete_one({"_id": uid})

    except Exception:
        log.exception("error deleting user %d", uid)


def stats():
    return DataAPIs.stats(COLLECTION_NAME)


def drop():
    return DataAPIs.drop(COLLECTION_NAME)
