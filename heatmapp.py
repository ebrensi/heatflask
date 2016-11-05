#! usr/bin/env python
from __future__ import unicode_literals

from flask import Flask, Response, render_template, request, redirect, \
    jsonify, url_for, flash, send_from_directory
import flask_compress

from datetime import datetime, timedelta
import dateutil.parser
import os
import json
import stravalib
import polyline
import flask_login
from flask_login import current_user, login_user, logout_user, login_required
import flask_assets
from flask_analytics import Analytics
import flask_caching
from celery import Celery
from signal import signal, SIGPIPE, SIG_DFL
from sqlalchemy import or_, and_
# makes python ignore sigpipe? prevents broken pipe exception when client
#  aborts an SSE stream
signal(SIGPIPE, SIG_DFL)

app = Flask(__name__)
app.config.from_object(os.environ['APP_SETTINGS'])

celery = Celery(app.name,
                broker=app.config['CELERY_BROKER_URL'],
                backend=app.config['CELERY_RESULT_BACKEND'])

# set up short-term fast caching support
cache = flask_caching.Cache(app)

# models depend on cache and app so we import them afterwards
from models import User, Activity, db


Analytics(app)

# we bundle javascript and css dependencies to reduce client-side overhead
bundles = {
    "index_css": flask_assets.Bundle('css/jquery-ui.css',
                                     'css/bootstrap.min.css',
                                     'css/font-awesome.min.css',
                                     'css/leaflet.css',
                                     'css/leaflet-sidebar.css',
                                     'css/L.Control.Window.css',
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
                                    'js/L.Control.Window.js',
                                    'js/leaflet-providers.js',
                                    'js/Leaflet.GoogleMutant.js',
                                    filters='rjsmin',
                                    output='gen/index.js')

}
assets = flask_assets.Environment(app)
assets.register(bundles)


# views will be sent as gzip encoded
flask_compress.Compress(app)


# Flask-login stuff
login_manager = flask_login.LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'nothing'


@login_manager.user_loader
def load_user(user_id):
    return User.get(user_id)


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico')


@app.route('/apple-touch-icon')
def touch():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'Heat.png')


@app.route('/')
def nothing():
    if current_user.is_authenticated:
        try:
            assert current_user.strava_id
        except:
            # If a user is logged in but has no record in our database.
            #  i.e. was deleted.  We direct them to initialize a new account.
            logout_user()
            flash("oops! Please log back in.")
        else:
            return redirect(url_for('index',
                                    username=current_user.strava_id))

    return render_template("splash.html")


@app.route('/demo')
def demo():
    return redirect(url_for("index",
                            username="15972102",
                            preset="7",
                            heatres="high",
                            flowres="high",
                            autozoom=1,
                            # baselayer=["OpenTopoMap"]
                            )
                    )


# Attempt to authorize a user via Oauth(2)
@app.route('/authorize')
def authorize():
    state = request.args.get("state")
    redirect_uri = url_for('auth_callback', _external=True)

    client = stravalib.Client()
    auth_url = client.authorization_url(
        client_id=app.config["STRAVA_CLIENT_ID"],
        redirect_uri=redirect_uri,
        # approval_prompt="force",
        state=state
    )
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

        user = User.from_access_token(access_token)

        # remember=True, for persistent login.
        login_user(user, remember=True)

    return redirect(request.args.get("state") or
                    url_for("index", username=current_user.strava_id))


@app.route("/logout")
@login_required
def logout():
    if current_user.is_authenticated:
        user_id = current_user.strava_id
        username = current_user.username
        logout_user()
        flash("user '{}' ({}) logged out"
              .format(username, user_id))
    return redirect(request.args.get("next") or url_for("nothing"))


@app.route("/delete")
@login_required
def delete():
    if current_user.is_authenticated:
        username = current_user.username
        user_id = current_user.strava_id
        logout_user()

        # the current user is now logged out
        user = User.get(user_id)
        try:
            user.delete()
        except Exception as e:
            flash(str(e))
        else:
            flash("user '{}' ({}) deleted".format(username, user_id))
    return redirect(url_for("nothing"))


