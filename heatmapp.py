#! usr/bin/env python

from flask import Flask, Response, render_template, request, redirect, jsonify,\
    url_for, abort, session
from flask_login import LoginManager, login_required,  login_user, logout_user
import flask_compress
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from datetime import date, timedelta
import os
import stravalib

import json


app = Flask(__name__)
app.config.from_object(os.environ['APP_SETTINGS'])

# initialize database
db = SQLAlchemy(app)

# data models defined in models.py
from models import User, Activity
migrate = Migrate(app, db)


# initialize flask-login functionality
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Strava client
client = stravalib.Client()


# views will be sent as gzip encoded
flask_compress.Compress(app)

# Web views

# ************* User handling views *************


# for now we redirect the default view to my personal map
@app.route('/')
def nothing():
    return redirect(url_for('user_map', username="Efrem"))


@app.route('/<username>')
def user_map(username):
    return render_template('map.html',
                           username=username,
                           strava_auth_url=url_for("strava_userinfo"))


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
                do_import = gcimport.import_activities(db, user, count=count)
                return Response(do_import, mimetype='text/event-stream')


# ------- Strava API stuff -----------
@app.route('/strava')
def strava():
    return redirect(url_for("strava_userinfo"))


@app.route('/strava/userinfo')
def strava_userinfo():
    if client.access_token:
        A = client.get_athlete()
        # ath = {key:value for key, value in A.__dict__.items()
        #         if not key.startswith('__') and not callable(key)}

        ath = {"id": A.id,
               "firstname": A.firstname,
               "lastname": A.lastname,
               "username": A.username,
               "pic_url": A.profile
               }
        return jsonify(ath)
    else:
        return redirect(url_for('strava_login'))


@app.route('/strava/login')
def strava_login():
    redirect_uri = url_for('authorized', _external=True)
    auth_url = client.authorization_url(client_id=app.config["STRAVA_CLIENT_ID"],
                                        redirect_uri=redirect_uri,
                                        approval_prompt="force",
                                        state=request.args.get("next", ""))
    return redirect(auth_url)


@app.route('/strava/login/authorized')
def authorized():
    code = request.args['code']
    access_token = client.exchange_code_for_token(client_id=app.config["STRAVA_CLIENT_ID"],
                                                  client_secret=app.config[
                                                      "STRAVA_CLIENT_SECRET"],
                                                  code=code)
    if access_token:
        client.access_token = access_token
        return redirect(request.args.get("state") or url_for("strava_userinfo"))


@app.route('/strava/activities')
def activities():
    if client.access_token:
        limit = request.args.get("limit")

        def do_import():
            count = 0
            yield "importing activities from Strava...\n"
            for a in client.get_activities(limit=limit):
                count += 1
                yield ("[{0.id}] {0.name}: {0.start_date_local},"
                       " {0.elapsed_time}, {0.distance}\n").format(a)
            yield "Done! {} activities exported\n".format(count)

        return Response(do_import(), mimetype='text/event-stream')
    else:
        return redirect(url_for('strava_login', next=url_for("activities",
                                                             _external=True)))


@app.route('/strava/activities/<activity_id>')
def data_points(activity_id):
    if client.access_token:
        streams = client.get_activity_streams(int(activity_id),
                                              types=['time', 'latlng'])
        print(streams)

        time = streams["time"].data
        latlng = streams["latlng"].data
        points = ("{}: {}\n".format(t, ll) for t, ll in zip(time, latlng))
        return Response(points, mimetype='text/event-stream')
    else:
        return redirect(url_for('strava_login',
                                next=url_for("data_points",
                                             activity_id=activity_id,
                                             _external=True)))


# python heatmapp.py works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
