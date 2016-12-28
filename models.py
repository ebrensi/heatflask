from flask_login import UserMixin
from sqlalchemy.dialects import postgresql as pg
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect
from datetime import datetime, timedelta
import stravalib
import pymongo
import msgpack
from redis import Redis
import pandas as pd
import gevent
from gevent.queue import Queue
from gevent.pool import Pool
from exceptions import StopIteration
import cPickle
from heatmapp import app, cache

import os

# PostgreSQL access via SQLAlchemy
db_sql = SQLAlchemy(app)
Column = db_sql.Column
String, Integer = db_sql.String, db_sql.Integer

# MongoDB access via PyMongo
mongo_client = pymongo.MongoClient(app.config.get("MONGODB_URI"))
db_mongo = mongo_client.get_default_database()

# Redis data-store
redis = Redis.from_url(app.config["REDIS_URL"])

CACHE_USERS_TIMEOUT = app.config["CACHE_USERS_TIMEOUT"]
CACHE_INDEX_TIMEOUT = app.config["CACHE_INDEX_TIMEOUT"]
CACHE_INDEX_UPDATE_TIMEOUT = app.config["CACHE_INDEX_UPDATE_TIMEOUT"]
CACHE_ACTIVITIES_TIMEOUT = app.config["CACHE_ACTIVITIES_TIMEOUT"]
LOCAL = os.environ.get("APP_SETTINGS") == "config.DevelopmentConfig"
OFFLINE = app.config.get("OFFLINE")


def tuplize_datetime(dt):
    return (dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second, dt.microsecond)


def detuplize_datetime(s):
    return datetime(*s)


