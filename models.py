from flask_login import UserMixin
from sqlalchemy.dialects import postgresql as pg
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect
from datetime import datetime
import dateutil
import stravalib
import polyline
import pymongo
import itertools

from redis import Redis

import pandas as pd
import gevent
from gevent.queue import Queue
from gevent.pool import Pool
from exceptions import StopIteration
import requests
# from requests.exceptions import HTTPError
import cPickle
import msgpack
from bson import ObjectId
from bson.binary import Binary
from heatflask import app

import os

CONCURRENCY = app.config["CONCURRENCY"]
STREAMS_OUT = ["polyline", "time"]
STREAMS_TO_CACHE = ["polyline", "time"]
CACHE_USERS_TIMEOUT = app.config["CACHE_USERS_TIMEOUT"]
CACHE_ACTIVITIES_TIMEOUT = app.config["CACHE_ACTIVITIES_TIMEOUT"]
INDEX_UPDATE_TIMEOUT = app.config["INDEX_UPDATE_TIMEOUT"]
LOCAL = os.environ.get("APP_SETTINGS") == "config.DevelopmentConfig"
OFFLINE = app.config.get("OFFLINE")

# PostgreSQL access via SQLAlchemy
db_sql = SQLAlchemy(app)  # , session_options={'expire_on_commit': False})
Column = db_sql.Column
String, Integer, Boolean = db_sql.String, db_sql.Integer, db_sql.Boolean

# MongoDB access via PyMongo
mongo_client = pymongo.MongoClient(app.config.get("MONGODB_URI"))
mongodb = mongo_client.get_database()

# Redis data-store
redis = Redis.from_url(app.config["REDIS_URL"])


log = app.logger


