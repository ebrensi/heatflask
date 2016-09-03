#! usr/bin/env python

from flask import Flask, Response, render_template, request, redirect, jsonify,\
    url_for, abort, session, flash
import flask_compress
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from datetime import date, timedelta
import os
import stravalib

import flask_login
from flask_login import current_user, login_user, logout_user, login_required

app = Flask(__name__)
app.config.from_object(os.environ['APP_SETTINGS'])

# views will be sent as gzip encoded
flask_compress.Compress(app)

# initialize database
db = SQLAlchemy(app)

# data models defined in models.py
from models import User, Activity
migrate = Migrate(app, db)

# Strava client
client = stravalib.Client()

# Flask-login stuff
login_manager = flask_login.LoginManager()
login_manager.init_app(app)


@login_manager.user_loader
def load_user(name):
    return User.get(name)


@app.route('/')
def nothing():
    return redirect(url_for('login'))


# Display the login page
@app.route("/login", methods=["GET"])
def login():
    return render_template("login.html")


# Attempt to authorize a user via Oauth(2) or whatever
@app.route('/authorize/<service>')
def authorize(service):
    redirect_uri = url_for('auth_callback', service=service, _external=True)

    if service == 'strava':
        auth_url = client.authorization_url(client_id=app.config["STRAVA_CLIENT_ID"],
                                            redirect_uri=redirect_uri,
                                            approval_prompt="force",
                                            state=request.args.get("next"))
        return redirect(auth_url)


# Authorization callback.  The service returns here to give us an access_token
#  for the user who successfully logged in.
@app.route('/authorized/<service>')
def auth_callback(service):
    if "error" in request.args:
        error = request.args["error"]
        flash("Error: {}".format(error))
        return redirect(url_for("login"))

    if current_user.is_anonymous:
        if service == "strava":
            args = {"code": request.args.get("code"),
                    "client_id": app.config["STRAVA_CLIENT_ID"],
                    "client_secret": app.config["STRAVA_CLIENT_SECRET"]}
            access_token = client.exchange_code_for_token(**args)
            client.access_token = access_token

            strava_user = client.get_athlete()
            user = User.get(strava_user.username)

            if not user:
                # If this user isn't in the database we create an account
                strava_user_info = {"id": strava_user.id,
                                    "firstname": strava_user.firstname,
                                    "lastname": strava_user.lastname,
                                    "username": strava_user.username,
                                    "pic_url": strava_user.profile,
                                    }
                user = User(name=strava_user.username,
                            strava_user_data=strava_user_info)
                db.session.add(user)
                db.session.commit()

            # I think this is remember=True, for persistent login. not sure
            login_user(user, True)

    return redirect(url_for("index", username=current_user.name))


# This is a test route to see what happens if a non-authenticated user tries
# to access a login_required view
@app.route("/check")
@login_required
def check():
    pass


@app.route("/logout")
@login_required
def logout():
    if not current_user.is_anonymous:
        username = current_user.name
        client.access_token = None
        logout_user()
        flash("{} logged out".format(username))
    return redirect(url_for("login"))
    # return redirect(url_for("index", username=user.name))

"""
 <h3>Erase user "{{ username }}" and associated data from our database</h3>
<FORM METHOD="LINK" ACTION="{{ url_for('account_delete', username=username) }}">
  <INPUT class="btn btn-primary" TYPE="submit"
         VALUE="Delete this account">
</FORM>
"""


@app.route('/<username>')
def index(username):
    return render_template('map.html',
                           username=username)


@app.route('/<username>/points.json')
def pointsJSON(username):
    tomorrow = (date.today() + timedelta(1)).strftime('%Y-%m-%d')
    today = date.today().strftime('%Y-%m-%d')

    start = request.args.get("start", today)
    end = request.args.get("end", tomorrow)

    user = User.get(username)
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


@app.route('/activity_import')
# @login_required
def activity_import():
    user = current_user

    clean = request.args.get("clean", "")
    count = request.args.get("count", 0)
    service = request.args.get("service")

    if service == "gc":
        import gcimport
        if clean:
            return "<h1>{}: clear data for {} and import {} most recent activities</h1>".format(service, user_name, count)
        else:
            do_import = gcimport.import_activities(db, user, count=count)
            return Response(do_import, mimetype='text/event-stream')

    elif service == "strava":
        return redirect(url_for("strava_activities",
                                limit=count,
                                username=user.name,
                                really="yes"))


@app.route('/strava_activities')
@login_required
def strava_activities():
    user = current_user
    already_got = [d[0] for d in db.session.query(
        Activity.id).filter_by(user_name=user.name, source="ST").all()]

    limit = request.args.get("limit")
    limit = int(limit) if limit else ""

    really = (request.args.get("really") == "yes")

    def do_import():
        count = 0
        yield "importing activities from Strava...\n"
        for a in client.get_activities(limit=limit):
            if really:

                if a.id in already_got:
                    msg = "activity {} already in database.".format(a.id)
                    yield msg + "\n"
                else:
                    try:
                        strava_map = a.map
                    except:
                        yield "activity {} has no data points".format(a.id)
                    else:
                        summary = {"map": strava_map,
                                   "name": a.name}
                        streams = client.get_activity_streams(int(a.id),
                                                              types=['time', 'latlng'])
                        time = streams["time"].data
                        lat, lng = zip(*streams["latlng"].data)

                        A = Activity(user=user,
                                     id=a.id,
                                     summary=summary,
                                     beginTimestamp=a.start_date_local,
                                     elapsed=time,
                                     latitudes=list(lat),
                                     longitudes=list(lng),
                                     source="ST")
                        db.session.add(A)
                        db.session.commit()

            count += 1
            mi = stravalib.unithelper.miles(a.distance)
            msg = ("[{0.id}] {0.name}: {0.start_date_local},"
                   " {0.elapsed_time}, ").format(a)
            msg += "{}\n".format(mi)
            yield msg
        yield "Done! {} activities imported\n".format(count)

    return Response(do_import(), mimetype='text/event-stream')


@app.route('/strava/activities/<activity_id>')
def data_points(activity_id):
    if client.access_token:
        streams = client.get_activity_streams(int(activity_id),
                                              types=['time', 'latlng'])

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
