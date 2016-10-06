#! usr/bin/env python

from flask import Flask, Response, render_template, request, redirect, \
    jsonify, url_for, abort, session, flash, g
import flask_compress
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from datetime import date, timedelta
import dateutil.parser
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


@app.route("/login")
def login():
    return render_template("login.html")


# Attempt to authorize a user via Oauth(2)
@app.route('/authorize/<service>')
def authorize(service):
    redirect_uri = url_for('auth_callback', service=service, _external=True)

    if service == 'strava':
        auth_url = client.authorization_url(client_id=app.config["STRAVA_CLIENT_ID"],
                                            redirect_uri=redirect_uri,
                                            # approval_prompt="force",
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
                                    "access_token": access_token
                                    }
                user = User(name=strava_user.username,
                            strava_user_data=strava_user_info)
                db.session.add(user)
                db.session.commit()

            elif access_token != user.strava_user_data["access_token"]:
                # if user exists but the access token has changed, update it
                user.strava_user_data["access_token"] = access_token
                db.session.commit()

            # I think this is remember=True, for persistent login.
            login_user(user, remember=True)

    return redirect(request.args.get("state") or
                    url_for("index", username=current_user.name))


@app.route("/logout")
@login_required
def logout():
    if not current_user.is_anonymous:
        username = current_user.name
        client.access_token = None
        logout_user()
        flash("{} logged out".format(username))
    return redirect(request.args.get("next") or url_for("login"))


@app.route("/<username>/delete")
@login_required
def delete(username):
    if username == current_user.name:
        # log out current user
        client.access_token = None
        logout_user()

        # that user is no longer the current user
        user = User.get(username)
        db.session.delete(user)
        db.session.commit()
        flash("user '{}' deleted".format(username))
    else:
        flash("you ({}) are not authorized to delete user {}"
              .format(current_user.name, username))

    return redirect(url_for("login"))


@app.route('/demo')
def demo():
    return redirect(url_for("index",
                            username="ebuggz",
                            preset="7",
                            heatres="high",
                            flowres="low",
                            autozoom=1,
                            baselayer=["OpenTopoMap"]
                            )
                    )


@app.route('/<username>')
def index(username):
    preset = request.args.get("preset")
    # preset = preset if (preset in ["2", "7", "30", "60"]) else ""

    default_center = app.config["MAP_CENTER"]
    lat = request.args.get("lat") or default_center[0]
    lng = request.args.get("lng") or default_center[1]
    zoom = request.args.get("zoom") or app.config["MAP_ZOOM"]

    return render_template('index.html',
                           username=username,
                           lat=lat,
                           lng=lng,
                           zoom=zoom,
                           preset=preset,
                           date1=request.args.get("date1"),
                           date2=request.args.get("date2"),
                           heatres=request.args.get("heatres", ""),
                           flowres=request.args.get("flowres", ""),
                           autozoom=request.args.get("autozoom", ""),
                           baselayer=request.args.getlist("baselayer")
                           )


@app.route('/<username>/getdata')
def getdata(username):
    user = User.get(username)
    start = request.args.get("start")
    end = request.args.get("end")

    try:
        dt_start = dateutil.parser.parse(start, fuzzy=True)
        dt_end = dateutil.parser.parse(end, fuzzy=True)
        assert(dt_end > dt_start)

    except Exception as e:
        app.logger.info(e)
        return jsonify({
            "error": "Enter Valid Dates."
        })

    start = dt_start.strftime("%Y-%m-%d")
    end = dt_end.strftime("%Y-%m-%d")
    # app.logger.info("dt_start = '{}', dt_end = '{}'".format(start, end))

    hires = request.args.get("hires") == "true"
    lores = request.args.get("lores") == "true"
    durations = request.args.get("durations")

    data = {}

    result = (db.session.query(
        Activity.id,
        Activity.name,
        Activity.type,
        Activity.total_distance,
        Activity.elapsed_time,
        Activity.beginTimestamp
    ).filter(Activity.beginTimestamp.between(start, end))
        .filter_by(user=user)
    ).all()

    def path_color(activity_type):
        color_list = [color for color, activity_types
                      in app.config["ANTPATH_ACTIVITY_COLORS"].items()
                      if activity_type.lower() in activity_types]

        return color_list[0] if color_list else ""

    data["summary"] = [
        {
            "id": r[0],
            "name": r[1],
            "type": r[2],
            "path_color": path_color(r[2]),
            "distance": r[3],
            "elapsed_time": r[4],
            "start_time": str(r[5])
        }
        for r in result]

    # app.logger.info(data)

    if hires:
        result = (db.session.query(Activity.polyline)
                  .filter(Activity.beginTimestamp.between(start, end))
                  .filter_by(user=user)
                  ).all()
        routes = [r[0] for r in result]
        if any(routes):
            data["hires"] = routes
        else:
            return jsonify({"error": "no high-res data in that date range"})

    if lores:
        result = (db.session.query(Activity.summary_polyline)
                  .filter(Activity.beginTimestamp.between(start, end))
                  .filter_by(user=user)
                  ).all()
        routes = [r[0] for r in result]
        if any(routes):
            data["lores"] = routes
        else:
            return jsonify({"error": "no data in that date range"})

    if durations:
        result = (db.session.query(Activity.distance, Activity.time)
                  .filter(Activity.beginTimestamp.between(start, end))
                  .filter_by(user=user)
                  ).all()

        # data["distances"] = [[round(b - a, 2) for a, b in zip(pl[0], pl[0][1:])] + [0]
        #                      for pl in result]

        data["durations"] = [[(b - a) for a, b in zip(pl[1], pl[1][1:])] + [0]
                             for pl in result]

    # app.logger.info(data)
    data["message"] = (
        "successfully retrieved data from {} to {}".format(start, end)
    )
    return jsonify(data)


@app.route('/activity_import')
@login_required
def activity_import():
    user = User.get(current_user.name)
    count = int(request.args.get("count", 1))
    detailed = request.args.get("detailed") == "yes"

    import stravaimport
    do_import = stravaimport.import_activities(db, user, client,
                                               limit=count,
                                               detailed=detailed)
    return Response(do_import, mimetype='text/event-stream')


@app.route('/admin')
# @login_required
def admin():
    users = User.query.all()
    info = {user.name: {"is_active": user.is_active} for user in users}
    return jsonify(info)


# python heatmapp.py works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