class Users(UserMixin, db_sql.Model):
    id = Column(Integer, primary_key=True, autoincrement=False)

    # These fields get refreshed every time the user logs in.
    #  They are only stored in the database to enable persistent login
    username = Column(String())
    firstname = Column(String())
    lastname = Column(String())
    profile = Column(String())
    access_token = Column(String())

    measurement_preference = Column(String())
    city = Column(String())
    state = Column(String())
    country = Column(String())
    email = Column(String())

    dt_last_active = Column(pg.TIMESTAMP)
    app_activity_count = Column(Integer, default=0)
    share_profile = Column(Boolean, default=False)

    def db_state(self):
        state = inspect(self)
        attrs = ["transient", "pending", "persistent", "deleted", "detached"]
        return [attr for attr in attrs if getattr(state, attr)]

    def serialize(self):
        return cPickle.dumps(self)

    def info(self):
        profile = {}
        profile.update(vars(self))
        del profile["_sa_instance_state"]
        if "activity_index" in profile:
            del profile["activity_index"]
        # log.debug("{}: {}".format(self, profile))
        return profile

    @classmethod
    def from_serialized(cls, p):
        return cPickle.loads(p)

    def client(self):
        try:
            return self.cli
        except AttributeError:
            self.cli = stravalib.Client(
                access_token=self.access_token,
                rate_limiter=(lambda x=None: None)
            )
            return self.cli

    def __repr__(self):
        return "<User %r>" % (self.id)

    def get_id(self):
        return unicode(self.id)

    def is_admin(self):
        return self.id in app.config["ADMIN"]

    @staticmethod
    def strava_data_from_token(token, log_error=True):
        client = stravalib.Client(access_token=token)
        try:
            strava_user = client.get_athlete()
        except Exception as e:
            if log_error:
                log.error("error getting user data from token: {}"
                          .format(e))
        else:
            return {
                "id": strava_user.id,
                "username": strava_user.username,
                "firstname": strava_user.firstname,
                "lastname": strava_user.lastname,
                "profile": strava_user.profile_medium or strava_user.profile,
                "measurement_preference": strava_user.measurement_preference,
                "city": strava_user.city,
                "state": strava_user.state,
                "country": strava_user.country,
                "email": strava_user.email,
                "access_token": token
            }

    @staticmethod
    def key(identifier):
        return "U:{}".format(identifier)

    def cache(self, identifier=None, timeout=CACHE_USERS_TIMEOUT):
        key = self.__class__.key(identifier or self.id)
        try:
            del self.cli
        except Exception as e:
            pass

        packed = self.serialize()
        # log.debug(
        #     "caching {} with key '{}' for {} sec. size={}"
        #     .format(self, key, timeout, len(packed))
        # )
        return redis.setex(key, packed, timeout)

    def uncache(self):
        # log.debug("uncaching {}".format(self))

        # delete from cache too.  It may be under two different keys
        redis.delete(self.__class__.key(self.id))
        redis.delete(self.__class__.key(self.username))

    def update_usage(self):
        self.dt_last_active = datetime.utcnow()
        self.app_activity_count = self.app_activity_count + 1
        db_sql.session.commit()
        self.cache()
        return self

    @classmethod
    def add_or_update(cls, cache_timeout=CACHE_USERS_TIMEOUT, **kwargs):
        if not kwargs:
            log.debug("attempted to add_or_update user with no data")
            return

        # Creates a new user or updates an existing user (with the same id)
        detached_user = cls(**kwargs)
        try:
            persistent_user = db_sql.session.merge(detached_user)
            db_sql.session.commit()

        except Exception as e:
            db_sql.session.rollback()
            log.error(
                "error adding/updating user {}: {}".format(kwargs, e))
        else:
            if persistent_user:
                persistent_user.cache(cache_timeout)
                # log.info("updated {} with {}"
                #                 .format(persistent_user, kwargs))
            return persistent_user

    @classmethod
    def get(cls, user_identifier, timeout=CACHE_USERS_TIMEOUT):
        key = cls.key(user_identifier)
        cached = redis.get(key)
        if cached:
            redis.expire(key, CACHE_USERS_TIMEOUT)
            try:
                user = cls.from_serialized(cached)
                # log.debug(
                #     "retrieved {} from cache with key {}".format(user, key))
                return db_sql.session.merge(user, load=False)
            except Exception:
                # apparently this cached user object is no good so let's
                #  delete it
                redis.delete(key)

        # Get user from db by id or username
        try:
            # try casting identifier to int
            user_id = int(user_identifier)
        except ValueError:
            # if that doesn't work then assume it's a string username
            user = cls.query.filter_by(username=user_identifier).first()
        else:
            user = cls.query.get(user_id)

        if user:
            user.cache(user_identifier, timeout)

        return user if user else None

    def delete(self, deauth=True):
        self.delete_index()
        self.uncache()
        if deauth:
            try:
                self.client().deauthorize()
            except Exception:
                pass
        db_sql.session.delete(self)
        db_sql.session.commit()

    @classmethod
    def triage(cls, days_inactive=365, test_run=True):
        # Delete all users from the database who have invalid access tokens
        #  or have been inactive for a long time (defaults to a year)
        now = datetime.utcnow()

        with app.app_context():
            def user_data(user):
                last_active = user.dt_last_active
                if last_active and (now - last_active).days < days_inactive:
                    data = cls.strava_data_from_token(user.access_token, log_error=False)
                    return data if data else user

                elif not test_run:
                    # if the user has been inactive then deauthorize
                    #  (we don't delete from the database here because it
                    #   might create more connections)
                    try:
                        user.client().deauthorize()
                    except Exception:
                        pass
                return user

            P = Pool(2)
            num_deleted = 0
            count = 0
            try:
                for obj in P.imap_unordered(user_data, cls.query):
                    if type(obj) == cls:
                        msg = "inactive or invalid user {}".format(obj)
                        if not test_run:
                            obj.delete(deauth=False)
                            msg += "...deleted"
                            num_deleted += 1
                    else:
                        user = cls.add_or_update(cache_timeout=60, **obj)
                        msg = "successfully updated {}".format(user)
                    # log.info(msg)
                    yield msg + "\n"
                    count += 1

                EventLogger.new_event(
                    msg="updated Users database: deleted {} invalid users, count={}"
                        .format(num_deleted, count - num_deleted)
                )

                yield (
                    "done! {} invalid users deleted, old count: {}, new count: {}"
                    .format(num_deleted, count, count - num_deleted)
                )
            except Exception as e:
                log.info("error: {}".format(e))
                P.kill()

    @classmethod
    def dump(cls, attrs, **filter_by):
        dump = [{attr: getattr(user, attr) for attr in attrs}
                for user in cls.query.filter_by(**filter_by)]
        return dump

    @classmethod
    def backup(cls):
        fields = [
            "id", "access_token", "dt_last_active", "app_activity_count",
            "share_profile"
        ]
        dump = cls.dump(fields)

        mongodb.users.insert_one({"backup": dump, "ts": datetime.utcnow()})
        return dump

    @classmethod
    def restore(cls, users_list=None):

        def update_user_data(user_data):
            strava_data = cls.strava_data_from_token(
                user_data.get("access_token")
            )
            if strava_data:
                user_data.update(strava_data)
                return user_data
            else:
                log.info("problem updating user {}"
                                .format(user_data["id"]))

        if not users_list:
            doc = mongodb.users.find_one()
            if doc:
                users_list = doc.get("backup")
            else:
                return

        # erase user table
        result = db_sql.drop_all()
        log.info("dropping Users table: {}".format(result))

        # delete all users from the Redis cache
        keys_to_delete = redis.keys(Users.key("*"))
        if keys_to_delete:
            result = redis.delete(*keys_to_delete)
            log.info("dropping cached User objects: {}".format(result))

        # create new user table
        result = db_sql.create_all()
        log.info("creating Users table: {}".format(result))

        # rebuild table with user backup updated with current info from Strava
        count_before = len(users_list)
        count = 0
        P = Pool(CONCURRENCY)
        for user_dict in P.imap_unordered(update_user_data, users_list):
            if user_dict:
                user = cls.add_or_update(cache_timeout=10, **user_dict)
                if user:
                    count += 1
                    log.debug("successfully restored/updated {}"
                                     .format(user))
        return {
            "operation": "users restore",
            "before": count_before,
            "after": count
        }

    def delete_index(self):
        return Index.delete_user_entries(self)

    def indexing(self, status=None):
        # Indicate to other processes that we are currently indexing
        #  This should not take any longer than 30 seconds
        key = "indexing {}".format(self.id)
        if status is None:
            return redis.get(key) == "True"
        elif status:
            return redis.setex(key, status, 60)
        else:
            redis.delete(key)

    def build_index(self, **args):
        queue = Queue()
        gevent.spawn(
            Index.import_user,
            self,
            out_queue=queue,
            out_query=args,
            fetch_query={"limit": 0}
        )
        gevent.sleep(0)
        return queue

    def update_index(self, activity_ids=[], reset_ttl=True):
        pass

    def query_activities(self, 
                         activity_ids=None,
                         limit=None,
                         after=None, before=None,
                         only_ids=False,
                         summaries=True,
                         streams=False,
                         owner_id=False,
                         build_index=True,
                         pool=None,
                         out_queue=None,
                         cache_timeout=CACHE_ACTIVITIES_TIMEOUT,
                         **kwargs):

        if self.indexing():
            return [{
                    "error": "Building activity index for {}".format(self.id)
                    + "...<br>Please try again in a few seconds.<br>"
                    }]

        # convert date strings to datetimes, if applicable
        if before or after:
            try:
                after = Utility.to_datetime(after)
                if before:
                    before = Utility.to_datetime(before)
                    assert(before > after)
            except AssertionError:
                return [{"error": "Invalid Dates"}]


        def import_streams(client, queue, activity):
            # log.debug("importing {}".format(activity["id"]))

            stream_data = Activities.import_streams(
                client, activity["id"], STREAMS_TO_CACHE, cache_timeout)

            data = {s: stream_data[s] for s in STREAMS_OUT + ["error"]
                    if s in stream_data}
            data.update(activity)
            queue.put(data)
            # log.debug("importing {}...queued!".format(activity["id"]))
            gevent.sleep(0)

        pool = pool or Pool(CONCURRENCY)
        client = self.client()

        #  If out_queue is not supplied then query_activities is blocking
        put_stopIteration = False
        if not out_queue:
            out_queue = Queue()
            put_stopIteration = True

        index_df = None
        if (summaries or limit or only_ids or after or before):
            activity_index = self.get_index()

            if activity_index:
                index_df = activity_index["index_df"]
                elapsed = (datetime.utcnow() -
                           activity_index["dt_last_indexed"]).total_seconds()

                # update the index if we need to
                if (not OFFLINE) and (elapsed > INDEX_UPDATE_TIMEOUT):
                    index_df = self.update_index(index_df)

                if (not activity_ids):
                    # only consider activities with a summary polyline

                    ids_df = (
                        index_df[index_df.summary_polyline.notnull()]
                        .set_index("ts_local")
                        .sort_index(ascending=False)
                        .id
                    )

                    if limit:
                        ids_df = ids_df.head(int(limit))

                    elif before or after:
                        #  get ids of activities in date-range
                        if after:
                            ids_df = ids_df[:after]
                        if before:
                            ids_df = ids_df[before:]

                    activity_ids = ids_df.tolist()

                index_df = index_df.astype(
                    Users.index_df_out_dtypes).set_index("id")

                if only_ids:
                    out_queue.put(activity_ids)
                    out_queue.put(StopIteration)
                    return out_queue

                def summary_gen():
                    for aid in activity_ids:
                        A = {"id": int(aid)}
                        if summaries:
                            A.update(index_df.loc[int(aid)].to_dict())
                        # log.debug(A)
                        yield A
                gen = summary_gen()

            elif build_index:
                # There is no activity index and we are to build one
                if only_ids:
                    return ["build"]

                else:
                    gen = Queue()
                    gevent.spawn(self.build_index,
                                 gen,
                                 limit,
                                 after,
                                 before,
                                 activity_ids)
            else:
                # Finally, if there is no index and rather than building one
                # we are requested to get the summary data directily from Strava
                # log.info(
                #     "{}: getting summaries from Strava without build"
                #     .format(self))
                gen = (
                    Activities.strava2dict(a)
                    for a in self.client().get_activities(
                        limit=limit,
                        before=before,
                        after=after)
                )

        for A in gen:
            if "stop_rendering" in A:
                pool.join()

            if "id" not in A:
                out_queue.put(A)
                continue

            if summaries:
                if ("bounds" not in A):
                    A["bounds"] = Activities.bounds(A["summary_polyline"])

                A["ts_local"] = str(A["ts_local"])

                # # TODO: do this on the client
                # A.update(Activities.atype_properties(A["type"]))

            if owner_id:
                A.update({"owner": self.id, "profile": self.profile})

            if not streams:
                out_queue.put(A)

            else:
                stream_data = Activities.get(A["id"])

                if stream_data:
                    A.update(stream_data)
                    if ("bounds" not in A):
                        A["bounds"] = Activities.bounds(A["polyline"])
                    out_queue.put(A)

                elif not OFFLINE:
                    pool.spawn(Activities.import_and_queue_streams,
                               client, out_queue, A)
                gevent.sleep(0)

        # If we are using our own queue, we make sure to put a stopIteration
        #  at the end of it so we have to wait for all import jobs to finish.
        #  If the caller supplies a queue, can return immediately and let them
        #   handle responsibility of adding the stopIteration.
        if put_stopIteration:
            pool.join()
            out_queue.put(StopIteration)

        return out_queue

    #  outputs a stream of activites of other Heatflask users that are
    #   considered by Strava to be part of a group-activity
    def related_activities(self, activity_id, streams=False,
                           pool=None, out_queue=None):
        client = self.client()

        put_stopIteration = True if not out_queue else False

        out_queue = out_queue or Queue()
        pool = pool or Pool(CONCURRENCY)

        trivial_list = []

        # First we put this activity
        try:
            A = client.get_activity(int(activity_id))
        except Exception as e:
            log.info("Error getting this activity: {}".format(e))
        else:
            trivial_list.append(A)

        try:
            related_activities = list(
                client.get_related_activities(int(activity_id)))

        except Exception as e:
            log.info("Error getting related activities: {}".format(e))
            return [{"error": str(e)}]

        for obj in itertools.chain(related_activities, trivial_list):
            if streams:
                owner = self.__class__.get(obj.athlete.id)

                if owner:
                    # the owner is a Heatflask user
                    A = Activities.strava2dict(obj)
                    A["ts_local"] = str(A["ts_local"])
                    A["owner"] = owner.id
                    A["profile"] = owner.profile
                    A["bounds"] = Activities.bounds(A["summary_polyline"])
                    
                    stream_data = Activities.get(obj.id)
                    if stream_data:
                        A.update(stream_data)
                        out_queue.put(A)
                    else:
                        pool.spawn(
                            Activities.import_and_queue_streams,
                            owner.client(), out_queue, A)
            else:
                # we don't care about activity streams
                A = Activities.strava2dict(obj)

                A["ts_local"] = str(A["ts_local"])
                A["profile"] = "/avatar/athlete/medium.png"
                A["owner"] = obj.athlete.id
                A["bounds"] = Activities.bounds(A["summary_polyline"])
            
                out_queue.put(A)

        if put_stopIteration:
            out_queue.put(StopIteration)

        return out_queue

    def make_payment(self, amount):
        success = Payments.add(self, amount)
        return success

    def payment_record(self, after=None, before=None):
        return Payments.get(self, after=after, before=before)


