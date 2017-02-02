from flask_login import UserMixin
from sqlalchemy.dialects import postgresql as pg
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect
from datetime import datetime, timedelta
import stravalib
import polyline
import pymongo

from redis import Redis
import pandas as pd
import gevent
from gevent.queue import Queue
from gevent.pool import Pool
from exceptions import StopIteration
from requests.exceptions import HTTPError
import cPickle
import msgpack
from bson import ObjectId
from bson.binary import Binary
from heatmapp import app

import os

# PostgreSQL access via SQLAlchemy
db_sql = SQLAlchemy(app)
Column = db_sql.Column
String, Integer = db_sql.String, db_sql.Integer

# MongoDB access via PyMongo
mongo_client = pymongo.MongoClient(app.config.get("MONGODB_URI"))
mongodb = mongo_client.get_default_database()

# mongodb.command("dbstats")
# mongodb.command("collstats", "activities")


# Redis data-store
redis = Redis.from_url(app.config["REDIS_URL"])

CACHE_USERS_TIMEOUT = app.config["CACHE_USERS_TIMEOUT"]
CACHE_ACTIVITIES_TIMEOUT = app.config["CACHE_ACTIVITIES_TIMEOUT"]
INDEX_UPDATE_TIMEOUT = app.config["INDEX_UPDATE_TIMEOUT"]
LOCAL = os.environ.get("APP_SETTINGS") == "config.DevelopmentConfig"
OFFLINE = app.config.get("OFFLINE")


def tuplize_datetime(dt):
    return (dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second, dt.microsecond)


