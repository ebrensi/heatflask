#! usr/bin/env python
from __future__ import unicode_literals

import gevent
from exceptions import StopIteration
from functools import wraps

from flask import Flask, Response, render_template, request, redirect, \
    jsonify, url_for, flash, send_from_directory, render_template_string
import flask_compress
import dateutil.parser
from datetime import datetime
import sys
import logging
import os
import re
import json
import stravalib
import flask_login
from flask_login import current_user, login_user, logout_user, login_required
import webassets
import flask_assets
from flask_analytics import Analytics
from flask_sslify import SSLify
from signal import signal, SIGPIPE, SIG_DFL

app = Flask(__name__)
app.config.from_object(os.environ['APP_SETTINGS'])

app.logger.addHandler(logging.StreamHandler(sys.stdout))
app.logger.setLevel(logging.DEBUG)

sslify = SSLify(app, skips=["webhook_callback"])

# models depend app so we import them afterwards
from models import Users, Activities, EventLogger, Utility, Webhooks,\
    Indexes, db_sql, mongodb, redis

# just do once
# if not redis.get("db-reset"):
#     Activities.init(clear_cache=True)
#     # Indexes.init(clear_cache=True)
#     redis.set("db-reset", 1)
# redis.delete("db-reset")

Analytics(app)

# we bundle javascript and css dependencies to reduce client-side overhead
# es2015 = webassets.filter.get_filter("babel", presets="es2015")
bundles = {
    "main_css": flask_assets.Bundle(
        'css/main.css',
        'css/jquery-ui.css',
        'css/bootstrap.min.css',
        'css/font-awesome.min.css',
        'css/leaflet.css',
        'css/leaflet-sidebar.min.css',
        'css/L.Control.Window.css',
        # 'css/L.Control.Locate.min.css',
        'css/datatables.min.css',
        'css/easy-button.css',
        filters='cssmin',
        output='gen/main.css'
    ),

    "main_js": flask_assets.Bundle(
        'js/jquery-3.2.1.min.js',
        'js/jquery-ui.min.js',
        'js/jquery.knob.min.js',  # Anthony Terrien
        'js/datatables.min.js',
        'js/moment.js',
        'js/leaflet.js',
        'js/leaflet-sidebar.min.js',
        'js/leaflet-heat.js',
        'js/L.DotLayer.js',
        'js/Polyline.encoded.js',
        'js/L.Control.Window.js',
        'js/L.Control.fps.js',
        'js/leaflet-providers.js',
        'js/Leaflet.GoogleMutant.js',
        # 'js/L.Control.Locate.min.js',
        'js/easy-button.js',
        'js/eventsource.js',
        'js/appUtil.js',
        filters=["babel", 'rjsmin'],
        output='gen/main.js'
    ),

    "splash_css": flask_assets.Bundle(
        'css/bootstrap.min.css',
        'css/cover.css',
        filters='cssmin',
        output='gen/splash.css'
    ),

    "basic_table_css": flask_assets.Bundle(
        'css/bootstrap.min.css',
        'css/datatables.min.css',
        'css/table-styling.css',
        filters='cssmin',
        output='gen/basic_table.css'
    ),

    "basic_table_js": flask_assets.Bundle(
        'js/jquery-3.2.1.min.js',
        'js/datatables.min.js',
        'js/appUtil.js',
        filters='rjsmin',
        output='gen/basic_table.js'
    )

}
assets = flask_assets.Environment(app)
assets.register(bundles)


# views will be sent as gzip encoded
flask_compress.Compress(app)


# Flask-login stuff
login_manager = flask_login.LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'splash'


@login_manager.user_loader
def load_user(user_id):
    user = Users.get(user_id)
    return user


def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if (current_user.is_authenticated and
                current_user.is_admin()):
            return f(*args, **kwargs)
        else:
            return login_manager.unauthorized()
    return decorated_function


def admin_or_self_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if current_user.is_authenticated:
            user_identifier = request.view_args.get("username")
            if (current_user.is_admin() or
                (user_identifier == current_user.username) or
                    (user_identifier == str(current_user.id))):
                return f(*args, **kwargs)
            else:
                return login_manager.unauthorized()
    return decorated_function