class Index(object):
    name = "index"
    db = mongodb.get_collection(name)

    @classmethod
    # Initialize the database
    def init_db(cls, clear_cache=False):
        # drop the "indexes" collection
        mongodb.drop_collection(cls.name)

        # create new index collection
        mongodb.create_collection(cls.name)

        # timeout = app.config["STORE_INDEX_TIMEOUT"]

        cls.db.create_index("user")
        cls.db.create_index(("ts_UTC", mongodb.DESCENDING))
        cls.db.create_index(("start_latlng", pymongo.GEO2D))

        log.info("initialized Index collection")

    @classmethod
    def strava2doc(cls, a):
        # polyline = a.map.summary_polyline
        d = {
            "_id": a.id,
            "user_id": a.athlete.id,
            "name": a.name,
            "type": a.type,
            "ts_UTC": a.start_date,
            "group": a.athlete_count,
            "ts_local": a.start_date_local,
            "total_distance": float(a.distance),
            "elapsed_time": int(a.elapsed_time.total_seconds()),
            "average_speed": float(a.average_speed),
            "start_latlng": a.start_latlng[0:2] if a.start_latlng else None,
            # "bounds": cls.bounds(polyline) if polyline else None
        }
        return d

    @classmethod
    def add(cls, a):
        doc = cls.strava2doc(a)
        try:
            result = cls.db.replace_one({"_id": a.id}, doc, upsert=True)
        except Exception as e:
            log.exception(e)
            return

        return result

    @classmethod
    def delete(cls, id):
        try:
            return cls.db.delete_one({"_id": id})
        except Exception as e:
            log.exception(e)
            return

    @classmethod
    def update(cls, id, updates):
        if "title" in updates:
            updates["name"] = updates["title"]
            del updates["title"]
        try:
            return cls.db.update_one({"_id": id}, {"$set": updates})
        except Exception as e:
            log.exception(e)

    @classmethod
    def delete_user_entries(cls, user):
        try:
            return cls.db.index.delete_many({"user_id": user.id})
        except Exception as e:
            log.error(
                "error deleting index entries for user {} from MongoDB:\n{}"
                .format(user, e)
            )

    @classmethod
    def import_user(cls, user, out_queue=None,
                        fetch_query={"limit": 0},
                        out_query={}):

        for query in [fetch_query, out_query]:
            if "before" in query:
                query["before"] = Utility.to_datetime(query["before"])
            if "after" in query:
                query["after"] = Utility.to_datetime(query["after"])

        def enqueue(msg):
            if out_queue is None:
                pass
            else:
                # log.debug(msg)
                out_queue.put(msg)

        count = 0
        mongo_requests = []
        rendering = True
        user.indexing(True)
        start_time = datetime.utcnow()
        log.debug("building activity index for {}".format(user))

        activity_ids = out_query.get("activity_ids")
        after = out_query.get("after")
        before = out_query.get("before")
        limit = out_query.get("limit")

        def in_date_range(dt):
            if not (before or after):
                return

            t1 = (not after) or (after <= dt)
            t2 = (not before) or (dt <= before)
            result = (t1 and t2)
            return result

        try:
            for a in user.client().get_activities(**fetch_query):
                if a.start_latlng:
                    d = cls.strava2doc(a)
                    # log.debug("{}. {}".format(count, d))
                    mongo_requests.append(
                        pymongo.ReplaceOne({"_id": a.id}, d, upsert=True)
                    )
                    count += 1

                    if out_queue:
                        # If we are also sending data to the front-end,
                        # we do this via a queue.
                        if (rendering and
                            ((activity_ids and (d["_id"] in activity_ids)) or
                             (limit and (count <= limit)) or
                                in_date_range(d["ts_local"]))):

                            d2 = dict(d)
                            d2["id"] = d2["_id"]
                            del d2["_id"]
                            d2["ts_local"] = str(d2["ts_local"])

                            out_queue.put(d2)

                            if activity_ids:
                                activity_ids.remove(d["id"])
                                if not activity_ids:
                                    rendering = False
                                    out_queue.put({"stop_rendering": "1"})

                        if (rendering and
                            ((limit and count >= limit) or
                                (after and (d["ts_local"] < after)))):
                            rendering = False
                            out_queue.put({"stop_rendering": "1"})

                        out_queue.put(
                            {"msg": "indexing...{} activities".format(count)}
                        )
                        gevent.sleep(0)
            gevent.sleep(0)


            # If we are streaming to a client, this is where we tell it
            #  stop listening by pushing a StopIteration the queue
            if not mongo_requests:
                if out_queue:
                    out_queue.put({"error": "No activities!"})
                    out_queue.put(StopIteration)
                EventLogger.new_event(
                    msg="no activities for {}".format(user.id)
                )
                result = []
            else:
                result = cls.db.index.bulk_write(
                    mongo_requests,
                    ordered=False
                )
        except Exception as e:
            if out_queue:
                out_queue.put({"error": str(e)})
            log.debug("Error while building activity index")
            log.exception(e)
        else:
            elapsed = datetime.utcnow() - start_time
            msg = (
                "{}'s index built in {} sec. count={}"
                .format(user.id, round(elapsed.total_seconds(), 3), count)
            )

            log.debug(msg)
            EventLogger.new_event(msg=msg)
            if out_queue:
                out_queue.put({"msg": "done indexing {} activities.".format(count)})
        finally:
            user.indexing(False)
            if out_queue:
                out_queue.put(StopIteration)

    @classmethod
    def import_by_id(cls, user, activity_ids):
        fetch = user.client().get_activity
        pool = Pool(CONCURRENCY)
        strava_activities = pool.imap_unordered(fetch, activity_ids)
        A = map(cls.strava2doc, strava_activities)
        cls.db.insert_many(A)

    @classmethod
    def query(cls, user=None,
              activity_ids=None,
              after=None, before=None,
              limit=0,
              out_fields=None):

        query = {}
        if user:
            query["user_id"] = user.id

        if activity_ids:
            query["_id"] = {"$in": activity_ids}

        tsfltr = {}
        if before:
            before = Utility.to_datetime(before)
            tsfltr["$lt"] = before
        if after:
            after = Utility.to_datetime(after)
            tsfltr["$gte"] = after
        if tsfltr:
            query["ts_local"] = tsfltr

        log.debug(query)
        try:
            if out_fields:
                cursor = cls.db.index.find(query, out_fields)
            else:
                cursor = cls.db.index.find(query)
            cursor = cursor.limit(limit).sort("ts_UTC", pymongo.DESCENDING)

        except Exception as e:
            log.error(
                "error accessing mongodb indexes collection:\n{}"
                .format(e)
            )
            return []

        return cursor


