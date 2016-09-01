#! usr/bin/env python

from urllib import urlencode
from flask import Flask, Response, render_template, request, redirect, jsonify,\
    url_for, abort, session
from flask_login import LoginManager, login_required,  login_user, logout_user
import flask_compress
from datetime import date, timedelta
import os
import requests
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
import stravalib


# Configuration
STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_AUTH_PARAMS = {"client_id": os.environ["STRAVA_CLIENT_ID"],
                      "response_type": "code",
                      # "redirect_uri": "uri",
                      # "scope": "view_prvate",
                      # "state": "mystate",
                      "approval_prompt": "force"}

STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_TOKEN_PARAMS = {"client_id": os.environ["STRAVA_CLIENT_ID"],
                       "client_secret":  os.environ["STRAVA_CLIENT_SECRET"],
                       "code": "code"}

# Initialization. Later we'll put this in the __init__.py file
app = Flask(__name__)
app.config.from_object(os.environ['APP_SETTINGS'])
app.config.from_object(__name__)

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


# ************* other web views ****************
# for now we redirect the default view to my personal map
@app.route('/')
def nothing():
    return redirect(url_for('user_map', username="Efrem"))


@app.route('/<username>')
def user_map(username):
    params = STRAVA_AUTH_PARAMS.copy()
    params.update({"state": username,
                   "redirect_uri": url_for("strava_token_exchange",
                                           _external=True)
                   })

    strava_url = STRAVA_AUTH_URL + "?" + urlencode(params)
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
                do_import = gcimport.import_activities(db, user, count=count)
                return Response(do_import, mimetype='text/event-stream')


@app.route('/strava_token_exchange')
def strava_token_exchange():
    # resp = jsonify(request.args)
    # resp.status_code = 200

    params = STRAVA_TOKEN_PARAMS.copy()
    params["code"] = request.args["code"]

    response = requests.post(STRAVA_TOKEN_URL, data=params)
    resp = jsonify(response.json())
    resp.status_code = 200
    return resp


# ------- Strava API stuff -----------
@app.route('/strava')
def strava():
    return redirect(url_for("strava_userinfo"))


@app.route('/strava/userinfo')
def strava_userinfo():
    if client.access_token:
        athlete = client.get_athlete()

        ath = {"id": athlete.id,
               "firstname": athlete.firstname,
               "lastname": athlete.lastname,
               "username": athlete.username,
               "pic_url": athlete.profile
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