@app.route('/<username>')
def index(username):
    if current_user.is_authenticated:
        # If a user is logged in from a past session but has no record in our
        #  database (was deleted), we log them out and consider them anonymous
        try:
            assert current_user.strava_id
        except:
            logout_user()
        else:
            current_user.dt_last_active = datetime.utcnow()
            current_user.app_activity_count += 1
            db.session.commit()

    # note: 'current_user' is the user that is currently logged in.
    #       'user' is the user we are displaying data for.
    user = User.get(username)
    if not user:
        flash("user '{}' is not registered with this app"
              .format(username))
        return redirect(url_for('nothing'))

    date1 = request.args.get("date1")
    date2 = request.args.get("date2")
    preset = request.args.get("preset")
    limit = request.args.get("limit")
    autozoom = request.args.get("autozoom", "")
    baselayer = request.args.getlist("baselayer")

    if (not date1) or (not date2):
        if preset:
            preset = (
                preset
                if (preset in app.config["DATE_RANGE_PRESETS"]) else "7"
            )
        elif not limit:
            preset = "7"
            autozoom = "1"

    flowres = request.args.get("flowres", "")
    heatres = request.args.get("heatres", "")
    if (not flowres) and (not heatres):
        flowres = "low"
        heatres = "low"

    default_center = app.config["MAP_CENTER"]
    lat = request.args.get("lat") or default_center[0]
    lng = request.args.get("lng") or default_center[1]
    zoom = request.args.get("zoom") or app.config["MAP_ZOOM"]

    return render_template('index.html',
                           user=user,
                           lat=lat,
                           lng=lng,
                           zoom=zoom,
                           preset=preset,
                           date1=date1,
                           date2=date2,
                           limit=limit,
                           heatres=heatres,
                           flowres=flowres,
                           autozoom=autozoom,
                           baselayer=baselayer
                           )