#  Activities class is only a proxy to underlying data structures.
#  There are no Activity objects
class Activities(object):

    @classmethod
    def init(cls, clear_cache=False):
        # Create/Initialize Activity database
        try:
            result1 = mongodb.activities.drop()
        except Exception as e:
            log.debug(
                "error deleting activities collection from MongoDB.\n{}"
                .format(e))
            result1 = e

        if clear_cache:
            to_delete = redis.keys(cls.cache_key("*"))
            if to_delete:
                result2 = redis.delete(*to_delete)
            else:
                result2 = None

        mongodb.create_collection("activities")

        timeout = app.config["STORE_ACTIVITIES_TIMEOUT"]
        result = mongodb["activities"].create_index(
            "ts",
            expireAfterSeconds=timeout
        )
        log.info("initialized Activity collection")
        return result
        
    @staticmethod
    def bounds(poly):
        if poly:
            latlngs = polyline.decode(poly)

            lats = [ll[0] for ll in latlngs]
            lngs = [ll[1] for ll in latlngs]

            return {
                "SW": (min(lats), min(lngs)),
                "NE": (max(lats), max(lngs))
            }
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
                for i in xrange(num_repeats):
                    running_sum += val
                    out_list.append(running_sum)
            else:
                running_sum += el
                out_list.append(running_sum)

        return out_list

    @classmethod
    def strava2dict(cls, a):
        d = {
            "id": a.id,
            "name": a.name,
            "type": a.type,
            "ts_UTC": a.start_date,
            "group": a.athlete_count,
            "ts_local": a.start_date_local,
            "total_distance": float(a.distance),
            "elapsed_time": int(a.elapsed_time.total_seconds()),
            "average_speed": float(a.average_speed),
            "start_latlng": a.start_latlng[0:2] if a.start_latlng else None,
            "bounds": cls.bounds(a.map.summary_polyline) if a.map.summary_polyline else None
        }
        return d

    @staticmethod
    def cache_key(id):
        return "A:{}".format(id)

    @classmethod
    def set(cls, id, data, timeout=CACHE_ACTIVITIES_TIMEOUT):
        # cache it first, in case mongo is down
        packed = msgpack.packb(data)
        result1 = redis.setex(cls.cache_key(id), packed, timeout)

        document = {
            "ts": datetime.utcnow(),
            "mpk": Binary(packed)
        }
        try:
            result2 = mongodb.activities.update_one(
                {"_id": int(id)},
                {"$set": document},
                upsert=True)
        except Exception as e:
            result2 = None
            log.debug("error writing activity {} to MongoDB: {}"
                      .format(id, e))
        return result1, result2

    @classmethod
    def get(cls, id, timeout=CACHE_ACTIVITIES_TIMEOUT):
        packed = None
        key = cls.cache_key(id)
        cached = redis.get(key)

        if cached:
            redis.expire(key, timeout)  # reset expiration timeout
            # log.debug("got Activity {} from cache".format(id))
            packed = cached
        else:
            try:
                document = mongodb.activities.find_one_and_update(
                    {"_id": int(id)},
                    {"$set": {"ts": datetime.utcnow()}}
                )

            except Exception as e:
                log.debug(
                    "error accessing activity {} from MongoDB:\n{}"
                    .format(id, e))
                return

            if document:
                packed = document["mpk"]
                redis.setex(key, packed, timeout)
                # log.debug("got activity {} data from MongoDB".format(id))
        if packed:
            return msgpack.unpackb(packed)

    @classmethod
    def import_streams(cls, client, activity_id, stream_names,
                       timeout=CACHE_ACTIVITIES_TIMEOUT):

        streams_to_import = list(stream_names)
        if ("polyline" in stream_names):
            streams_to_import.append("latlng")
            streams_to_import.remove("polyline")
        try:
            streams = client.get_activity_streams(activity_id,
                                                  series_type='time',
                                                  types=streams_to_import)
        except Exception as e:
            msg = ("Can't import streams for activity {}:\n{}"
                   .format(activity_id, e))
            # log.error(msg)
            return {"error": msg}

        activity_streams = {name: streams[name].data for name in streams}

        # Encode/compress latlng data into polyline format
        if "polyline" in stream_names:
            if "latlng" in activity_streams:
                activity_streams["polyline"] = polyline.encode(
                    activity_streams['latlng'])
            else:
                return {"error": "no latlng stream for activity {}".format(activity_id)}

        for s in ["time"]:
            # Encode/compress these streams
            if (s in stream_names) and (activity_streams.get(s)):
                if len(activity_streams[s]) < 2:
                    return {
                        "error": "activity {} has no stream '{}'"
                        .format(activity_id, s)
                    }

                try:
                    activity_streams[s] = cls.stream_encode(activity_streams[s])
                except Exception as e:
                    msg = ("Can't encode stream '{}' for activity {} due to '{}':\n{}"
                           .format(s, activity_id, e, activity_streams[s]))
                    log.error(msg)
                    return {"error": msg}

        output = {s: activity_streams[s] for s in stream_names}
        cls.set(activity_id, output, timeout)
        return output

    @classmethod
    def import_and_queue_streams(cls, client, queue, activity):
        # log.debug("importing {}".format(activity["id"]))

        stream_data = cls.import_streams(
            client, activity["id"], STREAMS_TO_CACHE)

        data = {s: stream_data[s] for s in STREAMS_OUT + ["error"]
                if s in stream_data}
        data.update(activity)
        queue.put(data)
        # log.debug("importing {}...queued!".format(activity["id"]))
        gevent.sleep(0)