class User(UserMixin, db_sql.Model):
    __tablename__ = 'users'
    strava_id = Column(Integer, primary_key=True, autoincrement=False)

    # These fields get refreshed every time the user logs in.
    #  They are only stored in the database to enable persistent login
    username = Column(String())
    firstname = Column(String())
    lastname = Column(String())
    profile = Column(String())
    strava_access_token = Column(String())

    measurement_preference = Column(String())
    city = Column(String())
    state = Column(String())
    country = Column(String())
    activity_index = Column(pg.HSTORE)

    dt_last_active = Column(pg.TIMESTAMP)
    app_activity_count = Column(Integer, default=0)

    strava_client = None

    def db_state(self):
        state = inspect(self)
        attrs = ["transient", "pending", "persistent", "deleted", "detached"]
        return [attr for attr in attrs if getattr(state, attr)]

    def serialize(self):
        return cPickle.dumps(self)

    @classmethod
    def from_serialized(cls, p):
        return cPickle.loads(p)

    def client(self):
        if not self.strava_client:
            self.strava_client = stravalib.Client(
                access_token=self.strava_access_token,
                rate_limit_requests=False
            )
        return self.strava_client

    def __repr__(self):
        return "<User %r>" % (self.strava_id)

    def get_id(self):
        return unicode(self.strava_id)

    def update(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)
        return self

    @classmethod
    def from_access_token(cls, token):
        client = stravalib.Client(access_token=token,
                                  rate_limit_requests=False)

        strava_user = client.get_athlete()

        user = cls.get(strava_user.id)
        if not user:
            user = cls(strava_id=strava_user.id,
                       app_activity_count=0)

        user.update(
            username=strava_user.username,
            strava_access_token=token,
            firstname=strava_user.firstname,
            lastname=strava_user.lastname,
            profile=strava_user.profile,
            dt_last_active=datetime.utcnow(),

            measurement_preference=strava_user.measurement_preference,
            city=strava_user.city,
            state=strava_user.state,
            country=strava_user.country,

            client=client
        )
        return user

    @staticmethod
    def key(identifier):
        return "U:{}".format(identifier)

    def cache(self, identifier=None, timeout=CACHE_USERS_TIMEOUT):
        key = User.key(identifier or self.strava_id)
        app.logger.debug(
            "caching {} with key '{}' for {} sec".format(self, key, timeout))
        return redis.setex(key, self.serialize(), timeout)

    def uncache(self):
        app.logger.debug("uncaching {}".format(self))

        # delete from cache too.  It may be under two different keys
        redis.delete(User.key(self.strava_id))
        redis.delete(User.key(self.username))

    @classmethod
    def get(cls, user_identifier, timeout=CACHE_USERS_TIMEOUT):
        key = User.key(user_identifier)
        cached = redis.get(key)
        if cached:
            try:
                user = User.from_serialized(cached)
                app.logger.debug(
                    "retrieved {} from cache with key {}".format(user, key))
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

    @classmethod
    def backup(cls):
        attrs = ["strava_id", "strava_access_token", "dt_last_active",
                 "app_activity_count"]
        return [{attr: getattr(user, attr) for attr in attrs}
                for user in cls.query]

    def index_key(self):
        return "I:{}".format(self.strava_id)

    def delete_index(self):
        cache.delete(self.index_key())
        return cache.get(self.index_key())

    def indexing(self, status=None):
        # Indicate to other processes that we are currently indexing
        #  This should not take any longer than 30 seconds
        key = "indexing {}".format(self.strava_id)
        if status is None:
            return cache.get(key)
        else:
            return cache.set(key, status, 30)

    def index(self, activity_ids=None, limit=None,  after=None, before=None):

        def strava2dict(a):
            return {
                "id": a.id,
                "name": a.name,
                "type": a.type,
                "summary_polyline": a.map.summary_polyline,
                "beginTimestamp": a.start_date_local,
                "total_distance": float(a.distance),
                "elapsed_time": int(a.elapsed_time.total_seconds()),
                "average_speed": float(a.average_speed)
            }
        dtypes = {
            "id": "uint32",
            "type": "category",
            "total_distance": "float32",
            "elapsed_time": "uint32",
            "average_speed": "float16"
        }

        if self.indexing():
            return [{
                    "error": "Indexing activities for user {}...<br>Please try again in a few seconds.<br>"
                    .format(self.strava_id)
                    }]

        ind = cache.get(self.index_key())
        if ind:
            dt_last_indexed, packed = ind
            activity_index = pd.read_msgpack(packed).astype({"type": str})
            elapsed = (datetime.utcnow() -
                       dt_last_indexed).total_seconds()

            # update the index if we need to
            if (elapsed > CACHE_INDEX_UPDATE_TIMEOUT) and (not OFFLINE):
                latest = activity_index.index[0]
                app.logger.info("updating activity index for {}"
                                .format(self.strava_id))

                already_got = set(activity_index.id)

                try:
                    activities_list = [strava2dict(
                        a) for a in self.client().get_activities(after=latest)
                        if a.id not in already_got]
                except Exception as e:
                    return [{"error": str(e)}]

                if activities_list:
                    df = pd.DataFrame(activities_list).set_index(
                        "beginTimestamp")

                    activity_index = (
                        df.append(activity_index)
                        .drop_duplicates()
                        .sort_index(ascending=False)
                        .astype(dtypes)
                    )

                dt_last_indexed = datetime.utcnow()
                cache.set(self.index_key(),
                          (dt_last_indexed,
                           activity_index.to_msgpack(compress='blosc')),
                          CACHE_INDEX_TIMEOUT)

            if activity_ids:
                df = activity_index[activity_index["id"].isin(activity_ids)]
            else:
                if limit:
                    df = activity_index.head(limit)
                else:
                    df = activity_index
                    if after:
                        df = df[:after]
                    if before:
                        df = df[before:]
            df = df.reset_index()
            df.beginTimestamp = df.beginTimestamp.astype(str)
            return df.to_dict("records")

        # If we got here then the index hasn't been created yet
        Q = Queue()
        P = Pool()

        def async_job(user, limit=None, after=None, before=None):

            user.indexing(True)

            activities_list = []
            count = 1
            try:
                for a in self.client().get_activities():
                    d = strava2dict(a)
                    if d.get("summary_polyline"):
                        activities_list.append(d)
                        if (limit or
                            (after and (d["beginTimestamp"] >= after)) or
                                (before and (d["beginTimestamp"] <= before))):
                            d2 = dict(d)
                            d2["beginTimestamp"] = str(d2["beginTimestamp"])
                            Q.put(d2)
                            app.logger.info("put {} on queue".format(d2["id"]))

                            if limit:
                                limit -= 1
                                if not limit:
                                    Q.put({"stop_rendering": "1"})
                        else:
                            Q.put({"msg": "indexing...{} activities".format(count)})

                        count += 1
                        gevent.sleep(0)
            except Exception as e:
                Q.put({"error": str(e)})
            else:
                Q.put({"msg": "done indexing {} activities.".format(count)})

                activity_index = (pd.DataFrame(activities_list)
                                  .set_index("beginTimestamp")
                                  .sort_index(ascending=False)
                                  .astype(dtypes))

                app.logger.debug("done with indexing for {}".format(self))
                dt_last_indexed = datetime.utcnow()
                packed = activity_index.to_msgpack(compress='blosc')
                cache.set(self.index_key(),
                          (dt_last_indexed, packed),
                          CACHE_INDEX_TIMEOUT)

                app.logger.info("cached {}, size={}".format(self.index_key(),
                                                            len(packed)))
            finally:
                user.indexing(False)
                Q.put(StopIteration)

        P.apply_async(async_job, [self, limit, after, before])
        return Q

    def get_activity(self, a_id):
        client = self.client()
        try:
            activity = client.get_activity(int(a_id))
            app.logger.debug("imported Strava activity {}".format(a_id))
        except Exception as e:
            activity = None
            app.logger.debug(
                "error retrieving activity '{}': {}".format(a_id, e))
        return activity