@app.route('/<username>/getdata')
def getdata(username):
    user = User.get(username)

    def errout(msg):
        # outputs a terminating SSE stream consisting of one error message
        data = {"error": "{}".format(msg)}

        def boo():
            yield "data: {}\n\n".format(json.dumps(data))
            yield "data: done\n\n"
        return Response(boo(), mimetype='text/event-stream')

    if not user:
        return errout("'{}' is not registered with this app".format(username))

    # Only allow long (database) caching if this is the current user
    #  accessing his/her own records
    try:
        db_write = current_user.strava_id == user.strava_id
    except:
        db_write = False

    options = {}
    if "id" in request.args:
        options["activity_ids"] = request.args.getlist("id")

    else:
        limit = request.args.get("limit")
        if "limit" in request.args:
            options["limit"] = int(limit)

        date1 = request.args.get("date1")
        date2 = request.args.get("date2")
        if date1 or date2:
            try:
                options["after"] = dateutil.parser.parse(date1)
                if date2:
                    options["before"] = dateutil.parser.parse(date2)
                    assert(options["before"] > options["after"])
            except:
                return errout("Invalid Dates")
        elif not limit:
            options["limit"] = 10

    # options = {"activity_ids": [730239033, 97090517]}
    lores = request.args.get("lores") == "true"
    hires = request.args.get("hires") == "true"
    durations = request.args.get("durations")

    def path_color(activity_type):
        color_list = [color for color, activity_types
                      in app.config["ANTPATH_ACTIVITY_COLORS"].items()
                      if activity_type.lower() in activity_types]

        return color_list[0] if color_list else ""

    token = user.strava_access_token
    client = stravalib.Client(access_token=token)

    def boo(db_write=db_write):
        cache_timeout = app.config["CACHE_ACTIVITIES_TIMEOUT"]
        for activity in activity_summaries(user, **options):
            if ("error" not in activity) and activity.get("summary_polyline"):
                a_id = activity["id"]

                if hires:
                    # attempt to get activity hires data from the fast-cache
                    cached_hires_data = cache.get(str(a_id))
                    if cached_hires_data:
                        activity.update(cached_hires_data)
                        app.logger.info("got cached data for {}".format(a_id))

                    else:
                        # Attempt to retreive activity from database
                        A = Activity.query.get(a_id)

                        if not A:
                            data = {
                                "msg": "importing {} from Strava".format(a_id)
                            }
                            yield "data: {}\n\n".format(json.dumps(data))

                            # activity data isn't cached or in the database so
                            #  request it from Strava
                            stream_names = ['time', 'latlng']

                            try:
                                streams = (
                                    client
                                    .get_activity_streams(activity["id"],
                                                          types=stream_names)
                                )
                            except Exception as e:
                                app.logger.info(
                                    "activity: {}\n{}".format(activity, e))
                                break
                            else:
                                app.logger.info(
                                    "imported streams for: {}".format(a_id))

                                activity_streams = {name: streams[name].data
                                                    for name in streams}

                                # replace latlng array with polyline
                                # representation in activity_streams
                                if "latlng" in activity_streams:
                                    activity_streams["polyline"] = (
                                        polyline.encode(
                                            activity_streams.pop('latlng'))
                                    )

                                activity_streams.update(activity)

                                # we need to get rid of path_color in case
                                #  activity object came from the cache
                                activity_streams.pop("path_color", None)

                                A = Activity(**activity_streams)

                                if db_write:
                                    # write this activity to the database
                                    A.user = user
                                    A.dt_cached = datetime.utcnow()
                                    A.access_count = 0
                                    db.session.add(A)
                                    db.session.commit()

                        # Now A is an Activity object, either from the database
                        #  or directly from Strava,
                        #   and activity is a summary dictionary

                        hires_data = {
                            "polyline": A.polyline
                        }

                        if durations and A.time:
                            t = A.time
                            hires_data["durations"] = [
                                (b - a) for a, b in zip(t, t[1:])
                            ] + [0]

                        activity.update(hires_data)

                        # fast-cache the hires_data
                        if cache_timeout:
                            cache.set(str(a_id), hires_data, cache_timeout)
                            app.logger.info(
                                "cached {} for {} seconds".format(a_id, cache_timeout))

                # Now activity is a dictionary representing an activity
                #  with hi-res streams
                activity["path_color"] = path_color(activity["type"])

            yield "data: {}\n\n".format(json.dumps(activity))
        yield "data: done\n\n"

    return Response(boo(), mimetype='text/event-stream')


def activity_summaries(user, activity_ids=None, **kwargs):
    cache_timeout = app.config["CACHE_SUMMARIES_TIMEOUT"]
    unique = "{},{},{}".format(user.strava_id, activity_ids, kwargs)
    key = str(hash(unique))

    summaries = cache.get(key)
    if summaries:
        app.logger.info("got cache key '{}'".format(unique))
        for summary in summaries:
            yield summary
    else:
        token = user.strava_access_token
        client = stravalib.Client(access_token=token)
        summaries = []
        if activity_ids:
            activities = (client.get_activity(int(id)) for id in activity_ids)
        else:
            activities = client.get_activities(**kwargs)

        try:
            for a in activities:
                data = {
                    "id": a.id,
                    "athlete_id": a.athlete.id,
                    "name": a.name,
                    "type": a.type,
                    "summary_polyline": a.map.summary_polyline,
                    "beginTimestamp": str(a.start_date_local),
                    "total_distance": float(a.distance),
                    "elapsed_time": int(a.elapsed_time.total_seconds())
                }
                summaries.append(data)
                yield data
        except Exception as e:
            yield {"error": str(e)}
        else:
            cache.set(key, summaries, cache_timeout)
            app.logger.info("set cache key '{}'".format(unique))


