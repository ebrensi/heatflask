#! usr/bin/env python

from app import db
from sqlalchemy.dialects.postgresql import ARRAY, DOUBLE_PRECISION, INTEGER, TIMESTAMP, JSON


class Activity(db.Model):
    id = db.Column(INTEGER, primary_key=True)
    beginTimestamp = db.Column(TIMESTAMP)
    summary = db.Column(JSON)
    elapsed = db.Column(ARRAY(INTEGER))
    latitudes = db.Column(ARRAY(DOUBLE_PRECISION))
    longitudes = db.Column(ARRAY(DOUBLE_PRECISION))

    user_id = db.Column(INTEGER, db.Foreignkey("user.id"))

    def __repr__(self):
        return "<Activity %r>" % (self.id)


class User(db.Model):
    id = db.Column(INTEGER, primary_key=True)
    name = db.Column(db.String())

    activities = db.relationship("Activity", backref="user", lazy="dynamic")

    def __repr__(self):
        return "<User %r>" % (self.name)