def log_request_event(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        anon = current_user.is_anonymous
        if anon or (not current_user.is_admin()):
            EventLogger.log_request(request,
                                    cuid="" if anon else current_user.id,
                                    msg=request.url)
        return f(*args, **kwargs)
    return decorated_function


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico')


@app.route('/apple-touch-icon')
def touch():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'Heat.png')


@app.route("/robots.txt")
def robots_txt():
    EventLogger.log_request(request,
                            cuid="bot",
                            msg=request.user_agent.string)
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'robots.txt')


@app.route('/')
def splash():
    if current_user.is_authenticated:
        if hasattr(current_user, "id"):
            return redirect(url_for('main',
                                    username=current_user.id))
        else:
            # If a user is logged in but has no record in our database.
            #  i.e. was deleted.  We direct them to initialize a new account.
            logout_user()
            flash("oops! Please log back in.")

    return render_template("splash.html",
                           next=(request.args.get("next") or
                                 url_for("splash")))


@app.route('/demo')
def demo():
    # https://heatflask.herokuapp.com/15972102?limit=100&info=1&lat=37.8022&lng=-122.2493&zoom=12&heatres=high&flowres=high

    # Last 10 activities
    return redirect(url_for("main",
                            username="15972102",
                            limit="60",
                            # heatres="high",
                            flowres="high",
                            info=1,
                            autozoom=1
                            )
                    )


# Attempt to authorize a user via Oauth(2)
@app.route('/authorize')
@log_request_event
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
        flash("Error: {}".format(request.args.get("error")))

    if current_user.is_anonymous:
        args = {"code": request.args.get("code"),
                "client_id": app.config["STRAVA_CLIENT_ID"],
                "client_secret": app.config["STRAVA_CLIENT_SECRET"]}
        client = stravalib.Client()
        try:
            access_token = client.exchange_code_for_token(**args)

        except Exception as e:
            app.logger.error("authorization error:\n{}".format(e))
            flash(str(e))
            return redirect(state)

        user_data = Users.strava_data_from_token(access_token)
        # app.logger.debug("user data: {}".format(user_data))

        user = Users.add_or_update(**user_data)
        if user:
            # remember=True, for persistent login.
            login_user(user, remember=True)
            app.logger.debug("authenticated {}".format(user))
            EventLogger.new_event(msg="authenticated {}".format(user.id))
        else:
            app.loogger.error("user authenication error")
            flash("There was a problem authorizing user")

    return redirect(request.args.get("state") or
                    url_for("main", username=user.id))


@app.route("/<username>/logout")
@log_request_event
@login_required
def logout(username):
    user = Users.get(username)
    if user == current_user:
        user_id = user.id
        username = user.username
        current_user.uncache()
        logout_user()
        flash("user '{}' ({}) logged out"
              .format(username, user_id))
    return redirect(url_for("splash"))


@app.route("/<username>/delete_index")
@login_required
def delete_index(username):
    if Users.get(username) == current_user:
        if current_user.is_authenticated:
            current_user.delete_index()
        return "index for {} deleted".format(username)
    else:
        return "sorry you can't delete index for {}".format(username)


@app.route("/<username>/delete")
@login_required
def delete(username):
    user = Users.get(username)
    if user == current_user:
        username = user.username
        user_id = user.id
        logout_user()

        # the current user is now logged out
        try:
            user.delete()
        except Exception as e:
            flash(str(e))
        else:
            flash("user '{}' ({}) deleted".format(username, user_id))
            EventLogger.new_event(msg="{} deleted".format(user_id))
        return redirect(url_for("splash"))
    else:
        return "sorry, you cannot do that"