def detuplize_datetime(s):
    return datetime(*s)


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

    dt_last_active = Column(pg.TIMESTAMP)
    app_activity_count = Column(Integer, default=0)
    activity_index = None
    index_df_dtypes = {
        "id": "uint32",
        "type": "category",
        "total_distance": "float32",
        "elapsed_time": "uint32",
        "average_speed": "float16"
    }

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
        # app.logger.debug("{}: {}".format(self, profile))
        return profile

    @classmethod
    def from_serialized(cls, p):
        return cPickle.loads(p)

    def client(self):
        return stravalib.Client(
            access_token=self.access_token,
            rate_limit_requests=False
        )

    def __repr__(self):
        return "<User %r>" % (self.id)

    def get_id(self):
        return unicode(self.id)

    def update(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)
        db_sql.session.commit()
        return self

    def is_admin(self):
        return self.id in app.config["ADMIN"]

    @classmethod
    def from_access_token(cls, token):
        client = stravalib.Client(access_token=token)
        try:
            strava_user = client.get_athlete()
        except HTTPError as e:
            if "Unauthorized" in e.message:
                return
            else:
                raise

        user = cls.get(strava_user.id)
        if not user:
            user = cls(id=strava_user.id,
                       app_activity_count=0)
            db_sql.session.add(user)
            db_sql.session.commit()

        user.update(
            username=strava_user.username,
            access_token=token,
            firstname=strava_user.firstname,
            lastname=strava_user.lastname,
            profile=strava_user.profile,
            dt_last_active=datetime.utcnow(),

            measurement_preference=strava_user.measurement_preference,
            city=strava_user.city,
            state=strava_user.state,
            country=strava_user.country
        )

        return user

    def validate(self):
        return self.__class__.from_access_token(self.access_token)

    @staticmethod
    def key(identifier):
        return "U:{}".format(identifier)

    def cache(self, identifier=None, timeout=CACHE_USERS_TIMEOUT):
        key = self.__class__.key(identifier or self.id)
        packed = self.serialize()
        # app.logger.debug(
        #     "caching {} with key '{}' for {} sec. size={}"
        #     .format(self, key, timeout, len(packed))
        # )
        return redis.setex(key, packed, timeout)

    def uncache(self):
        # app.logger.debug("uncaching {}".format(self))

        # delete from cache too.  It may be under two different keys
        redis.delete(self.__class__.key(self.id))
        redis.delete(self.__class__.key(self.username))

    @classmethod
    def get(cls, user_identifier, timeout=CACHE_USERS_TIMEOUT):
        key = cls.key(user_identifier)
        cached = redis.get(key)
        if cached:
            try:
                user = cls.from_serialized(cached)
                # app.logger.debug(
                #     "retrieved {} from cache with key {}".format(user, key))
                return db_sql.session.merge(user, load=False)
            except:
                # apparently this key doesn't work so let's delete it
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

    def delete(self):
        self.delete_index()
        self.uncache()
        db_sql.session.delete(self)
        db_sql.session.commit()

    @classmethod
    def backup(cls):
        attrs = ["id", "access_token", "dt_last_active",
                 "app_activity_count"]
        dump = [{attr: getattr(user, attr) for attr in attrs}
                for user in cls.query]

        # df = pd.DataFrame(dump).set_index("id")
        # document = df.to_json(orient="split")
        # mongodb.users.insert_one(document)
        return dump

    @classmethod
    def restore(cls, users_list=None):
        import json
        try:
            users_list = json.load(open("users.json", "r"))
        except:
            pass

        if not users_list:
            users_list = mongodb.users.find()

        db_sql.drop_all()
        db_sql.create_all()

        def get_strava_user(user_dict):
            client = stravalib.Client(
                access_token=user_dict["access_token"])
            try:
                strava_user = client.get_athlete()
            except Exception as e:
                app.logger.debug("error getting user {}:\n{}"
                                 .format(user_dict["strava_id"], e))
            else:
                return {
                    "id": strava_user.id,
                    "username": strava_user.username,
                    "firstname": strava_user.firstname,
                    "lastname": strava_user.lastname,
                    "profile": strava_user.profile,
                    "measurement_preference": strava_user.measurement_preference,
                    "city": strava_user.city,
                    "state": strava_user.state,
                    "country": strava_user.country,
                    "access_token": user_dict["access_token"],
                    "dt_last_active": user_dict.get("dt_last_active"),
                    "app_activity_count": user_dict.get("app_activity_count")
                }

        P = Pool()
        for user_dict in P.imap_unordered(get_strava_user, users_list):
            if user_dict:
                user = Users(**user_dict)
                try:
                    db_sql.session.add(user)
                except:
                    user = db_sql.session.merge(user)
                db_sql.session.commit()
                app.logger.debug("successfully restored {}".format(user))

    def index_key(self):
        return "I:{}".format(self.id)

    def delete_index(self):
        try:
            result1 = mongodb.indexes.delete_one({'_id': self.id})
        except Exception as e:
            app.logger.debug("error deleting index {} from MongoDB:\n{}"
                             .format(self, e))
            result1 = e

        self.activity_index = None
        result2 = self.cache()

        return result1, result2

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

    def get_raw_index(self):
        if not self.activity_index:
            try:
                self.activity_index = (mongodb.indexes
                                       .find_one({"_id": self.id}))
            except Exception as e:
                app.logger.debug(
                    "error accessing mongodb indexes collection:\n{}"
                    .format(e))

        return self.activity_index

    def build_index(self, out_queue=None, limit=None, after=None, before=None):
        def enqueue(msg):
            if out_queue is None:
                pass
            else:
                out_queue.put(msg)

        self.indexing(True)
        start_time = datetime.utcnow()

        activities_list = []
        count = 0
        try:
            for a in self.client().get_activities():
                d = Activities.strava2dict(a)
                if d.get("summary_polyline"):
                    activities_list.append(d)
                    count += 1
                    if (limit or
                        (after and (d["beginTimestamp"] >= after)) or
                            (before and (d["beginTimestamp"] <= before))):
                        d2 = dict(d)
                        d2["beginTimestamp"] = str(d2["beginTimestamp"])
                        enqueue(d2)
                        # app.logger.info("put {} on queue".format(d2["id"]))

                        if limit:
                            limit -= 1
                            if not limit:
                                enqueue({"stop_rendering": "1"})
                    else:
                        enqueue({"msg": "indexing...{} activities"
                                 .format(count)})
                    gevent.sleep(0)
        except Exception as e:
            enqueue({"error": str(e)})
        else:
            if not activities_list:
                enqueue({"error": "No activities!"})
                enqueue(StopIteration)
                self.indexing(False)
                EventLogger.new_event(
                    msg="no activities for {}".format(self.id)
                )
                return

            enqueue({"msg": "done indexing {} activities.".format(count)})

            index_df = (pd.DataFrame(activities_list)
                        .set_index("beginTimestamp")
                        .sort_index(ascending=False)
                        .astype(Users.index_df_dtypes))

            packed = Binary(index_df.to_msgpack(compress='blosc'))
            self.activity_index = {
                "dt_last_indexed": datetime.utcnow(),
                "packed_index": packed
            }

            # app.logger.debug("done with indexing for {}".format(self))
            elapsed = datetime.utcnow() - start_time
            EventLogger.new_event(
                msg="{}'s activities indexed in {} sec. count={}, size={}"
                .format(self.id,
                        round(elapsed.total_seconds(), 3),
                        count,
                        len(packed)))

            # update the cache for this user
            self.cache()

            # if MongoDB access fails then at least the activity index
            # is cached with the user for a while.  Since we're using
            # a cheap sandbox version of Mongo, it might be down sometimes.
            try:
                result = mongodb.indexes.update_one(
                    {"_id": self.id},
                    {"$set": self.activity_index},
                    upsert=True)

                # app.logger.info(
                #     "inserted activity index for {} in MongoDB: {}"
                #     .format(self, vars(result))
                # )
            except Exception as e:
                app.logger.debug(
                    "error wrtiting activity index for {} to MongoDB:\n{}"
                    .format(self, e)
                )

        finally:
            self.indexing(False)
            enqueue(StopIteration)

        if activities_list:
            return index_df

    def update_index(self, index_df=None):
        if (index_df is None) and self.get_raw_index():
            index_df = pd.read_msgpack(
                self.activity_index["packed_index"]
            ).astype({"type": str})

        latest = index_df.index[0]
        # app.logger.info("updating activity index for {}"
        #                 .format(self.id))

        already_got = set(index_df.id)

        try:
            activities_list = [Activities.strava2dict(
                a) for a in self.client().get_activities(after=latest)
                if a.id not in already_got]
        except Exception as e:
            return [{"error": str(e)}]

        # whether or not there are any new activities,
        # we will update the timestamp
        to_update = {"dt_last_indexed": datetime.utcnow()}

        if activities_list:
            new_df = pd.DataFrame(activities_list).set_index(
                "beginTimestamp")

            index_df = (
                new_df.append(index_df)
                .drop_duplicates()
                .sort_index(ascending=False)
                .astype(Users.index_df_dtypes)
            )

            to_update["packed_index"] = (
                Binary(index_df.to_msgpack(compress='blosc'))
            )

        # update activity_index in this user
        self.activity_index.update(to_update)

        # update the cache entry for this user (necessary?)
        self.cache()

        # update activity_index in MongoDB
        try:
            mongodb.indexes.update_one(
                {"_id": self.id},
                {"$set": to_update}
            )
        except Exception as e:
            app.logger.debug(
                "error updating activity index for {} in MongoDB:\n{}"
                .format(self, e)
            )

        return index_df

    def query_index(self, activity_ids=None, limit=None,  after=None, before=None):

        def bounds(poly):
            if poly:
                latlngs = polyline.decode(poly)
                # app.logger.info("latlngs: {}".format(latlngs))

                lats = [ll[0] for ll in latlngs]
                lngs = [ll[1] for ll in latlngs]

                SW = (min(lats), min(lngs))
                NE = (max(lats), max(lngs))

                # app.logger.info("SW = {}, NE = {}".format(SW, NE))
                return SW, NE
            else:
                return []

        if self.indexing():
            return [{
                    "error": "Building activity index for {}".format(self.id)
                    + "...<br>Please try again in a few seconds.<br>"
                    }]

        if self.get_raw_index():
            index_df = pd.read_msgpack(
                self.activity_index["packed_index"]
            ).astype({"type": str})

            elapsed = (datetime.utcnow() -
                       self.activity_index["dt_last_indexed"]).total_seconds()

            # update the index if we need to
            if (elapsed > INDEX_UPDATE_TIMEOUT) and (not OFFLINE):
                index_df = self.update_index(index_df)

            if activity_ids:
                df = index_df[index_df["id"].isin(activity_ids)]
            else:
                if limit:
                    df = index_df.head(limit)
                else:
                    df = index_df
                    if after:
                        df = df[:after]
                    if before:
                        df = df[before:]
            df = df.reset_index()
            df.beginTimestamp = df.beginTimestamp.astype(str)
            return df.to_dict("records")

        Q = Queue()
        P = Pool()
        P.apply_async(self.build_index, [Q, limit, after, before])
        return Q

    def get_activity(self, a_id):
        client = self.client()
        try:
            activity = client.get_activity(int(a_id))
            # app.logger.debug("imported Strava activity {}".format(a_id))
        except Exception as e:
            activity = None
            app.logger.debug(
                "error retrieving activity '{}': {}".format(a_id, e))
        return activity