class EventLogger(object):

    @classmethod
    def init(cls, rebuild=True, size=app.config["MAX_HISTORY_BYTES"]):

        collections = mongodb.collection_names(include_system_collections=False)

        if ("history" in collections) and rebuild:
            all_docs = mongodb.history.find()
            mongodb.history_new.insert_many(all_docs)
            mongodb.create_collection("history_new",
                                      capped=True,
                                      # autoIndexId=False,
                                      size=size)
            mongodb.history_new.rename("history", dropTarget=True)
        else:
            mongodb.create_collection("history",
                                      capped=True,
                                      # autoIndexId=False,
                                      size=size)
            log.info("Initialized history collection")

        stats = mongodb.command("collstats", "history")
        cls.new_event(msg="rebuilt event log: {}".format(stats))

    @staticmethod
    def get_event(event_id):
        event = mongodb.history.find_one({"_id": ObjectId(event_id)})
        event["_id"] = str(event["_id"])
        return event

    @staticmethod
    def get_log(limit=0):
        events = list(
            mongodb.history.find(
                sort=[("$natural", pymongo.DESCENDING)]).limit(limit)
        )
        for e in events:
            e["_id"] = str(e["_id"])
        return events

    @staticmethod
    def new_event(**event):
        event["ts"] = datetime.utcnow()
        mongodb.history.insert_one(event)

    @classmethod
    def log_request(cls, flask_request_object, **args):
        req = flask_request_object
        args.update({
            "ip": req.access_route[-1],
            "agent": vars(req.user_agent),
        })
        cls.new_event(**args)


