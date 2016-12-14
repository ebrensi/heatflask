from flask_login import UserMixin
from sqlalchemy.dialects import postgresql as pg
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect
from datetime import datetime
import stravalib

import pandas as pd
import gevent
from gevent.queue import Queue
from gevent.pool import Pool
from exceptions import StopIteration

from heatmapp import app, cache

import os


db = SQLAlchemy(app)

CACHE_USERS_TIMEOUT = app.config["CACHE_USERS_TIMEOUT"]
CACHE_INDEX_TIMEOUT = app.config["CACHE_INDEX_TIMEOUT"]
CACHE_INDEX_UPDATE_TIMEOUT = app.config["CACHE_INDEX_UPDATE_TIMEOUT"]
CACHE_ACTIVITIES_TIMEOUT = app.config["CACHE_ACTIVITIES_TIMEOUT"]
CACHE_DATA_TIMEOUT = app.config["CACHE_ACTIVITIES_TIMEOUT"]
LOCAL = os.environ.get("APP_SETTINGS") == "config.DevelopmentConfig"


def inspector(obj):
    state = inspect(obj)
    attrs = ["transient", "pending", "persistent", "deleted", "detached"]
    return [attr for attr in attrs if getattr(state, attr)]


class User(UserMixin, db.Model):
    __tablename__ = 'users'
    strava_id = db.Column(db.Integer, primary_key=True, autoincrement=False)

    # These fields get refreshed every time the user logs in.
    #  They are only stored in the database to enable persistent login
    username = db.Column(db.String())
    firstname = db.Column(db.String())
    lastname = db.Column(db.String())
    profile = db.Column(db.String())
    strava_access_token = db.Column(db.String())

    dt_last_active = db.Column(pg.TIMESTAMP)
    app_activity_count = db.Column(db.Integer, default=0)

    strava_client = None
    # activity_index = None
    dt_last_indexed = None

    def describe(self):
        attrs = ["strava_id", "username", "firstname", "lastname",
                 "profile", "strava_access_token", "dt_last_active",
                 "app_activity_count", "dt_last_indexed"]
        return {attr: getattr(self, attr) for attr in attrs}

    def client(self):
        if not self.strava_client:
            self.strava_client = stravalib.Client(
                access_token=self.strava_access_token)
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
        client = stravalib.Client(access_token=token)
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
            client=client
        )
        return user

    @staticmethod
    def key(identifier):
        return "U:{}".format(identifier)

    def cache(self, identifier=None, timeout=CACHE_USERS_TIMEOUT):
        key = User.key(identifier or self.strava_id)
        cache.set(key, self, timeout)
        app.logger.debug(
            "cached {} with key '{}' for {} sec".format(self, key, timeout))
        return self

    def uncache(self):
        app.logger.debug("deleting {}".format(self))

        # delete from cache too.  It may be under two different keys
        cache.delete(User.key(self.strava_id))
        cache.delete(User.key(self.username))

    @classmethod
    def get(cls, user_identifier, timeout=CACHE_USERS_TIMEOUT):
        key = User.key(user_identifier)
        user = cache.get(key)
        if user:
            app.logger.debug(
                "retrieved {} from cache with key {}".format(user, key))
            return user

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

    def index(self, limit=None,  after=None, before=None):

        def strava2dict(a):
            return {
                "id": a.id,
                "name": a.name,
                "type": a.type,
                "summary_polyline": a.map.summary_polyline,
                "beginTimestamp": a.start_date_local,
                # "total_distance": float(a.distance),
                # "elapsed_time": int(a.elapsed_time.total_seconds()),
            }
        dtypes = {
            "id": "uint32",
            "type": "category",
            # "total_distance": "float32",
            # "elapsed_time": "uint32"
        }

        index_key = "I:{}".format(self.strava_id)

        ind = cache.get(index_key)
        if ind:
            if ind == "indexing":
                return [{
                    "error": "Indexing activities for user {}...please try again in a few seconds."
                    .format(self.strava_id)
                }]

            dt_last_indexed, packed = ind
            activity_index = pd.read_msgpack(packed).astype({"type": str})
            elapsed = (datetime.utcnow() -
                       dt_last_indexed).total_seconds()

            # update the index if we need to
            if elapsed > CACHE_INDEX_UPDATE_TIMEOUT:
                latest = activity_index.index[0]
                app.logger.info("updating activity index for {}"
                                .format(self.strava_id))

                already_got = set(activity_index.id)
                activities_list = [strava2dict(
                    a) for a in self.client().get_activities(after=latest)
                    if a.id not in already_got]

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
                cache.set(index_key,
                          (dt_last_indexed,
                           activity_index.to_msgpack(compress='blosc')),
                          CACHE_INDEX_TIMEOUT)

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

        if LOCAL and os.path.isfile("index.msg"):
            df = pd.read_msgpack("index.msg")
            dt_last_indexed = datetime.utcnow()
            packed = df.to_msgpack(compress='blosc')
            cache.set(index_key,
                      (dt_last_indexed, packed),
                      CACHE_INDEX_TIMEOUT)
            return []

        # If we got here then the index hasn't been created yet
        Q = Queue()
        P = Pool()

        def async_job(limit=None, after=None, before=None):
            # Indicate to other processes that we are currently indexing
            #  This should not take any longer than 60 seconds
            cache.set(index_key, "indexing", 60)

            activities_list = []
            count = 1
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

            Q.put({"msg": "done indexing {} activities.".format(count)})
            Q.put(StopIteration)

            activity_index = (pd.DataFrame(activities_list)
                              .set_index("beginTimestamp")
                              .sort_index(ascending=False)
                              .astype(dtypes))

            app.logger.debug("done with indexing for {}".format(self))
            dt_last_indexed = datetime.utcnow()
            packed = activity_index.to_msgpack(compress='blosc')
            cache.set(index_key,
                      (dt_last_indexed, packed),
                      CACHE_INDEX_TIMEOUT)
            app.logger.info("cached {}, size={}".format(index_key,
                                                        len(packed)))

            # activity_index.to_msgpack("index.msg", compress='blosc')

        P.apply_async(async_job, [limit, after, before])
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

    def activity_summaries(self, activity_ids=None, **kwargs):
        if activity_ids:
            return [{"error": "still working on this feature!!! :p"}]
        else:
            return self.index(**kwargs)


# Create tables if they don't exist
#  These commands aren't necessary if we use flask-migrate

# db.create_all()
# db.session.commit()
