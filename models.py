from heatmapp import db
from flask_login import UserMixin
from sqlalchemy.dialects.postgresql import ARRAY, DOUBLE_PRECISION, INTEGER, TIMESTAMP, JSON


class User(UserMixin, db.Model):
    __tablename__ = 'users'
    name = db.Column(db.String(), primary_key=True)
    # password = db.Column(db.String(), default="")

    gc_username = db.Column(db.String())
    gc_password = db.Column(db.String())

    strava_user_data = db.Column(JSON)

    # This is set up so that if a user gets deleted, all of the associated
    #  activities are also deleted.
    activities = db.relationship("Activity",
                                 backref="user",
                                 cascade="all, delete, delete-orphan",
                                 lazy="dynamic")

    def __repr__(self):
        return "<User %r>" % (self.name)

    def get_id(self):
        return self.name

    @classmethod
    def get(cls, name):
        user = cls.query.get(name)
        return user if user else None


class Activity(db.Model):
    id = db.Column(INTEGER, primary_key=True)
    beginTimestamp = db.Column(TIMESTAMP)
    summary = db.Column(JSON)
    elapsed = db.Column(ARRAY(INTEGER))
    latitudes = db.Column(ARRAY(DOUBLE_PRECISION))
    longitudes = db.Column(ARRAY(DOUBLE_PRECISION))

    source = db.Column(db.String(2))

    user_name = db.Column(db.String(), db.ForeignKey("users.name"))

    def __repr__(self):
        return "<Activity %s_%r>" % (self.user_name, self.id)