#  Activities class is only a proxy to underlying data structures.
#  There are no Activity objects
class Activities(object):

    # This is a list of tuples specifying properties of the rendered objects,
    #  such as path color, speed/pace in description.  others can be added
    ATYPE_SPECS = [
        ("Ride", "speed", "#0000FF"),  # Blue
        ("Run", "pace", "#FF0000"),  # Red
        ("Swim", "speed", "#00FF7F"),  # SpringGreen
        ("Hike", "pace", "#FF1493"),  # DeepPink
        ("Walk", "pace", "#FF00FF"),  # Fuchsia
        ("AlpineSki", None, "#800080"),  # Purple
        ("BackcountrySki", None, "#800080"),  # Purple
        ("Canoeing", None, "#FFA500"),  # Orange
        ("Crossfit", None, None),
        ("EBikeRide", "speed", "#0000CD"),  # MediumBlue
        ("Elliptical", None, None),
        ("IceSkate", "speed", "#663399"),  # RebeccaPurple
        ("InlineSkate", None, "#8A2BE2"),  # BlueViolet
        ("Kayaking", None, "#FFA500"),  # Orange
        ("Kitesurf", "speed", None),
        ("NordicSki", None, "#800080"),  # purple
        ("RockClimbing", None, "#4B0082"),  # Indigo
        ("RollerSki", "speed", "#800080"),  # Purple
        ("Rowing", "speed", "#FA8072"),  # Salmon
        ("Snowboard", None, "#00FF00"),  # Lime
        ("Snowshoe", "pace", "#800080"),  # Purple
        ("StairStepper", None, None),
        ("StandUpPaddling", None, None),
        ("Surfing", None, "#006400"),  # DarkGreen
        ("VirtualRide", "speed", "#1E90FF"),  # DodgerBlue
        ("WeightTraining", None, None),
        ("Windsurf", "speed", None),
        ("Workout", None, None),
        ("Yoga", None, None)
    ]

    ATYPE_MAP = {atype.lower(): {"path_color": color, "vtype": vtype}
                 for atype, vtype, color in ATYPE_SPECS}

    @staticmethod
    def strava2dict(a):
        return {
            "id": a.id,
            "name": a.name,
            "type": a.type,
            "summary_polyline": a.map.summary_polyline,
            "beginTimestamp": a.start_date_local,
            "total_distance": float(a.distance),
            "elapsed_time": int(a.elapsed_time.total_seconds()),
            "average_speed": float(a.average_speed),
            # "bounds": bounds(a.map.summary_polyline)
        }

    @staticmethod
    def cache_key(id):
        return "A:{}".format(id)

    @classmethod
    def set(cls, id, data, timeout=CACHE_ACTIVITIES_TIMEOUT):
        # cache it first, in case mongo is down
        result1 = redis.setex(cls.cache_key(id), msgpack.packb(data), timeout)

        document = {"ts": datetime.utcnow()}
        document.update(data)
        try:
            result2 = mongodb.activities.update_one(
                {"_id": int(id)},
                {"$set": document},
                upsert=True)
        except Exception as e:
            result2 = None
            app.logger.debug("error writing activity {} to MongoDB:\n{}"
                             .format(id, e))
        return result1, result2

    @classmethod
    def get(cls, id, timeout=CACHE_ACTIVITIES_TIMEOUT):
        key = cls.cache_key(id)
        cached = redis.get(key)

        if cached:
            redis.expire(key, timeout)  # reset expiration timeout
            # app.logger.debug("got Activity {} from cache".format(id))
            return msgpack.unpackb(cached)

        try:
            document = mongodb.activities.find_one_and_update(
                {"_id": int(id)},
                {"$set": {"ts": datetime.utcnow()}}
            )

        except Exception as e:
            app.logger.debug(
                "error accessing activity {} from MongoDB:\n{}"
                .format(id, e))
            return

        if document:
            del document["_id"]
            del document["ts"]
            redis.setex(key, msgpack.packb(document), timeout)
            # app.logger.debug("got activity {} data from MongoDB".format(id))
            return document

    @classmethod
    def init(cls):
        try:
            result1 = mongodb.activities.drop()
        except Exception as e:
            app.logger.debug(
                "error deleting activities collection from MongoDB.\n{}"
                .format(e))
            result1 = e

        to_delete = redis.keys(cls.cache_key("*"))
        if to_delete:
            result2 = redis.delete(*to_delete)
        else:
            result2 = None
        mongodb.create_collection("activities")

        timeout = app.config["STORE_ACTIVITIES_TIMEOUT"]
        mongodb["activities"].create_index(
            "ts",
            expireAfterSeconds=timeout
        )

        return result1, result2

    @classmethod
    def purge_old(cls, age_in_seconds=None):
        if not age_in_seconds:
            age_in_seconds = app.config["STORE_ACTIVITIES_TIMEOUT"]

        earlier_date = datetime.utcnow() - timedelta(seconds=age_in_seconds)
        try:
            result = mongodb.activities.delete_many(
                {'ts': {"$lt": earlier_date}}
            )
        except Exception as e:
            app.logger.debug(
                "error deleting old activities from MongoDB.\n{}"
                .format(e)
            )
        return result

    @classmethod
    def import_streams(cls, client, activity_id, stream_names):
        streams_to_import = list(stream_names)
        if ("polyline" in stream_names):
            streams_to_import.append("latlng")
            streams_to_import.remove("polyline")
        try:
            streams = client.get_activity_streams(activity_id,
                                                  series_type='time',
                                                  types=streams_to_import)
        except Exception as e:
            app.logger.debug("error importing streams for {}:\n{}"
                             .format(activity_id, e))
            return {"error": "error importing streams for {}:\n{}"
                             .format(activity_id, e)}

        activity_streams = {name: streams[name].data for name in streams}

        if ("polyline" in stream_names) and ("latlng" in activity_streams):
            activity_streams["polyline"] = polyline.encode(
                activity_streams['latlng'])

        output = {s: activity_streams[s] for s in stream_names}
        cls.set(activity_id, output)
        return output

    @staticmethod
    def path_color(activity_type):
        color_list = [color for color, activity_types
                      in app.config["ANTPATH_ACTIVITY_COLORS"].items()
                      if activity_type.lower() in activity_types]

        return color_list[0] if color_list else ""


