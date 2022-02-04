



"""
import polyline
import msgpack
import pymongo

from flask import current_app as app
from bson.binary import Binary
from datetime import datetime

from . import redis, mongo
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


#  Activities class is only a proxy to underlying data structures.
#  There are no Activity objects
class Activities(object):
    name = "activities"
    db = mongodb.get_collection(name)

    @classmethod
    def init_db(cls, clear_cache=True):
        # Create/Initialize Activity database
        result = {}
        try:
            result["mongo_drop"] = mongodb.drop_collection(cls.name)
        except Exception as e:
            log.exception("error deleting '%s' collection from MongoDB", cls.name)
            result["mongod_drop"] = str(e)

        if clear_cache:
            to_delete = redis.keys(cls.cache_key("*"))
            pipe = redis.pipeline()
            for k in to_delete:
                pipe.delete(k)

            result["redis"] = pipe.execute()

        result["mongo_create"] = mongodb.create_collection(cls.name)

        result = cls.db.create_index("ts", name="ts", expireAfterSeconds=TTL_DB)
        log.info("initialized '{}' collection".format(cls.name))
        return result

    @classmethod
    def update_ttl(cls, timeout=TTL_DB):

        # Update the MongoDB Activities TTL if necessary
        info = cls.db.index_information()

        if "ts" not in info:
            cls.init_db()
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

            log.info("%s TTL updated: %s", cls.name, result)
        else:
            pass

    @staticmethod
    def bounds(poly):
        if poly:
            latlngs = polyline.decode(poly)

            lats = [ll[0] for ll in latlngs]
            lngs = [ll[1] for ll in latlngs]

            return {"SW": (min(lats), min(lngs)), "NE": (max(lats), max(lngs))}
        else:
            return {}

    @staticmethod
    def stream_encode(vals):
        diffs = [b - a for a, b in zip(vals, vals[1:])]
        encoded = []
        pair = None
        for a, b in zip(diffs, diffs[1:]):
            if a == b:
                if pair:
                    pair[1] += 1
                else:
                    pair = [a, 2]
            else:
                if pair:
                    if pair[1] > 2:
                        encoded.append(pair)
                    else:
                        encoded.extend(2 * [pair[0]])
                    pair = None
                else:
                    encoded.append(a)
        if pair:
            encoded.append(pair)
        else:
            encoded.append(b)
        return encoded

    @staticmethod
    def stream_decode(rll_encoded, first_value=0):
        running_sum = first_value
        out_list = [first_value]

        for el in rll_encoded:
            if isinstance(el, list) and len(el) == 2:
                val, num_repeats = el
                for i in range(num_repeats):
                    running_sum += val
                    out_list.append(running_sum)
            else:
                running_sum += el
                out_list.append(running_sum)

        return out_list

    @staticmethod
    def cache_key(id):
        return "A:{}".format(id)

    @classmethod
    def set(cls, _id, data, ttl=TTL_CACHE):
        # cache it first, in case mongo is down
        packed = msgpack.packb(data)
        redis.setex(cls.cache_key(_id), ttl, packed)

        document = {"ts": datetime.utcnow(), "mpk": Binary(packed)}
        try:
            cls.db.update_one({"_id": int(_id)}, {"$set": document}, upsert=True)
        except Exception:
            log.exception("failed mongodb write: activity %s", id)

    @classmethod
    def set_many(cls, batch_queue, ttl=TTL_CACHE):

        now = datetime.utcnow()
        redis_pipe = redis.pipeline()
        mongo_batch = []
        for _id, data in batch_queue:
            packed = msgpack.packb(data)
            redis_pipe.setex(cls.cache_key(id), ttl, packed)

            document = {"ts": now, "mpk": Binary(packed)}
            mongo_batch.append(
                pymongo.UpdateOne({"_id": int(_id)}, {"$set": document}, upsert=True)
            )

        if not mongo_batch:
            return

        redis_pipe.execute()

        try:
            result = cls.db.bulk_write(mongo_batch, ordered=False)
            return result.bulk_api_result
        except Exception:
            log.exception("Failed mongodb batch write")

    @classmethod
    def get_many(cls, ids, ttl=TTL_CACHE, ordered=False):
        #  for each id in the ids iterable of activity-ids, this
        #  generator yields either a dict of streams
        #  or None if the streams for that activity are not in our
        #  stores.
        #  This generator uses batch operations to process the entire
        #  iterator of ids, so call it in chunks if ids iterator is
        #  a stream.

        # note we are creating a list from the entire iterable of ids!
        keys = [cls.cache_key(id) for id in ids]

        # Attempt to fetch activities with ids from redis cache
        read_pipe = redis.pipeline()
        for key in keys:
            read_pipe.get(key)

        # output and Update TTL for cached actitivities
        notcached = {}
        results = read_pipe.execute()

        write_pipe = redis.pipeline()

        for id, key, cached in zip(ids, keys, results):
            if cached:
                write_pipe.expire(key, ttl)
                yield (id, msgpack.unpackb(cached))
            else:
                notcached[int(id)] = key

        # Batch update TTL for redis cached activity streams
        # write_pipe.execute()
        fetched = set()
        if notcached:
            # Attempt to fetch uncached activities from MongoDB
            try:
                query = {"_id": {"$in": list(notcached.keys())}}
                results = cls.db.find(query)
            except Exception:
                log.exception("Failed mongodb query: %s", query)
                return

            # iterate through results from MongoDB query
            for doc in results:
                id = int(doc["_id"])
                packed = doc["mpk"]

                # Store in redis cache
                write_pipe.setex(notcached[id], ttl, packed)
                fetched.add(id)

                yield (id, msgpack.unpackb(packed))

        # All fetched streams have been sent to the client
        # now we update the data-stores
        write_pipe.execute()

        if fetched:
            # now update TTL for mongoDB records if there were any
            now = datetime.utcnow()
            try:
                cls.db.update_many(
                    {"_id": {"$in": list(fetched)}}, {"$set": {"ts": now}}
                )
            except Exception:
                log.exception("Failed mongoDB update_many")

    @classmethod
    def get(cls, _id, ttl=TTL_CACHE):
        packed = None
        key = cls.cache_key(id)
        cached = redis.get(key)

        if cached:
            redis.expire(key, ttl)  # reset expiration timeout
            packed = cached
        else:
            try:
                document = cls.db.find_one_and_update(
                    {"_id": int(_id)}, {"$set": {"ts": datetime.utcnow()}}
                )

            except Exception:
                log.debug("Failed mongodb find_one_and_update %s", _id)
                return

            if document:
                packed = document["mpk"]
                redis.setex(key, ttl, packed)
        if packed:
            return msgpack.unpackb(packed)

    @classmethod
    def import_streams(cls, client, activity, batch_queue=None):
        if OFFLINE:
            return
        if "_id" not in activity:
            return activity

        _id = activity["_id"]

        # start = time.time()
        # log.debug("%s request import %s", client, _id)

        result = client.get_activity_streams(_id)

        if not result:
            if result is None:
                # a result of None means this activity has no streams
                Index.delete(_id)
                log.debug("%s activity %s EMPTY", client, _id)

            # a result of False means there was an error
            return result

        encoded_streams = {}

        try:
            # Encode/compress latlng data into polyline format
            p = result.pop("latlng")
            encoded_streams["polyline"] = polyline.encode(p)
            encoded_streams["n"] = len(p)
        except Exception:
            log.exception("failed polyline encode for activity %s", _id)
            return False

        for name, stream in result.items():
            # Encode/compress these streams
            try:
                encoded_streams[name] = cls.stream_encode(stream)
            except Exception:
                log.exception(
                    "failed RLE encoding stream '%s' for activity %s", name, _id
                )
                return False

        if batch_queue:
            batch_queue.put((_id, encoded_streams))
        else:
            cls.set(_id, encoded_streams)

        activity.update(encoded_streams)

        # elapsed = round(time.time() - start, 2)
        # log.debug("%s imported %s: elapsed=%s", client, _id, elapsed)
        return activity

    @classmethod
    def append_streams_from_db(cls, summaries):
        # adds actvity streams to an iterable of summaries
        #  summaries must be manageable by a single batch operation
        to_fetch = {}
        for A in summaries:
            if "_id" not in A:
                yield A
            else:
                to_fetch[A["_id"]] = A

        if not to_fetch:
            return

        # yield stream-appended summaries that we were able to
        #  fetch streams for
        for _id, stream_data in cls.get_many(list(to_fetch.keys())):
            if not stream_data:
                continue

            A = to_fetch.pop(_id)
            A.update(stream_data)
            yield A

        # now we yield the rest of the summaries
        for A in to_fetch.values():
            yield A

    @classmethod
    def query(cls, queryObj):
        for user_id in queryObj:
            user = Users.get(user_id)
            if not user:
                continue

            query = queryObj[user_id]
            activities = user.query_activities(**query)

            if activities:
                for a in activities:

                    abort_signal = yield a

                    if abort_signal:
                        activities.send(abort_signal)
                        return

        yield ""
"""
