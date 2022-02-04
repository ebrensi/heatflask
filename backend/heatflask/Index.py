
"""
import pymongo
import gevent

from flask import current_app as app
from datetime import datetime

from . import mongo
from .Utility import Utility, Timer, FakeQueue
from .EventLogger import EventLogger
from .StravaClient import StravaClient

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


class Index(object):
    name = "index"
    db = mongodb.get_collection(name)

    @classmethod
    # Initialize the database
    def init_db(cls, clear_cache=False):
        # drop the "indexes" collection
        try:
            mongodb.drop_collection(cls.name)

            # create new index collection
            mongodb.create_collection(cls.name)
            cls.db.create_index(
                [("user_id", pymongo.ASCENDING), ("ts_local", pymongo.DESCENDING)]
            )

            cls.db.create_index("ts", name="ts", expireAfterSeconds=TTL_INDEX)
        except Exception:
            log.exception("MongoDB error initializing %s collection", cls.name)

        log.info("initialized '%s' collection:", cls.name)

    @classmethod
    def update_ttl(cls, timeout=TTL_INDEX):

        # Update the MongoDB Index TTL if necessary
        info = cls.db.index_information()

        if "ts" not in info:
            cls.init_db
            return

        current_ttl = info["ts"]["expireAfterSeconds"]

        if current_ttl != timeout:
            result = mongodb.command(
                "collMod",
                cls.name,
                index={
                    "keyPattern": {"ts": 1},
                    "background": True,
                    "expireAfterSeconds": timeout,
                },
            )

            log.info("'%s' db TTL updated: %s", cls.name, result)
        else:
            # log.debug("no need to update TTL")
            pass

    @classmethod
    def delete(cls, id):
        try:
            return cls.db.delete_one({"_id": id})
        except Exception:
            log.exception("error deleting index summary %s", id)
            return

    @classmethod
    def update(cls, id, updates, replace=False):
        if not updates:
            return

        if replace:
            doc = {"_id": id}
            updates.update(doc)
            try:
                cls.db.replace_one(doc, updates, upsert=True)
            except Exception:
                log.exception("mongodb error")
                return

        if "title" in updates:
            updates["name"] = updates["title"]
            del updates["title"]

        try:
            return cls.db.update_one({"_id": id}, {"$set": updates})
        except Exception:
            log.exception("mongodb error")

    @classmethod
    def delete_user_entries(cls, user):
        try:
            result = cls.db.delete_many({"user_id": user.id})
            log.debug("deleted index entries for %s", user)
            return result
        except Exception:
            log.exception("error deleting index entries for %s from MongoDB", user)

    @classmethod
    def user_index_size(cls, user):
        try:
            activity_count = cls.db.count_documents({"user_id": user.id})
        except Exception:
            log.exception("Error retrieving activity count for %s", user)
            return
        else:
            return activity_count

    @classmethod
    def _import(
        cls,
        client,
        queue=None,
        fetch_query={},
        out_query={},
    ):
        # this method runs in a greenlet and does not have access to the
        #   current_app object.  anything that requires app context will
        #   raise a RuntimeError

        if OFFLINE:
            if queue:
                queue.put(dict(error="No network connection"))
            return
        user = client.user

        for query in [fetch_query, out_query]:
            if "before" in query:
                query["before"] = Utility.to_datetime(query["before"])
            if "after" in query:
                query["after"] = Utility.to_datetime(query["after"])

        activity_ids = out_query.get("activity_ids")
        if activity_ids:
            activity_ids = set(int(_id) for _id in activity_ids)

        after = out_query.get("after")
        before = out_query.get("before")
        check_dates = before or after

        limit = out_query.get("limit")

        #  If we are getting the most recent n activities (limit) then
        #  we will need them to be in order.
        # otherwise, unordered fetching is faster
        if limit or check_dates:
            fetch_query["ordered"] = True

        count = 0
        in_range = False
        mongo_requests = []
        user = client.user
        user.indexing(0)

        timer = Timer()
        log.debug("%s building index", user)

        def in_date_range(dt):
            # log.debug(dict(dt=dt, after=after, before=before))
            t1 = (not after) or (after <= dt)
            t2 = (not before) or (dt <= before)
            result = t1 and t2
            return result

        if not (queue and out_query):
            queue = FakeQueue()

        if out_query:
            yielding = True

        try:

            summaries = client.get_activities(**fetch_query)

            dtnow = datetime.utcnow()
            for d in summaries:
                if not d or "_id" not in d:
                    continue

                d["ts"] = dtnow
                ts_local = None

                count += 1
                if not (count % 10):
                    user.indexing(count)
                    queue.put({"idx": count})

                if yielding:
                    d2 = d.copy()

                    # cases for outputting this activity summary
                    try:
                        if activity_ids:
                            if d2["_id"] in activity_ids:
                                queue.put(d2)
                                activity_ids.discard(d2["_id"])
                                if not activity_ids:
                                    raise StopIteration

                        elif limit:
                            if count <= limit:
                                queue.put(d2)
                            else:
                                raise StopIteration

                        elif check_dates:
                            ts_local = Utility.to_datetime(d2["ts_local"])
                            if in_date_range(ts_local):
                                queue.put(d2)

                                if not in_range:
                                    in_range = True

                            elif in_range:
                                # the current activity's date was in range
                                # but is no longer. (and are in order)
                                # so we can safely say there will not be any more
                                # activities in range
                                raise StopIteration

                        else:
                            queue.put(d2)

                    except StopIteration:
                        queue.put(StopIteration)
                        #  this iterator is done for the consumer
                        log.debug("%s index build done yielding", user)
                        queue = FakeQueue()
                        yielding = False

                # put d in storage
                if ts_local:
                    d["ts_local"] = ts_local
                else:
                    d["ts_local"] = Utility.to_datetime(d["ts_local"])

                mongo_requests.append(
                    pymongo.ReplaceOne({"_id": d["_id"]}, d, upsert=True)
                )

            if mongo_requests:
                result = cls.db.bulk_write(list(mongo_requests), ordered=False)
                # log.debug(result.bulk_api_result)

        except Exception as e:
            log.exception("%s index import error", user)
            queue.put(dict(error=str(e)))

        else:
            elapsed = timer.elapsed()
            msg = "{} index {}".format(
                user,
                dict(dt=elapsed, n=count, rate=round(count / elapsed, 2))
                if elapsed
                else None,
            )

            log.info(msg)
            EventLogger.new_event(msg=msg)
            queue.put(dict(msg="done indexing {} activities.".format(count)))
        finally:
            queue.put(StopIteration)
            user.indexing(False)

    @classmethod
    def import_user_index(
        cls,
        client=None,
        user=None,
        fetch_query={},
        out_query={},
        blocking=True,
    ):

        log.debug(client)
        if not client:
            client = StravaClient(user=user)

        if not client:
            return [{"error": "invalid user client. not authenticated?"}]

        args = dict(
            fetch_query=fetch_query,
            out_query=out_query,
        )

        if out_query:
            # The presence of out_query means the caller wants
            #  us to output activities while building the index
            queue = gevent.queue.Queue()
            args.update(dict(queue=queue))
            gevent.spawn(cls._import, client, **args)

            def index_gen(queue):
                abort_signal = False
                for A in queue:
                    if not abort_signal:
                        abort_signal = yield A

            return index_gen(queue)

        if blocking:
            cls._import(client, **args)
        else:
            gevent.spawn(cls._import, client, **args)

    @classmethod
    def import_by_id(cls, user, activity_ids):
        client = StravaClient(user=user)
        if not client:
            return

        pool = gevent.pool.Pool(IMPORT_CONCURRENCY)
        dtnow = datetime.utcnow()

        import_stats = dict(errors=0, imported=0, empty=0)
        mongo_requests = []
        timer = Timer()
        for d in pool.imap_unordered(client.get_activity, activity_ids):
            if not d:
                if d is False:
                    import_stats["errors"] += 1
                else:
                    import_stats["empty"] += 1
                continue

            d["ts"] = dtnow
            d["ts_local"] = Utility.to_datetime(d["ts_local"])

            mongo_requests.append(pymongo.ReplaceOne({"_id": d["_id"]}, d, upsert=True))

        if mongo_requests:
            try:
                cls.db.bulk_write(mongo_requests, ordered=False)
            except Exception:
                log.exception("mongo error")
            else:
                import_stats["imported"] += len(mongo_requests)

        import_stats["elapsed"] = timer.elapsed()

        return Utility.cleandict(import_stats)

    @classmethod
    def query(
        cls,
        user=None,
        activity_ids=None,
        exclude_ids=None,
        after=None,
        before=None,
        limit=0,
        update_ts=True,
    ):

        if activity_ids:
            activity_ids = set(int(id) for id in activity_ids)

        if exclude_ids:
            exclude_ids = set(int(id) for id in exclude_ids)

        limit = int(limit) if limit else 0

        query = {}
        out_fields = None

        if user:
            query["user_id"] = user.id
            out_fields = {"user_id": False}

        tsfltr = {}
        if before:
            before = Utility.to_datetime(before)
            tsfltr["$lt"] = before

        if after:
            after = Utility.to_datetime(after)
            tsfltr["$gte"] = after

        if tsfltr:
            query["ts_local"] = tsfltr

        if activity_ids:
            query["_id"] = {"$in": list(activity_ids)}

        to_delete = None

        if exclude_ids:
            try:
                result = (
                    cls.db.find(query, {"_id": True})
                    .sort("ts_local", pymongo.DESCENDING)
                    .limit(limit)
                )

            except Exception:
                log.exception("mongo error")
                return

            query_ids = set(int(doc["_id"]) for doc in result)

            to_delete = list(exclude_ids - query_ids)
            to_fetch = list(query_ids - exclude_ids)

            yield {"delete": to_delete}
            yield {"count": len(to_fetch)}

            query["_id"] = {"$in": to_fetch}

        else:
            count = cls.db.count_documents(query)
            if limit:
                count = min(limit, count)
            yield {"count": count}

        try:
            if out_fields:
                cursor = cls.db.find(query, out_fields)
            else:
                cursor = cls.db.find(query)

            cursor = cursor.sort("ts_UTC", pymongo.DESCENDING).limit(limit)

        except Exception:
            log.exception("mongo error")
            return

        ids = set()

        for a in cursor:
            if update_ts:
                ids.add(a["_id"])
            yield a

        if update_ts:
            try:
                result = cls.db.update_many(
                    {"_id": {"$in": list(ids)}}, {"$set": {"ts": datetime.utcnow()}}
                )
            except Exception:
                log.exception("mongo error")
"""