# creates a SSE stream of current.user's activities, using the Strava API
# arguments
@app.route('/activities_sse')
@login_required
def activities_sse():
    # user = User.get(current_user.strava_id)
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
        for a in activity_summaries(current_user, **options):
            a["cached"] = "yes" if Activity.query.get(a['id']) else "no"
            a["msg"] = "[{id}] {beginTimestamp} '{name}'".format(**a)
            yield "data: {}\n\n".format(json.dumps(a))
        yield "data: done\n\n"

    return Response(boo(), mimetype='text/event-stream')


@app.route('/activity_select')
@login_required
def activity_select():
    return render_template("activities.html",
                           limit=request.args.get("limit"))


@app.route('/retrieve_list', methods=['POST'])
def retrieve_list():
    data = {
        "import": request.form.getlist("to")
    }

    return jsonify(data)


@app.route('/old')
@login_required
def old():
    if current_user.strava_id not in app.config["ADMIN"]:
        return jsonify({"error": "oops.  Can't do this."})

    d = int(request.args.get("days", 7))
    old_activities = purge(d)

    msg = ("purged {} of {} activities over {} days old"
           .format(old_activities.count(),
                   Activity.query.count(),
                   d
                   )
           )
    old_activities.delete()
    return msg


# @celery.task()
def purge(days):
    now = datetime.utcnow()
    past_time = now - timedelta(days=days)
    # app.logger.info("now: {}, {} days ago: {}".format(now, days, past_time))

    old_activities = (
        Activity.query
        .with_entities(Activity.id,
                       Activity.dt_last_accessed,
                       Activity.dt_cached)
        .filter(
            or_(
                Activity.dt_last_accessed < past_time,
                and_(
                    Activity.dt_cached < past_time,
                    Activity.dt_last_accessed == None
                )

            )
        )
    )

    return old_activities


@app.route('/users')
@login_required
def admin():
    info = {
        user.strava_id: {
            "cached": user.activities.count(),
            "dt_last_active": user.dt_last_active,
            "app_activity_count": user.app_activity_count,
            "username": user.username
        }
        for user in User.query}
    return jsonify(info)


#  Webhook Subscription stuff.  Only admin users can access this
@app.route('/subscription/<operation>')
@login_required
def subscription(operation):
    if current_user.strava_id not in app.config["ADMIN"]:
        return jsonify({"error": "oops.  Can't do this."})

    client = stravalib.Client()
    credentials = {
        "client_id": app.config["STRAVA_CLIENT_ID"],
        "client_secret": app.config["STRAVA_CLIENT_SECRET"]
    }
    if operation == "create":
        try:
            sub = client.create_subscription(
                callback_url=url_for("webhook_callback", _external=True),
                **credentials
            )
        except Exception as e:
            return jsonify({"error": str(e)})

        return jsonify({"created": str(sub)})

    elif operation == "list":
        subs = client.list_subscriptions(**credentials)
        return jsonify([str(sub) for sub in subs])

    elif operation == "delete":
        try:
            subscription_id = int(request.args.get("id"))
        except:
            response = {"error": "bad or missing subscription id"}
        else:
            try:
                # if successful this will be null
                response = client.delete_subscription(subscription_id,
                                                      **credentials)
            except Exception as e:
                response = {"error": str(e)}

        return jsonify(response)


@app.route('/webhook_callback', methods=["GET", "POST"])
def webhook_callback():
    client = stravalib.Client()

    if request.method == 'GET':
        return client.handle_subscription_callback(request.args)

    elif request.method == 'POST':
        update_raw = request.get_json(force=True)
        app.logger.info("subscription: ".format(update_raw))
        update = client.handle_subscription_update(update_raw)
        handle_update.delay(update)
        return "success"


@celery.task()
def handle_update(update):
    pass


@celery.task()
def add_together(a, b):
    return a + b


@app.route('/add/<a>/<b>')
def add(a, b):
    return str(add_together.delay(int(a), int(b)).wait())


# python heatmapp.py works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
