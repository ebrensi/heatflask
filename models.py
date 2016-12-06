from flask_login import UserMixin
from sqlalchemy.dialects import postgresql as pg
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import inspect
from datetime import datetime
import polyline
import stravalib
import requests


from heatmapp import app, cache

db = SQLAlchemy(app)

CACHE_USERS_TIMEOUT = app.config["CACHE_USERS_TIMEOUT"]
CACHE_SUMMARIES_TIMEOUT = app.config["CACHE_SUMMARIES_TIMEOUT"]
CACHE_ACTIVITIES_TIMEOUT = app.config["CACHE_ACTIVITIES_TIMEOUT"]
CACHE_DATA_TIMEOUT = app.config["CACHE_ACTIVITIES_TIMEOUT"]


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

    # This is set up so that if a user gets deleted, all of the associated
    #  activities are also deleted.
    activities = db.relationship("Activity",
                                 backref="user",
                                 cascade="all, delete, delete-orphan",
                                 lazy="dynamic")

    strava_client = None

    def describe(self):
        attrs = ["strava_id", "username", "firstname", "lastname",
                 "profile", "strava_access_token", "dt_last_active",
                 "app_activity_count"]
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

    def activity_summaries(self, activity_ids=None,
                           timeout=CACHE_SUMMARIES_TIMEOUT,
                           **kwargs):
        unique = "{},{},{}".format(self.strava_id, activity_ids, kwargs)
        key = str(hash(unique))
        client = self.client()

        summaries = cache.get(key)
        if summaries:
            app.logger.debug("got cache key '{}'".format(unique))
            for summary in summaries:
                yield summary
        else:
            summaries = []
            if activity_ids:
                activities = (self.get_activity(id) for id in activity_ids)
            else:
                activities = client.get_activities(**kwargs)

            try:
                for a in activities:
                    if a:
                        data = {
                            "id": a.id,
                            "athlete_id": a.athlete.id,
                            "name": a.name,
                            "type": a.type,
                            "summary_polyline": a.map.summary_polyline,
                            "beginTimestamp": str(a.start_date_local),
                            "total_distance": float(a.distance),
                            "elapsed_time": int(a.elapsed_time.total_seconds()),
                            "user_id": self.strava_id
                        }
                        summaries.append(data)
                        yield data
            except Exception as e:
                yield {"error": str(e)}
            else:
                if summaries:
                    cache.set(key, summaries, timeout)
                    app.logger.debug(
                        "set cache key '{}' for {} sec".format(unique, timeout)
                    )


class Activity(db.Model):
    id = db.Column(db.Integer, primary_key=True, autoincrement=False)
    athlete_id = db.Column(db.Integer)  # owner of this activity
    name = db.Column(db.String())
    type = db.Column(db.String())
    summary_polyline = db.Column(db.String())
    beginTimestamp = db.Column(pg.TIMESTAMP)
    total_distance = db.Column(db.Float())
    elapsed_time = db.Column(db.Integer)

    # streams
    time = db.Column(pg.ARRAY(db.Integer))
    polyline = db.Column(db.String())
    distance = db.Column(pg.ARRAY(db.Float()))
    altitude = db.Column(pg.ARRAY(db.Float()))
    velocity_smooth = db.Column(pg.ARRAY(pg.REAL))
    cadence = db.Column(pg.ARRAY(db.Integer))
    watts = db.Column(pg.ARRAY(pg.REAL))
    grade_smooth = db.Column(pg.ARRAY(pg.REAL))

    dt_cached = db.Column(pg.TIMESTAMP)
    dt_last_accessed = db.Column(pg.TIMESTAMP)
    access_count = db.Column(db.Integer)

    # self.user is the user that requested this activity, and may or may not
    #  be the owner of the activity (athlete_id)
    user_id = db.Column(db.Integer, db.ForeignKey("users.strava_id"))

    # path color is not stored in the database
    path_color = None
    latlng = None

    @classmethod
    def new(cls, **kwargs):
        A = cls(**kwargs)
        A.dt_cached = datetime.utcnow()
        A.access_count = 0
        return A

    def authorized(self):
        return self.user_id == self.athlete_id

    def __repr__(self):
        return "<Activity %r>" % (self.id)

    def make_latlng(self):
        mypolyline = self.polyline or self.summary_polyline
        if mypolyline:
            self.latlng = polyline.decode(mypolyline)
        return self.latlng

    def serialize(self):
        attrs = ["id", "athlete_id", "name", "type", "summary_polyline",
                 "beginTimestamp", "total_distance", "elapsed_time",
                 "time", "polyline", "distance", "altitude", "velocity_smooth",
                 "cadence", "watts", "grade_smooth", "dt_cached",
                 "dt_last_accessed", "access_count"]
        return {attr: getattr(self, attr) for attr in attrs}

    def import_streams(self, streams=[]):
        if not self.authorized():
            return None

        if not getattr(self, "summary_polyline", None):
            return self

        stream_names = set(['time', 'latlng', 'altitude'])
        stream_names.update(streams)

        client = User.get(self.user_id).client()
        try:
            streams = client.get_activity_streams(self.id, types=stream_names)
        except Exception as e:
            return {"error": str(e)}

        for s in streams:
            setattr(self, s, streams[s].data)

        if self.latlng:
            self.polyline = polyline.encode(self.latlng)

        return self

    def data(self, attrs, timeout=CACHE_DATA_TIMEOUT):
        """
        Activity.data(attrs) retrieves and caches only specific
        attributes for this Activity, saving memory compared to caching the
        entire object.
        Activity.get() returns an activity object, but Activity.data(attrs)
        returns a dictionary object.
        """
        key = "A:{}:{}".format(self.id, attrs)
        data = cache.get(key)
        if data:
            app.logger.debug("retrieved '{}'".format(key))
            return data

        if "latlng" in attrs:
            self.make_latlng()
        data = {attr: getattr(self, attr, None) for attr in attrs}
        cache.set(key, data, timeout)
        app.logger.debug("cached {} for {} for {} sec"
                         .format(attrs, self, timeout))
        return data

    @staticmethod
    def key(identifier):
        return "A:{}".format(identifier)

    def cache(self, identifier=None, timeout=CACHE_ACTIVITIES_TIMEOUT):
        key = Activity.key(identifier or self.id)
        cache.set(key, self, timeout)
        app.logger.debug(
            "cached {} under key '{}' for {} sec".format(self, key, timeout))

    def uncache(self):
        key = Activity.key(self.id)
        cache.delete(key)

    @classmethod
    def get(cls, activity_id, timeout=CACHE_ACTIVITIES_TIMEOUT):
        key = cls.key(activity_id)
        A = cache.get(key)

        if A:
            app.logger.debug("retrieved {} with key '{}'".format(A, key))
            return A

        try:
            id = int(activity_id)
        except ValueError:
            return None

        A = cls.query.get(id)
        if A:
            A.dt_last_accessed = datetime.utcnow()
            A.access_count += 1
            app.logger.debug("retrieved {} from db".format(A))
            A.cache(timeout=timeout)
        return A

    @classmethod
    def get_data(cls, activity_id, attrs, timeout=CACHE_DATA_TIMEOUT):
        A = cls.query.get(activity_id)
        if A:
            return A.data(attrs, timeout=CACHE_DATA_TIMEOUT)


# Create tables if they don't exist
#  These commands aren't necessary if we use flask-migrate

# db.create_all()
# db.session.commit()
