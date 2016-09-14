#! usr/bin/env python

from flask import Flask, Response, render_template, request, redirect, jsonify,\
    url_for, abort, session, flash, g
import flask_compress
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from datetime import date, timedelta
import os
import stravalib
import polyline
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


# Attempt to authorize a user via Oauth(2)
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

            # I think this is remember=True, for persistent login. not sure
            login_user(user, True)

    return redirect(url_for("index", username=current_user.name))


@app.route("/logout")
@login_required
def logout():
    if not current_user.is_anonymous:
        username = current_user.name
        client.access_token = None
        logout_user()
        flash("{} logged out".format(username))
    return redirect(url_for("login"))


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
                            autozoom=1))


@app.route('/<username>')
def index(username):
    preset = request.args.get("preset")
    preset = preset if (preset in ["2", "7", "30"]) else ""

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
                           default_layers=app.config["LEAFLET_BASE_LAYERS"],
                           )


@app.route('/<username>/latlngs/<orientation>')
def latlngsJSON(username, orientation):
    tomorrow = (date.today() + timedelta(1)).strftime('%Y-%m-%d')
    today = date.today().strftime('%Y-%m-%d')

    start = request.args.get("start", today)
    end = request.args.get("end", tomorrow)

    user = User.get(username)

    if request.args.get("resolution") == "low":
        result = db.session.query(Activity.other["strava_polyline"])

    elif request.args.get("times"):
        result = db.session.query(Activity.polyline, Activity.elapsed)

    else:
        result = db.session.query(Activity.polyline)

    result = (result.filter(Activity.beginTimestamp.between(start, end))
              .filter_by(user=user)
              ).all()

    # app.logger.info(result)

    def pointsList_gen():
        for pl in result:
            route = polyline.decode(pl[0])
            yield [list(point) for point in route]

    routes = list(pointsList_gen())

    if orientation == "list":
        numpoints = sum(len(route) for route in routes)
        app.logger.info("{} points.".format(numpoints))
        return jsonify(routes)

    flat = [item for sublist in routes for item in sublist]
    return jsonify(flat)


@app.route('/activity_import')
@login_required
def activity_import():
    user = User.get(current_user.name)
    count = int(request.args.get("count", 1))
    service = request.args.get("service")
    detailed = request.args.get("detailed") == "yes"

    if service == "gc":
        import gcimport
        do_import = gcimport.import_activities(db, user, count=count)

    elif service == "strava":
        import stravaimport
        do_import = stravaimport.import_activities(db, user, client,
                                                   limit=count,
                                                   detailed=detailed)

    return Response(do_import, mimetype='text/event-stream')


@app.route('/strava_activities')
@login_required
def strava_activities():
    user = User.get(current_user.name)

    already_got = [int(d[0]) for d in db.session.query(
        Activity.id).filter_by(user=user).all()]

    limit = request.args.get("limit")
    limit = int(limit) if limit else ""

    really = (request.args.get("really") == "yes")

    def do_import():
        count = 0
        yield "importing activities from Strava...\n"
        for a in client.get_activities(limit=limit):
            count += 1

            if a.id in already_got:
                msg = ("{}. activity {} already in database.\n"
                       .format(count, a.id))
                yield msg + "\n"
            else:
                if really:
                    try:
                        streams = client.get_activity_streams(a.id,
                                                              types=['time', 'latlng'])
                    except:
                        yield ("{}. activity {} has no data points\n"
                               .format(count, a.id))
                    else:
                        time = streams["time"].data

                        # eliminate (0,0) points
                        latlng = [(x, y) for x, y in streams["latlng"].data
                                  if (x, y) != (0, 0)]

                        poly = polyline.encode(latlng)
                        other = {"name": a.name,
                                 "strava_polyline": a.map.summary_polyline}
                        params = {"user": user,
                                  "id": a.id,
                                  "other": other,
                                  "beginTimestamp": a.start_date_local,
                                  "elapsed": time,
                                  "polyline": poly,
                                  "source": "ST"}

                        # app.logger.info("params: %s", params)
                        A = Activity(**params)
                        db.session.add(A)
                        db.session.commit()

                        mi = stravalib.unithelper.miles(a.distance)
                        msg = ("[{0.id}] {0.name}: {0.start_date_local}"
                               .format(a))

                        msg = "{}. {}, {}\n".format(count, msg, mi)
                        yield msg

        yield "Done! {} activities imported\n".format(count)

    return Response(do_import(), mimetype='text/event-stream')


@app.route('/admin')
# @login_required
def admin():
    users = User.query.all()
    info = {user.name: {"is_active": user.is_active} for user in users}
    return jsonify(info)

# python heatmapp.py works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