class EventLogger(object):

    @classmethod
    def init(cls, rebuild=True, size=app.config["MAX_HISTORY_BYTES"]):
        mongodb.create_collection("history_new",
                                  capped=True,
                                  # autoIndexId=False,
                                  size=size)

        collections = mongodb.collection_names(include_system_collections=False)
        if ("history" in collections) and rebuild:
            all_docs = mongodb.history.find()
            mongodb.history_new.insert_many(all_docs)
            mongodb.history.drop()

        mongodb.history_new.rename("history")
        stats = mongodb.command("collstats", "history")
        cls.new_event(msg="rebuilt event log: {}".format(stats))

    @staticmethod
    def get_event(event_id):
        event = mongodb.history.find_one({"_id": ObjectId(event_id)})
        event["_id"] = str(event["_id"])
        return event

    @staticmethod
    def get_log():
        events = list(
            mongodb.history.find(sort=[("$natural", pymongo.DESCENDING)])
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


class Webhook(object):
    client = stravalib.Client()
    credentials = {
        "client_id": app.config["STRAVA_CLIENT_ID"],
        "client_secret": app.config["STRAVA_CLIENT_SECRET"]
    }

    @classmethod
    def create(cls, callback_url):
        try:
            sub = cls.client.create_subscription(
                callback_url=callback_url,
                **cls.credentials
            )
        except Exception as e:
            return {"error": str(e)}

        if "subscription" not in mongodb.collection_names():
            mongodb.create_collection("subscription",
                                      capped=True,
                                      size=1 * 1024 * 1024)

        # EventLogger.new_event(msg="Created subscription ".format(sub))
        app.logger.debug("called created_subscription: {}".format(vars(sub)))
        return vars(sub)

    @classmethod
    def handle_callback(cls, args):
        cb = cls.client.handle_subscription_callback(args)
        # EventLogger.new_event(msg="subscription callback: {}".format(cb))
        return cb

    @classmethod
    def delete(cls, subscription_id, delete_db=False):
        try:
            # if successful this will be null
            result = cls.client.delete_subscription(subscription_id,
                                                    **cls.credentials)
        except Exception as e:
            return {"error": str(e)}

        if delete_db:
            mongodb.subscription.drop()

        # EventLogger.new_event(
        #     msg="deleted subscription {}".format(subscription_id)
        # )
        return result

    @classmethod
    def list(cls):
        subs = cls.client.list_subscriptions(**cls.credentials)
        return [str(sub) for sub in subs]

    @staticmethod
    def update(update_raw):
        doc = {
            "dt": datetime.utcnow(),
            "ud": update_raw
        }
        result = mongodb.subscription.insert_one(doc)
        return result

    @staticmethod
    def iter_updates():
        updates = mongodb.subscription.find(
            sort=[("$natural", pymongo.DESCENDING)]
        )

        for u in updates:
            u["_id"] = str(u["_id"])
            yield u


if "history" not in mongodb.collection_names():
    EventLogger.init()
