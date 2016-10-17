#! usr/bin/env python
from __future__ import unicode_literals

from flask import Flask, Response, render_template, request, redirect, \
    jsonify, url_for, abort, session, flash, g
import flask_compress
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from datetime import date, timedelta
import dateutil.parser
import os
import json
import stravalib
import polyline
import flask_login
from flask_login import current_user, login_user, logout_user, login_required
import flask_assets
from flask_analytics import Analytics


app = Flask(__name__)
app.config.from_object(os.environ['APP_SETTINGS'])

Analytics(app)

# we bundle javascript and css dependencies to reduce client-side overhead
bundles = {
    "index_css": flask_assets.Bundle('css/jquery-ui.css',
                                     'css/bootstrap.min.css',
                                     'css/font-awesome.min.css',
                                     'css/leaflet.css',
                                     'css/leaflet-sidebar.css',
                                     'css/L.Control.ZoomBox.css',
                                     output='gen/index.css'),

    "index_js": flask_assets.Bundle('js/jquery-3.1.0.min.js',
                                    'js/jquery-ui.min.js',
                                    'js/leaflet.js',
                                    'js/leaflet-sidebar.js',
                                    'js/Polyline.encoded.js',
                                    'js/leaflet.spin.js',
                                    'js/spin.min.js',
                                    'js/moment.js',
                                    'js/leaflet-heat.js',
                                    'js/leaflet-ant-path.js',
                                    'js/L.Control.ZoomBox.min.js',
                                    'js/leaflet-providers.js',
                                    output='gen/index.js')

}
assets = flask_assets.Environment(app)
assets.register(bundles)


# views will be sent as gzip encoded
flask_compress.Compress(app)

# initialize database
db = SQLAlchemy(app)

# data models defined in models.py
from models import User, Activity
migrate = Migrate(app, db)

# Flask-login stuff
login_manager = flask_login.LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'nothing'


@login_manager.user_loader
def load_user(name):
    return User.get(name)


@app.route('/')
def nothing():
    if current_user.is_anonymous:
        return render_template("splash.html")
    else:
        return redirect(url_for('index', username=current_user.name))


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


# Attempt to authorize a user via Oauth(2)
@app.route('/authorize')
def authorize():
    state = request.args.get("state")
    redirect_uri = url_for('auth_callback', _external=True)

    client = stravalib.Client()
    auth_url = client.authorization_url(client_id=app.config["STRAVA_CLIENT_ID"],
                                        redirect_uri=redirect_uri,
                                        # approval_prompt="force",
                                        state=state)
    return redirect(auth_url)


# Authorization callback.  The service returns here to give us an access_token
#  for the user who successfully logged in.
@app.route('/authorized')
def auth_callback():
    state = request.args.get("state")

    if "error" in request.args:
        error = request.args["error"]
        flash("Error: {}".format(error))
        return redirect(state)

    if current_user.is_anonymous:
        args = {"code": request.args.get("code"),
                "client_id": app.config["STRAVA_CLIENT_ID"],
                "client_secret": app.config["STRAVA_CLIENT_SECRET"]}
        client = stravalib.Client()
        try:
            access_token = client.exchange_code_for_token(**args)

        except Exception as e:
            app.logger.info(str(e))
            flash(str(e))
            return redirect(state)

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

        # remember=True, for persistent login.
        login_user(user, remember=True)

    return redirect(request.args.get("state") or
                    url_for("index", username=current_user.name))


@app.route("/logout")
@login_required
def logout():
    if not current_user.is_anonymous:
        username = current_user.name
        logout_user()
        flash("{} logged out".format(username))
    return redirect(request.args.get("next") or url_for("nothing"))


@app.route("/<username>/delete")
@login_required
def delete(username):
    if username == current_user.name:
        logout_user()

        # that user is no longer the current user
        user = User.get(username)
        try:
            db.session.delete(user)
            db.session.commit()
        except Exception as e:
            flash(str(e))
        else:
            flash("user '{}' deleted".format(username))
    else:
        flash("you ({}) are not authorized to delete user {}"
              .format(current_user.name, username))

    return redirect(url_for("nothing"))


@app.route('/<username>')
def index(username):
    date1 = request.args.get("date1")
    date2 = request.args.get("date2")
    preset = request.args.get("preset")
    autozoom = request.args.get("autozoom", "")
    baselayer = request.args.getlist("baselayer")

    if ((not date1) or (not date2)) and (not preset):
        preset = "7"
        autozoom = "1"
        baselayer = ["OpenStreetMap.BlackAndWhite"]
    else:
        preset = preset if (preset in app.config["DATE_RANGE_PRESETS"]) else "7"

    flowres = request.args.get("flowres", "")
    heatres = request.args.get("heatres", "")
    if (not flowres) and (not heatres):
        flowres = "low"

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
                           date1=date1,
                           date2=date2,
                           heatres=heatres,
                           flowres=flowres,
                           autozoom=autozoom,
                           baselayer=baselayer
                           )