@app.route('/<username>')
def main(username):
    if current_user.is_authenticated:
        # If a user is logged in from a past session but has no record in our
        #  database (was deleted), we log them out and consider them anonymous
        try:
            assert current_user.id
        except AssertionError:
            logout_user()
        else:
            current_user.update_usage()

    # note: 'current_user' is the user that is currently logged in.
    #       'user' is the user we are displaying data for.
    user = Users.get(username)
    if not user:
        flash("user '{}' is not registered with this app"
              .format(username))
        return redirect(url_for('splash'))

    date1 = request.args.get("date1", "")
    date2 = request.args.get("date2", "")
    preset = request.args.get("preset", "")
    limit = request.args.get("limit", "")
    baselayer = request.args.getlist("baselayer")
    ids = request.args.get("id", "")

    if not ids:
        if (not date1) and (not date2):
            if preset:
                try:
                    preset = int(preset)
                except ValueError:
                    flash("'{}' is not a valid preset".format(preset))
                    preset = 7
            elif limit:
                try:
                    limit = int(limit)
                except ValueError:
                    flash("'{}' is not a valid limit".format(limit))
                    limit = 1
            else:
                limit = 10

    flowres = request.args.get("flowres", "")
    heatres = request.args.get("heatres", "")

    # ******  Temporarily force hires for flow *****
    if flowres:
        flowres = "high"

    if (not flowres) and (not heatres):
        flowres = "high"
        # heatres = "high"

    lat = request.args.get("lat")
    lng = request.args.get("lng")
    zoom = request.args.get("zoom")
    autozoom = request.args.get("autozoom") in ["1", "true"]
    info = request.args.get("info") in ["1", "true"]
    if not info:
        info = 1

    if (not lat) or (not lng):
        lat, lng = app.config["MAP_CENTER"]
        zoom = app.config["MAP_ZOOM"]
        autozoom = "1"

    if current_user.is_anonymous or (not current_user.is_admin()):
        EventLogger.new_event(**{
            "ip": request.access_route[-1],
            "cuid": "" if current_user.is_anonymous else current_user.id,
            "agent": vars(request.user_agent),
            "msg": Utility.href(request.url, request.full_path)
        })

    paused = request.args.get("paused") in ["1", "true"]
    return render_template('main.html',
                           user=user,
                           lat=lat,
                           lng=lng,
                           zoom=zoom,
                           ids=ids,
                           preset=preset,
                           date1=date1,
                           date2=date2,
                           limit=limit,
                           heatres=heatres,
                           flowres=flowres,
                           autozoom=autozoom,
                           info=info,
                           paused=paused,
                           baselayer=baselayer
                           )


