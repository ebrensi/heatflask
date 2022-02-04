
"""
from bson import ObjectId
import pymongo
import gevent

from flask import current_app as app
from datetime import datetime

from . import mongo
from .Utility import Utility

mongodb = mongo.db
log = app.logger


class EventLogger(object):
    name = "history"
    db = mongodb.get_collection(name)

    @classmethod
    def init_db(cls, rebuild=True, size=app.config["MAX_HISTORY_BYTES"]):

        collections = mongodb.list_collection_names()

        if (cls.name in collections) and rebuild:
            all_docs = cls.db.find()

            mongodb.create_collection(
                "temp",
                capped=True,
                # autoIndexId=False,
                size=size,
            )

            mongodb.temp.insert_many(all_docs)

            mongodb.temp.rename(cls.name, dropTarget=True)
        else:
            mongodb.create_collection(cls.name, capped=True, size=size)
            log.info("Initialized mongodb collection '%s'", cls.name)

        stats = mongodb.command("collstats", cls.name)
        cls.new_event(msg="rebuilt event log: {}".format(stats))

    @classmethod
    def get_event(cls, event_id):
        event = cls.db.find_one({"_id": ObjectId(event_id)})
        event["_id"] = str(event["_id"])
        return event

    @classmethod
    def get_log(cls, limit=0):
        events = list(cls.db.find(sort=[("$natural", pymongo.DESCENDING)]).limit(limit))
        for e in events:
            e["_id"] = str(e["_id"])
            e["ts"] = Utility.to_epoch(e["ts"])
        return events

    @classmethod
    def live_updates_gen(cls, ts=None):
        def gen(ts):
            abort_signal = None
            while not abort_signal:
                cursor = cls.db.find(
                    {"ts": {"$gt": ts}}, cursor_type=pymongo.CursorType.TAILABLE_AWAIT
                )

                while cursor.alive and not abort_signal:
                    for doc in cursor:
                        doc["ts"] = Utility.to_epoch(doc["ts"])
                        doc["_id"] = str(doc["_id"])

                        abort_signal = yield doc
                        if abort_signal:
                            log.info("live-updates aborted")
                            return

                    # We end up here if the find() returned no
                    # documents or if the tailable cursor timed out
                    # (no new documents were added to the
                    # collection for more than 1 second)
                    gevent.sleep(2)

        if not ts:
            first = cls.db.find().sort("$natural", pymongo.DESCENDING).limit(1).next()

            ts = first["ts"]

        return gen(ts)

    @classmethod
    def new_event(cls, **event):
        event["ts"] = datetime.utcnow()
        try:
            cls.db.insert_one(event)
        except Exception:
            log.exception("error inserting event %s", event)

    @classmethod
    def log_request(cls, flask_request_object, **args):
        req = flask_request_object
        args.update(
            {
                "ip": req.access_route[-1],
                "agent": vars(req.user_agent),
            }
        )
        cls.new_event(**args)
"""
