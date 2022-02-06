from logging import getLogger
from DataAPIs import init_collection

"""
***  For Jupyter notebook ***

Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:

  * %%cython --annotate
      Compile and run the cell

  * %load Updates.py
     Load Updates.py file into this (empty) cell

  * %%writefile Updates.py
      Write the contents of this cell to Updates.py

"""

log = getLogger(__name__)
log.propagate = True

APP_NAME = "heatflask"
COLLECTION_NAME = "updates"

# Maximum size of updates history (for capped MongoDB collection)
MAX_UPDATES_BYTES = 1 * 1024 * 1024

collection_future = None

DATA = {}


async def get_collection():
    if "col" not in DATA:
        DATA["col"] = await init_collection(
            COLLECTION_NAME, force=False, capped_size=MAX_UPDATES_BYTES
        )
    return DATA["col"]


"""
import stravalib
from flask import current_app as app
from datetime import datetime
import pymongo

from . import mongo
from .Users import Users
from .Index import Index

mongodb = mongo.db
log = app.logger

OFFLINE = app.config["OFFLINE"]
STRAVA_CLIENT_ID = app.config["STRAVA_CLIENT_ID"]
STRAVA_CLIENT_SECRET = app.config["STRAVA_CLIENT_SECRET"]
TRIAGE_CONCURRENCY = app.config["TRIAGE_CONCURRENCY"]
ADMIN = app.config["ADMIN"]
BATCH_CHUNK_SIZE = app.config["BATCH_CHUNK_SIZE"]
IMPORT_CONCURRENCY = app.config["IMPORT_CONCURRENCY"]
DAYS_INACTIVE_CUTOFF = app.config["DAYS_INACTIVE_CUTOFF"]
MAX_IMPORT_ERRORS = app.config["MAX_IMPORT_ERRORS"]

TTL_INDEX = app.config["TTL_INDEX"]
TTL_CACHE = app.config["TTL_CACHE"]
TTL_DB = app.config["TTL_DB"]


class Webhooks(object):
    name = "subscription"

    client = stravalib.Client()
    credentials = {"client_id": STRAVA_CLIENT_ID, "client_secret": STRAVA_CLIENT_SECRET}

    @classmethod
    def create(cls, callback_url):
        try:
            subs = cls.client.create_subscription(
                callback_url=callback_url, **cls.credentials
            )
        except Exception as e:
            log.exception("error creating subscription")
            return dict(error=str(e))

        if "updates" not in mongodb.list_collection_names():
            mongodb.create_collection("updates", capped=True, size=1 * 1024 * 1024)
        log.info("create_subscription: %s", subs)
        return dict(created=subs)

    @classmethod
    def handle_subscription_callback(cls, args):
        return cls.client.handle_subscription_callback(args)

    @classmethod
    def delete(cls, subscription_id=None, delete_collection=False):
        if not subscription_id:
            subs_list = cls.list()
            if subs_list:
                subscription_id = subs_list.pop()

        if subscription_id:
            try:
                cls.client.delete_subscription(subscription_id, **cls.credentials)
            except Exception as e:
                log.exception("error deleting webhook subscription")
                return dict(error=str(e))

            if delete_collection:
                mongodb.updates.drop()

            result = dict(success="deleted subscription {}".format(subscription_id))
        else:
            result = dict(error="non-existent/incorrect subscription id")
        log.info(result)
        return result

    @classmethod
    def list(cls):
        subs = cls.client.list_subscriptions(**cls.credentials)
        return [sub.id for sub in subs]

    @classmethod
    def handle_update_callback(cls, update_raw):

        update = cls.client.handle_subscription_update(update_raw)
        user_id = update.owner_id
        try:
            user = Users.get(user_id)
        except Exception:
            log.exception("problem fetching user for update %s", update_raw)
            return

        if (not user) or (not user.index_count()):
            return

        record = dict(
            dt=datetime.utcnow(),
            subscription_id=update.subscription_id,
            owner_id=update.owner_id,
            object_id=update.object_id,
            object_type=update.object_type,
            aspect_type=update.aspect_type,
            updates=update_raw.get("updates"),
        )

        _id = update.object_id

        try:
            mongodb.updates.insert_one(record)
        except Exception:
            log.exception("mongodb error")

        if update.object_type == "athlete":
            return

        if update.aspect_type == "update":
            if update.updates:
                # update the activity if it exists
                result = Index.update(_id, update.updates)
                if not result:
                    log.info(
                        "webhook: %s index update failed for update %s",
                        user,
                        update.updates,
                    )
                    return

        #  If we got here then we know there are index entries
        #  for this user
        if update.aspect_type == "create":
            # fetch activity and add it to the index
            result = Index.import_by_id(user, [_id])
            if result:
                log.debug("webhook: %s create %s %s", user, _id, result)
            else:
                log.info("webhook: %s create %s failed", user, _id)

        elif update.aspect_type == "delete":
            # delete the activity from the index
            Index.delete(_id)

    @staticmethod
    def iter_updates(limit=0):
        updates = mongodb.updates.find(sort=[("$natural", pymongo.DESCENDING)]).limit(
            limit
        )

        for u in updates:
            u["_id"] = str(u["_id"])
            yield u
"""