class Webhooks(object):
    name = "subscription"

    client = stravalib.Client()
    credentials = {
        "client_id": app.config["STRAVA_CLIENT_ID"],
        "client_secret": app.config["STRAVA_CLIENT_SECRET"]
    }

    @classmethod
    def create(cls, callback_url):
        try:
            subs = cls.client.create_subscription(
                callback_url=callback_url,
                **cls.credentials
            )
        except Exception as e:
            return {"error": str(e)}

        if "updates" not in mongodb.collection_names():
            mongodb.create_collection("updates",
                                      capped=True,
                                      size=1 * 1024 * 1024)
        log.debug("create_subscription returns {}".format(subs))
        return {"created": str(subs)}

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
                cls.client.delete_subscription(subscription_id,
                                               **cls.credentials)
            except Exception as e:
                return {"error": str(e)}

            if delete_collection:
                mongodb.updates.drop()

            result = {"success": "deleted subscription {}".format(
                subscription_id)}
        else:
            result = {"error": "non-existent/incorrect subscription id"}
        log.error(result)
        return result

    @classmethod
    def list(cls):
        subs = cls.client.list_subscriptions(**cls.credentials)
        return [sub.id for sub in subs]

    @classmethod
    def handle_update_callback(cls, update_raw):

        update = cls.client.handle_subscription_update(update_raw)
        user_id = update.owner_id
        user = Users.get(user_id, timeout=10) 
        if user:
            user_index_exists = mongodb.index.find({"_id": user_id}).limit(1).count()
        else:
            index = None

        if not (user or index):
            return
        record = {
            "dt": datetime.utcnow(),
            "subscription_id": update.subscription_id,
            "owner_id": update.owner_id,
            "object_id": update.object_id,
            "object_type": update.object_type,
            "aspect_type": update.aspect_type,
            "updates": update_raw.get("updates"),
            "valid_user": bool(user),
            "valid_index": bool(user_index_exists)
        }

        result = mongodb.updates.insert_one(record)
        
        if not user:
            log.debug("got webhook update for an unregistered user {}"
                      .format(user_id))
            return

        if update.get("object_type") == "athlete":
             return

        
        if not user_index_exists:
            return

        #  If we got here then we know there are index entries for this user
        if update.aspect_type == "create":
            # fetch activity and add it to the index
            gevent.spawn(Index.import_by_id, user, [update.object_id])

        elif update.aspect_type == "update":
            # update the activity if it exists, or create it
            result = Index.update(update.object_id, update.updates)
            log.debug(result)

        elif update.aspect_type == "delete":
            # delete the activity from the index
            result = Index.delete(update.object_id)
            log.debug(result)


    @staticmethod
    def iter_updates(limit=0):
        updates = mongodb.updates.find(
            sort=[("$natural", pymongo.DESCENDING)]
        ).limit(limit)

        for u in updates:
            u["_id"] = str(u["_id"])
            yield u