@app.route('/<username>/getdata')
def getdata(username):
    user = Users.get(username)

    def sse_out(obj=None):
        data = json.dumps(obj) if obj else "done"
        return "data: {}\n\n".format(data)

    def errout(msg):
        # outputs a terminating SSE stream consisting of one error message
        data = {"error": "{}".format(msg)}
        return Response(map(sse_out, [data, None]),
                        mimetype='text/event-stream')

    def cast_int(s):
        try:
            return int(s)
        except ValueError:
            return

    if not user:
        return errout("'{}' is not registered with this app".format(username))

    options = {}
    ids_raw = request.args.get("id")
    if ids_raw:
        non_digit = re.compile("\D")

        ids = [s for s in [cast_int(s) for s in non_digit.split(ids_raw)]
               if s]

        # app.logger.debug("'{}' => {}".format(ids_raw, ids))
        options["activity_ids"] = ids
    else:
        limit = request.args.get("limit")
        if limit:
            options["limit"] = int(limit)
            if limit == 0:
                limit == 1

        date1 = request.args.get("date1")
        date2 = request.args.get("date2")
        if date1 or date2:
            try:
                options["after"] = dateutil.parser.parse(date1)
                if date2:
                    options["before"] = dateutil.parser.parse(date2)
                    assert(options["before"] > options["after"])
            except AssertionError:
                return errout("Invalid Dates")
        elif not limit:
            options["limit"] = 10

    hires = request.args.get("hires") == "true"

    if current_user.is_anonymous or (not current_user.is_admin()):
        event_data = {
            "ip": request.access_route[-1],
            "cuid": "" if current_user.is_anonymous else current_user.id,
            "agent": vars(request.user_agent),
            "msg": Utility.href(request.url, request.full_path)
        }
    else:
        event_data = None

    def sse_iterator(user, options, Q):
        start_time = datetime.utcnow()
        client = user.client()

        err_count_key = "status:{}:{}".format(user.id, start_time)

        streams_out = ["polyline", "time"]
        streams_to_cache = ["polyline", "time"]

        def import_and_queue(client, Q, err_count_key, activity):
            stream_data = Activities.import_streams(
                client, activity["id"], streams_to_cache)

            data = {s: stream_data[s] for s in streams_out + ["error"]
                    if s in stream_data}
            if "error" in data:
                redis.incr(err_count_key)

            data.update(activity)
            # app.logger.debug("imported streams for {}".format(activity["id"]))
            Q.put(sse_out(data))
            gevent.sleep(0)

        pool = gevent.pool.Pool(app.config.get("CONCURRENCY"))
        Q.put(sse_out({"msg": "Retrieving Index..."}))

        activity_data = user.query_index(**options)
        if isinstance(activity_data, list):
            total = len(activity_data)
            ftotal = float(total)
        else:
            total = "?"
            ftotal = None

        count = 0
        imported = 0
        elapsed = 0
        try:
            for activity in activity_data:
                # app.logger.debug("activity {}".format(activity))
                if (("msg" in activity) or
                    ("error" in activity) or
                        ("stop_rendering" in activity)):
                    Q.put(sse_out(activity))

                    if "stop_rendering" in activity:
                        elapsed = datetime.utcnow() - start_time

                if (activity.get("summary_polyline") and
                        activity.get("total_distance", 0) > 1):
                    count += 1
                    activity.update(
                        Activities.atype_properties(activity["type"])
                    )

                    data = {"msg": "activity {0}/{1}...".format(count, total)}
                    if ftotal:
                        data["value"] = round(count / ftotal, 3)

                    Q.put(sse_out(data))

                    if hires:
                        stream_data = Activities.get(activity["id"])

                        if not stream_data:
                            pool.spawn(import_and_queue,
                                       client, Q, err_count_key, activity)
                            imported += 1
                        else:
                            data = {s: stream_data[s] for s in streams_out
                                    if s in stream_data}
                            data.update(activity)
                            # app.logger.debug("sending {}".format(data))
                            Q.put(sse_out(data))
                            gevent.sleep(0)
                    else:
                        Q.put(sse_out(activity))
                        gevent.sleep(0)
        except Exception as e:
            Q.put(sse_out({"error": str(e)}))

        pool.join(timeout=10)  # make sure all spawned jobs are done
        Q.put(sse_out())

        # We must put a StopIteration here to close the (http?) connection,
        # otherise we'll get an idle connection error from Heroku
        Q.put(StopIteration)

        if not elapsed:
            elapsed = datetime.utcnow() - start_time
        if event_data:
            event_data["msg"] += (": elapsed={} sec, count={}, imported {}"
                                  .format(round(elapsed.total_seconds(), 3),
                                          count,
                                          imported))
            err_count = redis.get(err_count_key)
            if err_count:
                event_data["msg"] += ", errors={}".format(err_count)
                redis.delete(err_count_key)
            EventLogger.new_event(**event_data)

    Q = gevent.queue.Queue()
    gevent.spawn(sse_iterator, user, options, Q)
    return Response(Q, mimetype='text/event-stream')


# creates a SSE stream of current.user's activities, using the Strava API
# arguments
@app.route('/<username>/activities_sse')
@admin_or_self_required
def activity_stream(username):
    user = Users.get(username)
    options = {"limit": 10000}
    if "id" in request.args:
        options["activity_ids"] = request.args.get("id")
    else:
        if "before" in request.args:
            options["before"] = dateutil.parser.parse(
                request.args.get("before"))
        if "after" in request.args:
            options["after"] = dateutil.parser.parse(
                request.args.get("after"))
        if "limit" in request.args:
            options["limit"] = int(request.args.get("limit"))

    def boo():
        for a in user.query_index(**options):
            if "id" in a:
                yield "data: {}\n\n".format(json.dumps(a))
        yield "data: done\n\n"

    return Response(boo(), mimetype='text/event-stream')


