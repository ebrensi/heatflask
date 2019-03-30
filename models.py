from flask_login import UserMixin
from sqlalchemy.dialects import postgresql as pg
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect
from datetime import datetime
import dateutil
import dateutil.parser
import stravalib
import polyline
import pymongo

from redis import Redis

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
    dt_indexed = Column(pg.TIMESTAMP)

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

    def index_count(self):
        return Index.user_index_size(self)

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

    def build_index(self, out_queue=None, fetch_limit=0, **args):
        gevent.spawn(
            Index.import_user,
            self,
            out_queue=out_queue,
            out_query=args,
            fetch_query={"limit": fetch_limit}
        )
        gevent.sleep(0)
        return out_queue

    def query_activities(self,
                         activity_ids=None,
                         grouped=False,
                         exclude_ids=[],
                         limit=None,
                         after=None, before=None,
                         only_ids=False,
                         summaries=True,
                         streams=False,
                         owner_id=False,
                         build_index=True,
                         update_index_ts=True,
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
            # log.debug("importing {}".format(activity["_id"]))

            stream_data = Activities.import_streams(
                client, activity["_id"], STREAMS_TO_CACHE, cache_timeout)

            data = {s: stream_data[s] for s in STREAMS_OUT + ["error"]
                    if s in stream_data}
            data.update(activity)
            queue.put(data)

            # log.debug("importing {}...queued!".format(activity["_id"]))
            gevent.sleep(0)

        pool = pool or Pool(CONCURRENCY)
        
        if grouped:
            return self.related_activities(activity_ids[0], streams, pool, out_queue)

        client = self.client()

        #  If out_queue is not supplied then query_activities is blocking
        put_stopIteration = False
        if not out_queue:
            out_queue = Queue()
            put_stopIteration = True

        if (summaries or limit or only_ids or after or before):

            if self.index_count():

                gen, to_delete = Index.query(
                            user=self,
                            activity_ids=activity_ids,
                            limit=limit or 0,
                            after=after, before=before,
                            exclude_ids=exclude_ids,
                            ids_only=only_ids,
                            update_ts=update_index_ts
                         )

                if only_ids:
                    out_queue.put(list(gen))
                    out_queue.put(StopIteration)
                    return out_queue

                if to_delete:
                    out_queue.put({"delete": to_delete})

            elif build_index:
                # There is no activity index and we are to build one
                if only_ids:
                    return ["build"]

                else:
                    gen = gevent.queue.Queue()
                    gevent.spawn(self.build_index,
                                 out_queue=gen,
                                 limit=limit,
                                 after=after,
                                 before=before,
                                 activitiy_ids=activity_ids)
            else:
                # Finally, if there is no index and rather than building one
                # we are requested to get the summary data directily from Strava
                # log.info(
                #     "{}: getting summaries from Strava without build"
                #     .format(self))
                gen = (
                    Index.strava2doc(a)
                    for a in self.client().get_activities(
                        limit=limit,
                        before=before,
                        after=after)
                )

        DB_TTL = app.config["STORE_INDEX_TIMEOUT"]
        NOW = datetime.utcnow()

        # log.debug("NOW: {}, DB_TTL: {}".format(NOW, DB_TTL))
        for A in gen:
            # log.debug(A)
            if "_id" not in A:
                out_queue.put(A)
                continue

            if summaries:
                A["ts_local"] = str(A["ts_local"])
                A["ts_UTC"] = str(A["ts_UTC"])
                if "ts" in A:
                    ts = A["ts"]
                    try:
                        delta = (NOW - ts).seconds if NOW >= ts else 0
                        A["ts"] = DB_TTL - delta
                        # log.debug("delta: {}, remain: {}".format(delta,  A["ts"]))
                    except Exception as e:
                        log.exception(e)
                        del A["ts"]
                        
            if owner_id:
                A.update({"owner": self.id, "profile": self.profile})

            # log.debug("sending activity {}...".format(A["_id"]))
            # gevent.sleep(0.5)  # test delay

            if not streams:
                out_queue.put(A)

            else:
                stream_data = Activities.get(A["_id"])

                if stream_data:
                    A.update(stream_data)
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

        put_stopIteration = not out_queue

        out_queue = out_queue or Queue()
        pool = pool or Pool(CONCURRENCY)

        # *** First we output this activity
        A = Index.db.find_one({"_id": int(activity_id)})
        log.debug("got group activity {}".format(A))

        stream_data = Activities.get(activity_id)
        if stream_data:
            A.update(stream_data)
            out_queue.put(A)
        else:
            pool.spawn(
                Activities.import_and_queue_streams,
                client, out_queue, A)

        # Now output related activities
        try:
            for obj in client.get_related_activities(int(activity_id)):
                owner = self.__class__.get(obj.athlete.id)
                
                if not owner:
                    continue
           
                A = Index.strava2doc(obj)
                A["ts_local"] = str(A["ts_local"])
                A["ts_UTC"] = str(A["ts_UTC"])
                A["owner"] = owner.id
                A["profile"] = owner.profile

                log.debug("outputting {}".format(A))
                
                if not streams:
                    out_queue.put(A)

                stream_data = Activities.get(obj.id)
                if stream_data:
                    A.update(stream_data)
                    out_queue.put(A)
                else:
                    pool.spawn(
                        Activities.import_and_queue_streams,
                        owner.client(), out_queue, A)

        except Exception as e:
            log.info("Error getting related activities: {}".format(e))
            return [{"error": str(e)}]

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
    DB_TTL = app.config["STORE_INDEX_TIMEOUT"]
    
    @classmethod
    # Initialize the database
    def init_db(cls, clear_cache=False):
        # drop the "indexes" collection
        try:
            mongodb.drop_collection(cls.name)
        except Exception as e:
            log.debug(
                "error deleting '{}' collection from MongoDB.\n{}"
                .format(cls.name, e))
            result1 = e


        # create new index collection
        mongodb.create_collection(cls.name)

        cls.db.create_index("user")
        cls.db.create_index([("ts_UTC", pymongo.DESCENDING)])

        # cls.db.create_index([("start_latlng", pymongo.GEO2D)])
        result = cls.db.create_index(
            "ts",
            name="ts",
            expireAfterSeconds=cls.DB_TTL
        )


        log.info("initialized '{}' collection".format(cls.name))


    @classmethod 
    def update_ttl(cls, timeout=DB_TTL):

        # Update the MongoDB Index TTL if necessary 
        info = cls.db.index_information()

        current_ttl = info["ts"]["expireAfterSeconds"]

        if current_ttl != timeout:
            result = mongodb.command('collMod', cls.name,
                        index={'keyPattern': {'ts': 1},
                                'background': True,
                                'expireAfterSeconds': timeout}
                     )

            log.info("`{}` db TTL updated: {}".format(cls.name, result))
        else:
            # log.debug("no need to update TTL")
            pass


    @classmethod
    def strava2doc(cls, a):
        polyline = a.map.summary_polyline
        d = {
            "_id": a.id,
            "user_id": a.athlete.id,
            "name": a.name,
            "type": a.type,
            "ts_UTC": a.start_date,
            # "group": a.athlete_count,
            "ts_local": a.start_date_local,
            "ts": datetime.utcnow(),
            "total_distance": float(a.distance),
            "elapsed_time": int(a.elapsed_time.total_seconds()),
            "average_speed": float(a.average_speed),
            "start_latlng": a.start_latlng[0:2] if a.start_latlng else None,
            "bounds": Activities.bounds(polyline) if polyline else None
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
        if not updates:
            return

        # log.debug("user {} got update {}".format(id, updates))
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
            result = cls.db.delete_many({"user_id": user.id})
            log.debug("deleted index entries for {}".format(user.id))
            return result
        except Exception as e:
            log.error(
                "error deleting index entries for user {} from MongoDB:\n{}"
                .format(user, e)
            )

    @classmethod
    def user_index_size(cls, user):
        try:
            activity_count = cls.db.count({"user_id": user.id})
        except Exception as e:
            log.error("Error retrieving activity count for {}: {}".format(user, e))
            return

        return activity_count

    @classmethod
    def import_user(cls, user, out_queue=None,
                        fetch_query={"limit": 10},
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

                        if not (count % 5):
                            # only output count every 5 items to cut down on data
                            out_queue.put({"idx": count})
                            # log.debug("put index {}".format(count))

                        if not rendering:
                            continue

                        if ((activity_ids and (d["_id"] in activity_ids)) or
                             (limit and (count <= limit)) or
                                in_date_range(d["ts_local"])):

                            d2 = dict(d)
                            d2["ts_local"] = str(d2["ts_local"])
                            d2["ts_UTC"] = str(d2["ts_UTC"])

                            out_queue.put(d2)

                            if activity_ids:
                                activity_ids.remove(d["_id"])
                                if not activity_ids:
                                    rendering = False
                                    out_queue.put({"stop_rendering": 1})

                        if ((limit and count >= limit) or
                                (after and (d["ts_local"] < after))):
                            rendering = False
                            out_queue.put({"stop_rendering": 1})
                            # log.debug("got here: count = {}".format(count))
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
                result = cls.db.bulk_write(
                    mongo_requests,
                    ordered=False
                )
        except Exception as e:
            if out_queue:
                out_queue.put({"error": str(e)})
            log.error(
                "Error while building activity index for {}".format(user))
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
        client = user.client()
        
        def fetch(id):
            try:
                A = client.get_activity(id)
                a = cls.strava2doc(A)
            except Exception as e:
                # log.debug("fetch {}:{} failed".format(user, id))
                return

            # log.debug("fetched activity {} for {}".format(id, user))
            return pymongo.ReplaceOne({"_id": A.id}, a, upsert=True)

        pool = Pool(CONCURRENCY)
        mongo_requests = list(req for req in pool.imap_unordered(fetch, activity_ids) if req)

        return cls.db.bulk_write(mongo_requests) if mongo_requests else None

    @classmethod
    def query(cls, user=None,
              activity_ids=None,
              exclude_ids=None,
              after=None, before=None,
              limit=0,
              ids_only=False,
              update_ts=True
              ):

        activity_ids = set(int(id) for id in activity_ids) if activity_ids else None
        exclude_ids = set(int(id) for id in exclude_ids) if exclude_ids else None
        limit = int(limit)
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
                query_ids = set(int(doc["_id"]) 
                    for doc in cls.db.find(
                        query, {"_id": True}).sort("ts_UTC", pymongo.DESCENDING)
                                             .limit(limit) )

            except Exception as e:
                log.exception(e)
                return
            
            to_delete = list(exclude_ids - query_ids)
            to_fetch = list(query_ids - exclude_ids)

            query["_id"] = {"$in": to_fetch}

            # log.debug("query ids: {}\nexclude: {}\nto_fetch: {}\ndelete: {}"
            #     .format(
            #         sorted(query_ids), 
            #         sorted(exclude_ids),
            #         sorted(to_fetch),
            #         sorted(to_delete)))

            if ids_only:
                return (to_fetch, to_delete)

        # log.debug(query)

        if ids_only:
            out_fields = {"_id": True}

        try:
            if out_fields:
                cursor = cls.db.find(query, out_fields)
            else:
                cursor = cls.db.find(query)
            cursor = cursor.sort("ts_UTC", pymongo.DESCENDING).limit(limit)

        except Exception as e:
            log.error(
                "error accessing mongodb indexes collection:\n{}"
                .format(e)
            )
            return []

        def iterator(cur):
            ids = []
            yield {"count": cur.count(True)}

            for a in cur:
                a_id = a["_id"]
                if update_ts:
                    ids.append(a_id)

                if ids_only:
                    yield a_id
                else:
                    yield a

            if update_ts:

                result = cls.db.update_many(
                    {"_id": {"$in": ids}}, 
                    {"$set": {"ts": datetime.utcnow()}}
                )
                log.debug("updated TTL for {}: {}".format(user.id, result.raw_result))

        # cursor = list(cursor)
        # log.debug("query returns: {}".format([a["_id"] for a in cursor]))

        return iterator(cursor), to_delete


#  Activities class is only a proxy to underlying data structures.
#  There are no Activity objects
class Activities(object):
    name = "activities"
    db = mongodb.get_collection(name)

    CACHE_TTL = app.config["CACHE_ACTIVITIES_TIMEOUT"]
    DB_TTL = app.config["STORE_ACTIVITIES_TIMEOUT"]

    @classmethod
    def init_db(cls, clear_cache=False):
        # Create/Initialize Activity database
        try:
            mongodb.drop_collection(cls.name)
        except Exception as e:
            log.debug(
                "error deleting '{}' collection from MongoDB.\n{}"
                .format(cls.name, e))
            result1 = e

        if clear_cache:
            to_delete = redis.keys(cls.cache_key("*"))
            if to_delete:
                result2 = redis.delete(*to_delete)
            else:
                result2 = None

        mongodb.create_collection(cls.name)
        
        result = cls.db.create_index(
            "ts",
            name="ts",
            expireAfterSeconds=cls.DB_TTL
        )
        log.info("initialized '{}' collection".format(cls.name))
        return result
        
    
    @classmethod 
    def update_ttl(cls, timeout=DB_TTL):

        # Update the MongoDB Activities TTL if necessary 
        info = cls.db.index_information()

        current_ttl = info["ts"]["expireAfterSeconds"]


        if current_ttl != timeout:
            result = mongodb.command('collMod', cls.name,
                        index={'keyPattern': {'ts': 1},
                                'background': True,
                                'expireAfterSeconds': timeout}
                     )

            log.info("`{}` db TTL updated: {}".format(cls.name, result))
        else:
            # log.debug("no need to update TTL")
            pass


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

    @staticmethod
    def cache_key(id):
        return "A:{}".format(id)

    @classmethod
    def set(cls, id, data, timeout=CACHE_TTL):
        # cache it first, in case mongo is down
        packed = msgpack.packb(data)
        result1 = redis.setex(cls.cache_key(id), packed, timeout)

        document = {
            "ts": datetime.utcnow(),
            "mpk": Binary(packed)
        }
        try:
            result2 = cls.db.update_one(
                {"_id": int(id)},
                {"$set": document},
                upsert=True)
        except Exception as e:
            result2 = None
            log.debug("error writing activity {} to MongoDB: {}"
                      .format(id, e))
        return result1, result2

    @classmethod
    def get(cls, id, timeout=CACHE_TTL):
        packed = None
        key = cls.cache_key(id)
        cached = redis.get(key)

        if cached:
            redis.expire(key, timeout)  # reset expiration timeout
            # log.debug("got Activity {} from cache".format(id))
            packed = cached
        else:
            try:
                document = cls.db.find_one_and_update(
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
                       timeout=CACHE_TTL):

        streams_to_import = list(stream_names)
        if ("polyline" in stream_names):
            streams_to_import.append("latlng")
            streams_to_import.remove("polyline")
        try:
            streams = client.get_activity_streams(activity_id,
                                                  series_type='time',
                                                  types=streams_to_import)
            assert streams is not None
            
        except Exception as e:
            msg = ("Can't import streams for activity {}:\n{}"
                   .format(activity_id, e))
            # log.error(msg)
            return {"error": msg}

        activity_streams = {name: streams[name].data for name in streams}

        # Encode/compress latlng data into polyline format
        if "polyline" in stream_names:
            latlng = activity_streams.get("latlng")
            if latlng:
                try:
                    activity_streams["polyline"] = polyline.encode(latlng)
                except Exception as e:
                    log.error("problem encoding {}".format(activity_id))
                    # log.exception(e)
                    return {
                        "error": "cannot polyline encode stream for activity {}"
                        .format(activity_id)
                    }
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
        # log.debug("importing {}".format(activity["_id"]))

        stream_data = cls.import_streams(
            client, activity["_id"], STREAMS_TO_CACHE)

        data = {s: stream_data[s] for s in STREAMS_OUT + ["error"]
                if s in stream_data}
        data.update(activity)
        queue.put(data)
        # log.debug("importing {}...queued!".format(activity["_id"]))
        gevent.sleep(0)

    @classmethod
    def query(cls, queryObj):
        pool = gevent.pool.Pool(app.config.get("CONCURRENCY")+1)
        queue = gevent.queue.Queue()

        def go():
            for user_id in queryObj:
                user = Users.get(user_id)
                if not user:
                    continue

                query = queryObj[user_id]

                # log.debug("spawning query {}".format(query))
                pool.spawn(user.query_activities, 
                    out_queue=queue, pool=pool, **query
                )

            # log.debug("joining jobs...")
            pool.join()
            queue.put(None)
            queue.put(StopIteration)
            # log.debug("done with query")
     
        gevent.spawn(go)
        gevent.sleep(0)
        return queue


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
        if (not user) or (not user.index_count()):
            return

        record = {
            "dt": datetime.utcnow(),
            "subscription_id": update.subscription_id,
            "owner_id": update.owner_id,
            "object_id": update.object_id,
            "object_type": update.object_type,
            "aspect_type": update.aspect_type,
            "updates": update_raw.get("updates")
        }

        result = mongodb.updates.insert_one(record)

        if update.object_type == "athlete":
            return

        create = False
        if update.aspect_type == "update":
            # update the activity if it exists, or create it
            result = Index.update(update.object_id, update.updates)
            if not result:
                create = True
            else:
                pass
                # log.debug("{} index update: {}".format(user, result))

        #  If we got here then we know there are index entries for this user
        if create or (update.aspect_type == "create"):
            # fetch activity and add it to the index
            gevent.spawn(Index.import_by_id, user, [update.object_id])
            gevent.sleep(0)

        elif update.aspect_type == "delete":
            # delete the activity from the index
            result = Index.delete(update.object_id)
            # log.dssebug(result)


    @staticmethod
    def iter_updates(limit=0):
        updates = mongodb.updates.find(
            sort=[("$natural", pymongo.DESCENDING)]
        ).limit(limit)

        for u in updates:
            u["_id"] = str(u["_id"])
            yield u


class Payments(object):

    name = "payments"
    db = mongodb.get_collection(name)

    @classmethod
    def init_db(cls):
        try:
            mongodb.drop_collection(cls.name)
        except Exception as e:
            log.debug(
                "error deleting '{}' collection from MongoDB.\n{}"
                .format(cls.name, e))
            result1 = e

        # create new indexes collection
        mongodb.create_collection(cls.name)
        cls.db.create_index([("ts", pymongo.DESCENDING)])
        cls.db.create_index([("user", pymongo.ASCENDING)])

        log.info("initialized '{}' collection".format(cls.name))

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

            