class Payments(object):

    @staticmethod
    def init():
        mongodb.payments.drop()

        # create new indexes collection
        mongodb.create_collection("payments")
        mongodb.payments.create_index([
            ("ts", pymongo.DESCENDING),
            ("user", pymongo.ASCENDING)
        ])
        log.info("initialized Payments collection")

    @staticmethod
    def get(user=None, before=None, after=None):
        query = {}

        tsfltr = {}
        if before:
            tsfltr["$gte"] = before
        if after:
            tsfltr["$lt"] = after
        if tsfltr:
            query["ts"] = tsfltr

        field_selector = {"_id": False}
        if user:
            query["user"] = user.id
            field_selector["user"] = False

        docs = list(mongodb.payments.find(query, field_selector))

        return docs

    @staticmethod
    def add(user, amount):
        mongodb.payments.insert_one({
            "user": user.id,
            "amount": amount,
            "ts": datetime.utcnow()
        })


class Utility():

    @staticmethod
    def href(url, text):
        return "<a href='{}' target='_blank'>{}</a>".format(url, text)

    @staticmethod
    def ip_lookup_url(ip):
        return "http://freegeoip.net/json/{}".format(ip) if ip else "#"

    @staticmethod
    def ip_address(flask_request_object):
        return flask_request_object.access_route[-1]

    @classmethod
    def ip_lookup(cls, ip_address):
        r = requests.get(cls.ip_lookup_url(ip_address))
        return r.json()

    @classmethod
    def ip_timezone(cls, ip_address):
        tz = cls.ip_lookup(ip_address)["time_zone"]
        return tz if tz else 'America/Los_Angeles'

    @staticmethod
    def utc_to_timezone(dt, timezone='America/Los_Angeles'):
        from_zone = dateutil.tz.gettz('UTC')
        to_zone = dateutil.tz.gettz(timezone)
        utc = dt.replace(tzinfo=from_zone)
        return utc.astimezone(to_zone)

    @staticmethod
    def to_datetime(obj):
        if not obj:
            return
        if isinstance(obj, datetime):
            return obj
        try:
            dt = dateutil.parser.parse(obj)
        except ValueError:
            return
        else:
            return dt



collections = mongodb.collection_names()

if "history" not in collections:
    EventLogger.init()

if "activities" not in collections:
    Activities.init()

if Index.name not in collections:
    Index.init_db()

if "payments" not in collections:
    Payments.init()