@app.route('/<username>/getdata')
def getdata(username):
    user = User.get(username)
    start = request.args.get("start")
    end = request.args.get("end")

    if not user:
        return jsonify({
            "error": "'{}' is not registered with this app".format(username)
        })

    options = {}
    if "id" in request.args:
        options["activity_ids"] = request.args.getlist("id")

    else:
        if "friends" in request.args:
            options["friends"] = True

        if "limit" in request.args:
            options["limit"] = int(request.args.get("limit"))

        try:
            options["after"] = dateutil.parser.parse(start)
            options["before"] = dateutil.parser.parse(end)
            assert(options["before"] > options["after"])
        except:
            return jsonify({
                "error": "Enter Valid Dates"
            })

    # options = {"activity_ids": [730239033, 97090517]}

    hires = request.args.get("hires") == "true"
    durations = request.args.get("durations")

    data = {"summary": [], "lores": [], "hires": [], "durations": []}

    def path_color(activity_type):
        color_list = [color for color, activity_types
                      in app.config["ANTPATH_ACTIVITY_COLORS"].items()
                      if activity_type.lower() in activity_types]

        return color_list[0] if color_list else ""

    token = user.strava_user_data.get("access_token")
    client = stravalib.Client(access_token=token)

    for activity in activity_summary_iterator(client=client, **options):
        if "error" in activity:
            return jsonify(activity)

        activity["path_color"] = path_color(activity["type"])
        data["lores"].append(activity.pop("summary_polyline"))
        data["summary"].append(activity)

        if hires:
            act = Activity.query.get(activity["id"])
            if act:
                # If streams for this activity are in the database
                #  then retrieve them
                stream_dict = {"polyline": act.polyline, "time": act.time}
            else:

                # otherwise, request them from Strava
                stream_names = ['time', 'latlng', 'distance', 'altitude',
                                'velocity_smooth']

                streams = client.get_activity_streams(activity["id"],
                                                      types=stream_names)
                stream_dict = {name: streams[name].data
                               for name in stream_names}

                if "latlng" in stream_dict:
                    stream_dict["polyline"] = (
                        polyline.encode(stream_dict.pop('latlng'))
                    )

            data["hires"].append(stream_dict["polyline"])
            if durations:
                t = stream_dict["time"]
                dur = [(b - a) for a, b in zip(t, t[1:])] + [0]
                data["durations"].append(dur)

    data["message"] = (
        "displaying {} - {} data".format(start, end)
    )
    return jsonify(data)


@app.route('/<username>/activity_import')
@login_required
def activity_import(username):
    if username == current_user.name:
        user = User.get(username)
        count = int(request.args.get("count", 1))

        import stravaimport
        do_import = stravaimport.import_activities(db, user,
                                                   limit=count)
        return Response(do_import, mimetype='text/event-stream')
    else:
        return iter(["There is a problem importing activities. Try logging out and logging back in."])


def activity_summary_iterator(user=None, client=None, activity_ids=None, **args):
    if user and (not client):
        token = user.strava_user_data.get("access_token")
        client = stravalib.Client(access_token=token)

    if activity_ids:
        activities = (client.get_activity(int(id)) for id in activity_ids)
    else:
        activities = client.get_activities(**args)

    while True:
        try:
            a = activities.next()
        except StopIteration:
            return
        except Exception as e:
            yield {"error": str(e)}
            return

        yield {
            "id": a.id,
            "athlete_id": a.athlete.id,
            "name": a.name,
            "type": a.type,
            "summary_polyline": a.map.summary_polyline,
            "beginTimestamp": str(a.start_date_local),
            "total_distance": float(a.distance),
            "elapsed_time": int(a.elapsed_time.total_seconds())
        }


# creates a stream of current.user's activities, using the Strava API arguments
@app.route('/activity_summary_sse')
@login_required
def activities():
    user = User.get(current_user.name)
    ids_query = db.session.query(Activity.id).filter_by(user=user).all()
    cached_activities = set(int(d[0]) for d in ids_query)
    options = {}

    if "id" in request.args:
        options["activity_ids"] = request.args.getlist("id")
    else:
        if "friends" in request.args:
            options["friends"] = True

        if "before" in request.args:
            options["before"] = dateutil.parser.parse(
                request.args.get("before"))

        if "after" in request.args:
            options["after"] = dateutil.parser.parse(request.args.get("after"))

        if "limit" in request.args:
            options["limit"] = int(request.args.get("limit"))

    def boo():
        for a in activity_summary_iterator(user, **options):
            a["cached"] = "yes" if int(a['id']) in cached_activities else "no"
            yield "data: {}\n\n".format(json.dumps(a))
        yield "data: done\n\n"

    return Response(boo(), mimetype='text/event-stream')


# Admin stuff
@app.route('/admin')
@login_required
def admin():
    users = User.query.all()

    info = {
        user.name: {
            "is_active": user.is_active,
            "cached": len(db.session.query(Activity.id).filter_by(user=user).all())
        }
        for user in users}
    return jsonify(info)

"""
@app.route('/subscribe')
@login_required
def subscribe():
    user = User.get(current_user.name)
    token = user.strava_user_data.get("access_token")
    client = stravalib.Client(access_token=token)
    sub = client.create_subscription(client_id=app.config["STRAVA_CLIENT_ID"],
                                     client_secret=app.config[
                                         "STRAVA_CLIENT_SECRET"],
                                     callback_url=url_for("webhook_callback",
                                                          _external=True))


@app.route('/webhook_callback', methods=["GET", "POST"])
def webhook_callback():
    client = stravalib.Client()

    if request.method == 'GET':
        response = client.handle_subscription_callback(request)
    else:
        response = client.handle_subscription_update(request)
"""

# python heatmapp.py works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