@app.route('/<username>/activities')
@log_request_event
@admin_or_self_required
def activities(username):
    user = Users.get(username)
    if request.args.get("rebuild"):
        user.delete_index()
    return render_template("activities.html",
                           user=user)


@app.route('/<username>/update_info')
@log_request_event
@admin_or_self_required
def update_share_status(username):
    status = request.args.get("status")
    user = Users.get(username)

    # set user's share status
    user.share_profile = (status == "public")
    db_sql.session.commit()
    user.cache()

    app.logger.info("share status for {} set to {}"
                    .format(user, status))

    return jsonify(user=user.id, share=user.share_profile)


# ---- Shared views ----
@app.route('/public/directory')
@log_request_event
def public_directory():
    fields = ["id", "dt_last_active", "username", "profile",
              "city", "state", "country"]
    info = Users.dump(fields, share_profile=True)
    return render_template("directory.html", data=info)


# ---- User admin stuff ----
@app.route('/users')
@log_request_event
@admin_required
def users():
    fields = ["id", "dt_last_active", "firstname", "lastname", "profile",
              "app_activity_count", "city", "state", "country", "email"]
    info = Users.dump(fields)
    return render_template("admin.html", data=info)


@app.route('/users/<username>')
@log_request_event
@admin_or_self_required
def user_profile(username):
    user = Users.get(username)
    return jsonify(user.info())


@app.route('/users/backup')
@log_request_event
@admin_required
def users_backup():
    return jsonify(Users.backup())


@app.route('/users/restore')
@log_request_event
@admin_required
def users_restore():
    return jsonify(Users.restore())


@app.route('/app/info')
@admin_required
def app_info():
    info = {
        "config": str(app.config),
        "mongodb": mongodb.command("dbstats"),
        "activities": mongodb.command("collstats", "activities"),
        "indexes": mongodb.command("collstats", "indexes")
    }
    return jsonify(info)


@app.route('/app/dbinit')
@admin_required
def app_init():
    info = {
        Activities.init(),
        Indexes.init()
    }
    return jsonify(info)


# ---- Event log stuff ----
@app.route('/history')
@log_request_event
@admin_required
def event_history():
    events = EventLogger.get_log(int(request.args.get("n", 100)))
    if events:
        return render_template("history.html", events=events)
    return "No history"


@app.route('/history/raw')
@log_request_event
@admin_required
def event_history_raw():
    return jsonify(EventLogger.get_log())


@app.route('/history/<event_id>')
@log_request_event
@admin_required
def logged_event(event_id):
    return jsonify(EventLogger.get_event(event_id))


@app.route('/history/init')
@log_request_event
@admin_required
def event_history_init():
    EventLogger.init()
    return redirect(url_for("event_history"))


# Stuff for subscription to Strava webhooks
@app.route('/subscription/<operation>')
@admin_required
def subscription_endpoint(operation):
    if operation == "create":
        return jsonify(
            Webhooks.create(url_for("webhook_callback", _external=True))
        )

    elif operation == "list":
        return jsonify({"subscriptions": Webhooks.list()})

    elif operation == "delete":
        result = Webhooks.delete(
            subscription_id=request.args.get("id"),
            delete_collection=request.args.get("reset")
        )
        return jsonify(result)

    elif operation == "updates":
        return render_template("webhooks.html",
                               events=list(
                                   Webhooks.iter_updates(
                                       int(request.args.get("n", 100)))
                               ))


@app.route('/webhook_callback', methods=["GET", "POST"])
def webhook_callback():

    if request.method == 'GET':
        if request.args.get("hub.challenge"):
            app.logger.debug(
                "subscription callback with {}".format(request.args))
            cb = Webhooks.handle_subscription_callback(request.args)
            app.logger.debug(
                "handle_subscription_callback returns {}".format(cb))
            return jsonify(cb)

    elif request.method == 'POST':
        update_raw = request.get_json(force=True)
        Webhooks.handle_update_callback(update_raw)
        return "success"


# makes python ignore sigpipe and prevents broken pipe exception when client
#  aborts an SSE stream
signal(SIGPIPE, SIG_DFL)

# python heatmapp.py works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
