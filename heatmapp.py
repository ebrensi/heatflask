#! usr/bin/env python

from flask import Flask, Response, render_template, request, redirect, jsonify, url_for, session, abort
from flask_login import LoginManager, UserMixin, login_required,  login_user, logout_user

import flask_compress
from datetime import date, timedelta
import os

from flask_sqlalchemy import SQLAlchemy

try:
    from urllib.parse import urlencode
except ImportError:
    from urllib import urlencode

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

STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_AUTH_PARAMS = {"client_id": 12700,
                      "response_type": "code",
                      "redirect_uri": "http://heatflask.herokuapp.com/strava_token_exchange",
                      # "scope": "view_prvate",
                      # "state": "mystate",
                      "approval_prompt": "force"
                      }

# Initialization. Later we'll put this in the __init__.py file
app = Flask(__name__)
app.config.from_object(__name__)

# initialize database
db = SQLAlchemy(app)

# Create tables if they don't exist
db.create_all()
db.session.commit()

# initialize flask-login functionality
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'


# views will be sent as gzip encoded
flask_compress.Compress(app)


# Data models.  These will go in models.py later
class User(db.Model, UserMixin):
    __tablename__ = 'users'
    name = db.Column(db.String(), primary_key=True)
    # password = db.Column(db.String(), default="")

    gc_username = db.Column(db.String())
    gc_password = db.Column(db.String())

    strava_token = db.Column(db.String())

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


# Web views

# ************* User handling views *************
# somewhere to login
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == 'POST':
        username = request.form['username']
        # password = request.form['password']

        user = User.get(username)

        if user:
            login_user(user)
            return redirect(request.args.get("next"))
        else:
            return abort(401)
    else:
        return Response('''
        <form action="" method="post">
            <p><input type=text name=username>
            <p><input type=password name=password>
            <p><input type=submit value=Login>
        </form>
        ''')


@app.route("/logout")
@login_required
def logout():
    logout_user()
    return Response('<p>Logged out</p>')


# handle login failed
@app.errorhandler(401)
def page_not_found(e):
    return Response('<p>Login failed</p>')


# callback to reload the user object
@login_manager.user_loader
def load_user(username):
    return User.get(username)


# ************* other web views ****************
# for now we redirect the default view to my personal map
@app.route('/')
def nothing():
    return redirect(url_for('user_map', username="Efrem"))


@app.route('/<username>')
def user_map(username):
    strava_url = STRAVA_AUTH_URL + "?" + urlencode(STRAVA_AUTH_PARAMS)
    return render_template('map.html',
                           username=username,
                           strava_auth_url=strava_url)


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


@app.route('/<user_name>/activity_import')
# endpoint for scheduling a Garmin Connect activity import
def activity_import(user_name):
    user = User.get(user_name)

    if user:
        clean = request.args.get("clean", "")
        count = request.args.get("count", 3)
        service = request.args.get("service")

        if service == "gc":
            import gcimport
            if clean:
                return "<h1>{}: clear data for {} and import {} most recent activities</h1>".format(service, user_name, count)
            else:
                gcimport.import_activities(db, user, count=count)
                return "<h1>{}: import {} most recent activities for user {}</h1>".format(service, count, user_name)


@app.route('/strava_token_exchange')
def strava_token_exchange():
    resp = jsonify(request.args)
    resp.status_code = 200

    strava_token = request.args["code"]
    return resp


# This works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
