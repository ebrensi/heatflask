#! usr/bin/env python

from flask import Flask, render_template, request, redirect, jsonify, url_for
from flask_compress import Compress
from datetime import date, timedelta
import os

from flask_sqlalchemy import SQLAlchemy


# For models
from sqlalchemy.dialects.postgresql import ARRAY, DOUBLE_PRECISION, INTEGER, TIMESTAMP, JSON

# This app is outgrowing this single-file setup. The next step is to modularize
#  it but for now we'll stick with this while we get the SQLAlchemy data models
#  working


# Configuration
# Later we'll put this in a config.py file
SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
DEBUG = True
SQLALCHEMY_TRACK_MODIFICATIONS = True

# Initialization. Later we'll put this in the __init__.py file
app = Flask(__name__)
app.config.from_object(__name__)
Compress(app)

db = SQLAlchemy(app)
db.create_all()
db.session.commit()


# Data models.  These will go in models.py later


class User(db.Model):
    __tablename__ = 'users'
    name = db.Column(db.String(),  primary_key=True)
    gc_username = db.Column(db.String())
    gc_password = db.Column(db.String())

    # This is set up so that if a user gets deleted, all of the associated
    #  activities are also deleted.
    activities = db.relationship("Activity",
                                 backref="user",
                                 cascade="all, delete, delete-orphan",
                                 lazy="dynamic")

    def __init__(self, name):
        self.name = name

    def __repr__(self):
        return "<User %r>" % (self.name)


class Activity(db.Model):
    id = db.Column(INTEGER, primary_key=True)
    beginTimestamp = db.Column(TIMESTAMP)
    summary = db.Column(JSON)
    elapsed = db.Column(ARRAY(INTEGER))
    latitudes = db.Column(ARRAY(DOUBLE_PRECISION))
    longitudes = db.Column(ARRAY(DOUBLE_PRECISION))

    user_name = db.Column(db.String(), db.ForeignKey("users.name"))

    def __init__(self, user, id, beginTimestamp, summary, elapsed, latitudes, longitudes):
        self.user = user
        self.id = id
        self.beginTimestamp = beginTimestamp
        self.summary = summary
        self.elapsed = elapsed
        self.latitudes = latitudes
        self.longitudes = longitudes

    def __repr__(self):
        return "<Activity %s_%r>" % (self.user_name, self.id)


# Web views

# for now we redirect the default view to my personal map
@app.route('/')
def nothing():
    return redirect(url_for('user_map', username="ebrensi"))


# route for handling the login page logic
@app.route('/login', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form['username']
        user = User.query.get(username)
        if user:
            return redirect(url_for('user_map', username=username))
        else:
            error = 'Invalid Credentials. Please try again.'
    return render_template('login.html', error=error)


@app.route('/<username>')
def user_map(username):
    return render_template('map.html', username=username)


@app.route('/<username>/points.json')
def pointsJSON(username):
    tomorrow = (date.today() + timedelta(1)).strftime('%Y-%m-%d')
    today = date.today().strftime('%Y-%m-%d')

    start = request.args.get("start", today)
    end = request.args.get("end", tomorrow)

    user = User.query.get(username)
    points = [[row[0], row[1]] for row in get_points(user, start, end)]
    resp = jsonify(points)
    resp.status_code = 200

    return resp


def get_points(user, start=None, end=None):
    # TODO: make sure datetimes are valid and start <= finish
    # query = """
    #         SELECT  lat, lng
    #         FROM (
    #             SELECT elapsed, lat, lng
    #             FROM(
    #                 SELECT unnest(elapsed) AS elapsed,
    #                        unnest(latitudes) AS lat,
    #                        unnest(longitudes) AS lng
    #                 FROM %s
    #                 WHERE user_name == '%s'
    #                   AND begintimestamp >= '%s'
    #                   AND begintimestamp <= '%s'
    #                 ) AS sub
    #             ) AS sub2
    #         WHERE lat <> 0 AND lng <> 0;
    #         """ % (Activity.__tablename__, user.name, start, end)

    result = db.session.query(db.func.unnest(Activity.latitudes),
                              db.func.unnest(Activity.longitudes))
    result = result.filter_by(user=user)
    result = result.filter(Activity.beginTimestamp.between(start, end))

    # figure out a better way to do this
    result = [(a, b) for a, b in result if (a, b) != (0, 0)]
    return result


@app.route('/<user_name>/gcimport')
# endpoint for scheduling a Garmin Connect activity import
def gcimport(user_name):
    user = User.query.get(user_name)

    if user:
        clean = request.args.get("clean", "false")
        count = request.args.get("count", 3)

        if clean.lower() == "true":
            return "<h1>clear data for {} and import {} most recent activities</h1>".format(user_name, count)
        else:
            return "<h1>import {} most recent activities for user {}</h1>".format(count, user_name)


# This works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