#  Activities class is only a proxy to underlying data structures.
#  There are no Activity objects
class Activities(object):

    @staticmethod
    def cache_key(id):
        return "A:{}".format(id)

    @classmethod
    def set(cls, id, data, timeout=CACHE_ACTIVITIES_TIMEOUT):
        redis.setex(cls.cache_key(id), msgpack.packb(data), timeout)
        db_mongo.activities.update_one(
            {"_id": int(id)},
            {"$set": {"ts": datetime.utcnow(), "data": data}},
            upsert=True)

    @classmethod
    def get(cls, id, timeout=CACHE_ACTIVITIES_TIMEOUT):
        key = cls.cache_key(id)
        cached = redis.get(key)

        if cached:
            redis.expire(key, timeout)  # reset expiration timeout
            # app.logger.debug("got Activity {} from cache".format(id))
            return msgpack.unpackb(cached)

        result = db_mongo.activities.find_one({"_id": int(id)})
        if result:
            data = result.get("data")
            if data:
                redis.setex(key, msgpack.packb(data), timeout)
                # app.logger.debug("got Activity {} from MongoDB".format(id))
                return data

    @classmethod
    def clear(cls):
        db_mongo.activities.drop()
        redis.delete(*redis.keys(cls.cache_key("*")))

    @classmethod
    def purge(cls, age_in_days):
        earlier_date = datetime.utcnow() - timedelta(days=age_in_days)
        result = db_mongo.activities.delete_many({'ts': {"$lt": earlier_date}})
        return result

    render_specs = [
        ("type", "units", "color")
        ("Ride", "speed", "red"),
        ("Run", "pace", "red"),
        ("Swim", None, "yellow"),
        ("Hike", "pace", "red"),
        ("Walk", "pace", "red"),
        ("AlpineSki", None, None),
        ("BackcountrySki", None, None),
        ("Canoeing", None, None),
        ("Crossfit", None, None),
        ("EBikeRide", "speed", "blue"),
        ("Elliptical", None, None),
        ("IceSkate", "speed", None),
        ("InlineSkate", None, None),
        ("Kayaking", None, None),
        ("Kitesurf", "speed", None),
        ("NordicSki", None, None),
        ("RockClimbing", None, None),
        ("RollerSki", "speed", None),
        ("Rowing", "speed", None),
        ("Snowboard", None, None),
        ("Snowshoe", None, None),
        ("StairStepper", None, None),
        ("StandUpPaddling", None, None),
        ("Surfing", None, None),
        ("VirtualRide", "speed", "cyan"),
        ("WeightTraining", None, None),
        ("Windsurf", "speed", None),
        ("Workout", None, None),
        ("Yoga", None, None)
    ]


# Create tables if they don't exist
#  These commands aren't necessary if we use flask-migrate

# db.create_all()
# db.session.commit()
