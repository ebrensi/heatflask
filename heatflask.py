#! usr/bin/env python
from __future__ import unicode_literals

import gevent
from exceptions import StopIteration
from functools import wraps

from flask import (
    Flask, Response, render_template, request, redirect, jsonify, url_for,
    flash, send_from_directory, render_template_string
)

import flask_compress
from datetime import datetime
import sys
import logging
import os
import json
import itertools
import base36
import requests
import stravalib
import flask_login
from flask_login import current_user, login_user, logout_user, login_required
import flask_assets
from flask_analytics import Analytics
from flask_sslify import SSLify
from flask_sockets import Sockets
from signal import signal, SIGPIPE, SIG_DFL

app = Flask(__name__)
app.config.from_object(os.environ['APP_SETTINGS'])
log = app.logger

log.propagate = False

# log.addHandler(logging.StreamHandler(sys.stdout))
log.setLevel(logging.DEBUG)

STREAMS_OUT = ["polyline", "time"]
STREAMS_TO_CACHE = ["polyline", "time"]


sslify = SSLify(app, skips=["webhook_callback"])

# models depend app so we import them afterwards
from models import (
    Users, Activities, EventLogger, Utility, Webhooks, Index, Payments,
    db_sql, mongodb, redis
)

# initialize MongoDB collections if necessary
collections = mongodb.collection_names()

if "history" not in collections:
    EventLogger.init()

if Activities.name not in collections:
    Activities.init_db()
else:
    Activities.update_ttl()

if Index.name not in collections:
    Index.init_db()
else:
    Index.update_ttl()

if Payments.name not in collections:
    Payments.init_db()


Analytics(app)


def parseInt(s):
    try:
        return int(s)
    except ValueError:
        return


# we bundle javascript and css dependencies to reduce client-side overhead
# app.config["CLOSURE_COMPRESSOR_OPTIMIZATION"] = "WHITESPACE_ONLY"
bundles = {
    "dependencies_css": flask_assets.Bundle(
        'css/main.css',
        'css/jquery-ui.css',
        'css/bootstrap.min.css',
        'css/font-awesome.min.css',
        'css/leaflet.css',
        'css/leaflet-sidebar.min.css',
        'css/L.Control.Window.css',
        'css/leaflet-areaselect.css',
        'css/datatables.min.css',
        'css/easy-button.css',
        filters='cssmin',
        output='gen/main.css'
    ),
    "dependencies_js": flask_assets.Bundle(
        # minified dependencies
        flask_assets.Bundle(
            'js/jquery-3.2.1.min.js',
            'js/jquery-ui.min.js',
            'js/jquery.knob.min.js',  # Anthony Terrien
            'js/datatables.min.js',
            'js/leaflet.js',
            'js/leaflet-sidebar.min.js',
            'js/download.min.js',
            'js/gif2.js',  # Johan Nordberg: http://jnordberg.github.io/gif.js/
            output="gen/pre-compiled-dependencies.js"
        ),
        # un-minified dependencies
        flask_assets.Bundle(
            'js/eventsource.js',
            'js/moment.js',
            'js/Polyline.encoded.js',
            'js/L.Control.Window.js',
            'js/leaflet-providers.js',
            'js/leaflet-image.js',  # Tom MacWright: https://github.com/mapbox/leaflet-image
            'js/leaflet-areaselect.js',
            'js/easy-button.js',
            filters=["babel", "rjsmin"],
            output="gen/build/non-compiled-dependencies.js"
        ),
        output='gen/dependencies.js'
    ),

    "gifjs_webworker_js": flask_assets.Bundle(
        'js/gif.worker.js',
        output="gen/gif.worker.js"
    ),

    "app_specific_js": flask_assets.Bundle(  # Heatflask-specific code
        'js/L.Control.fps.js',
        'js/appUtil.js',
        'js/L.SwipeSelect.js',
        'js/L.BoxHook.js',
        '../heatflask.js',
        '../DotLayer.js',
        filters=["babel", 'rjsmin'],
        output="gen/app-specific.js"
    ),

    "splash_css": flask_assets.Bundle(
        'css/bootstrap.min.css',
        'css/cover.css',
        filters='cssmin',
        output='gen/splash.css'
    ),

    "basic_table_css": flask_assets.Bundle(
        'css/bootstrap.min.css',
        'css/font-awesome.min.css',
        'css/datatables.min.css',
        'css/table-styling.css',
        filters='cssmin',
        output='gen/basic_table.css'
    ),

    "basic_table_js": flask_assets.Bundle(
        'js/jquery-3.2.1.min.js',
        'js/datatables.min.js',
        'js/appUtil.js',
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


# Websockets
sockets = Sockets(app)

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
        event = {"msg": request.url}

        if not current_user.is_anonymous:
            if not current_user.is_admin():
                event.update({
                    "cuid": current_user.id,
                    "profile": current_user.profile
                })
            else:
                # if current user is admin we don't bother logging this event
                return f(*args, **kwargs)
                
        # If the user is anonymous or a regular user, we log the event
        EventLogger.log_request(request, **event)
        return f(*args, **kwargs)
    return decorated_function


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico')


@app.route('/avatar/athlete/medium.png')
def anon_photo():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'anon-photo.jpg')


@app.route('/apple-touch-icon')
def touch():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'logo.png')


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


DEMOS = {
    "portland_6_2017": {
        "username": "15972102",
        "after": "2017-06-30",
        "before": "2017-07-08",
        "lat": "41.476",
        "lng": "-119.290",
        "zoom": "6",
        "c1": "859579",
        "c2": "169",
        "sz": "4",
        "baselayer": "Google.Terrain"
    },

    "last60activities": {
        "username": "15972102",
        "limit": "60"
    }
}


@app.route('/demos/<demo_key>')
def demos(demo_key):
    # Last 60 activities
    params = DEMOS.get(demo_key)
    if not params:
        return 'demo "{}" does not exist'.format(demo_key)

    return redirect(url_for("main", **params))


@app.route('/demo')
def demo():
    # Last 60 activities
    return redirect(url_for("demos", demo_key="last60activities"))


# Attempt to authorize a user via Oauth(2)
@app.route('/authorize')
# @log_request_event
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
            log.error("authorization error:\n{}".format(e))
            flash(str(e))
            return redirect(state)

        user_data = Users.strava_data_from_token(access_token)
        # log.debug("user data: {}".format(user_data))

        try:
            user = Users.add_or_update(**user_data)
        except Exception as e:
            log.exception(e)
            user = None
        if user:
            # remember=True, for persistent login.
            login_user(user, remember=True)
            # log.debug("authenticated {}".format(user))
            EventLogger.new_event(msg="authenticated {}".format(user.id))
        else:
            log.error("user authenication error")
            flash("There was a problem authorizing user")

    return redirect(request.args.get("state") or
                    url_for("main", username=user.id))


@app.route("/<username>/logout")
@admin_or_self_required
@login_required
def logout(username):
    user = Users.get(username)
    user_id = user.id
    username = user.username
    current_user.uncache()
    logout_user()
    flash("user '{}' ({}) logged out"
          .format(username, user_id))
    return redirect(url_for("splash"))


@app.route("/<username>/delete_index")
@admin_or_self_required
def delete_index(username):
    user = Users.get(username)
    if user:
        current_user.delete_index()
        EventLogger.new_event(msg="index for {} deleted".format(user.id))
        return "index for {} deleted".format(username)
    else:
        return "no user {}".format(username)


@app.route("/<username>/delete")
@admin_or_self_required
def delete(username):
    user = Users.get(username)
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

    user = None
    key = username if redis.get("Q:" + username) else ""

    if not key:
        # note: 'current_user' is the user that is currently logged in.
        #       'user' is the user we are displaying data for.
        user = Users.get(username)
        if not user:
            flash("user '{}' is not registered with this app"
                  .format(username))
            return redirect(url_for('splash'))

    date1 = request.args.get("date1") or request.args.get("after", "")
    date2 = request.args.get("date2") or request.args.get("before", "")
    preset = request.args.get("preset", "")
    limit = request.args.get("limit", "")
    baselayer = request.args.getlist("baselayer")
    ids = request.args.get("id", "")
    group = "multi" if key else request.args.get("group", "")

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
            elif group:
                pass
            else:
                limit = 10

    c1 = request.args.get("c1", "")
    c2 = request.args.get("c2", "")
    sz = request.args.get("sz", "")

    lat = request.args.get("lat")
    lng = request.args.get("lng")
    zoom = request.args.get("zoom")
    autozoom = request.args.get("autozoom") in ["1", "true"]

    if (not lat) or (not lng):
        lat, lng = app.config["MAP_CENTER"]
        zoom = app.config["MAP_ZOOM"]
        autozoom = "1"

    if current_user.is_anonymous or (not current_user.is_admin()):
        event = {
            "ip": request.access_route[-1],
            "agent": vars(request.user_agent),
            "msg": Utility.href(request.url, request.full_path)
        }

        if not current_user.is_anonymous:
            event.update({
                "profile": current_user.profile,
                "cuid": current_user.id
            })

        EventLogger.new_event(**event)

    paused = request.args.get("paused") in ["1", "true"]
    return render_template(
        'main.html',
        user=user,
        lat=lat,
        lng=lng,
        zoom=zoom,
        ids=ids,
        group=group,
        key=key,
        preset=preset,
        date1=date1,
        date2=date2,
        limit=limit,
        autozoom=autozoom,
        paused=paused,
        baselayer=baselayer,
        c1=c1,
        c2=c2,
        sz=sz
    )


@app.route('/<username>/group_stream/<activity_id>')
def group_stream(username, activity_id):
    log.debug("getting activities grouped with {}:{}".format(username, activity_id))

    def go(user, pool, out_queue):
        with app.app_context():
            user.related_activities(activity_id, streams=True,
                                    pool=pool, out_queue=out_queue)
            pool.join()
            out_queue.put(None)
            out_queue.put(StopIteration)
    user = Users.get(username)
    pool = gevent.pool.Pool(app.config.get("CONCURRENCY"))
    out_queue = gevent.queue.Queue()
    gevent.spawn(go, user, pool, out_queue)
    gevent.sleep(0)
    return Response((sse_out(a) if a else sse_out() for a in out_queue),
                    mimetype='text/event-stream')

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

    log.info("share status for {} set to {}"
                    .format(user, status))

    return jsonify(user=user.id, share=user.share_profile)


def toObj(string):
    try:
        return json.loads(string)
    except ValueError:
        return string

# We send and receive json objects (dictionaries) encoded as strings
def sendObj(ws, obj):
    if not ws:
        return

    try:
        s = json.dumps(obj)
    except Exception as e:
        log.error(e)
        return

    try:
        ws.send(s)
    except Exception as e:
        log.error(e)
        try:
            ws.close()
        except:
            pass
        return

    return True

def receiveObj(ws):
    try:
        s = ws.receive()
        obj = json.loads(s)
    except TypeError:
        return
    except Exception as e:
        log.exception(e)
        return
    else:
        return obj

def socket_name(ws):
    env = ws.environ
    # return env

    return "{REMOTE_ADDR}:{REMOTE_PORT}".format(**env)


@sockets.route('/data_socket')
def data_socket(ws):
    name = socket_name(ws)
    # log.debug("socket {} OPEN".format(name))
    while not ws.closed:
        msg = receiveObj(ws)
        if msg:
            if "query" in msg:
                # log.debug("Received query: {}".format(msg["query"]))
                # sendObj(ws, {"msg": "sending query {}...".format(msg["query"])})
                for a in Activities.query(msg["query"]):
                    sendObj(ws, a)
            else:
                log.debug("{} says {}".format(name, msg))

    # log.debug("socket {} CLOSED".format(name))


def new_id():
    ids = mongodb.queries.distinct("_id")
    ids.sort()
    _id = None

    for a, b in itertools.izip(ids, ids[1:]):
        if b - a > 1:
            _id = a + 1
            break
    if not _id:
        _id = b + 1

    return _id


# ---- Endpoints to cache and retrieve query urls that might be long
#   we store them as integer ids and the key for access is that integer
#   in base-36
@app.route('/cache', methods=["GET", "POST"])
def cache_put(query_key):
    obj = {}
    if request.method == 'GET':
        obj = {k: toObj(request.args.get(k))
               for k in request.args if toObj(request.args.get(k))}

    if request.method == 'POST':
        obj = request.get_json(force=True)

    if not obj:
        return ""

    h = hash(obj)

    doc = mongodb.queries.find_one(
        {"hash": h}
    )

    # if a record exists with this hash already then return
    #  the id for that record
    if doc:
        _id = doc["_id"]

    else:
        _id = new_id(obj)
        obj.update({
            "_id": _id,
            "hash": h,
            "ts": datetime.utcnow()
        })

        try:
            mongodb.queries.update_one(
                {"_id": _id},
                {"$set": obj},
                upsert=True
            )

        except Exception as e:
            log.debug("error writing query {} to MongoDB: {}"
                             .format(_id, e))
            return

    return jsonify(base36.dumps(_id))


@app.route('/cache/<key>')
def cache_retrieve(key):
    result = mongodb.queries.find_one({"_id": key})
    if not result:
        return
    else:
        del result["_id"]
        del result["hash"]
        del result["ts"]
        username = result["username"]
        del result["username"]

        return redirect(url_for("main", username=username, **result))


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
              "app_activity_count", "city", "state", "country", "email",
              "dt_indexed"]
    info = Users.dump(fields)
    return render_template("admin.html", data=info)


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


@app.route('/users/update')
@admin_required
def users_update():
    delete = request.args.get("delete")
    update = request.args.get("update")

    iterator = Users.triage(test_run=not delete, update=update)
    return Response(iterator, mimetype='text/event-stream')


@app.route('/users/<username>')
@log_request_event
@admin_or_self_required
def user_profile(username):
    user = Users.get(username)
    output = user.info() if user else {}
    return jsonify(output)


# ---- App maintenance stuff -----
@app.route('/app/info')
@admin_required
def app_info():
    info = {
        "config": str(app.config),
        "mongodb": mongodb.command("dbstats"),
        Activities.name: mongodb.command("collstats", Activities.name),
        Index.name: mongodb.command("collstats", Index.name),
        Payments.name: mongodb.command("collstats", Payments.name)
    }
    return jsonify(info)


@app.route('/app/dbinit')
@admin_required
def app_init():
    info = {
        Activities.init_db(),
        Index.init_db(),
        Payments.init_db()
    }
    return "Activities, Index, Payments databases re-initialized"


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


# IP lookup url
@app.route('/ip_lookup')
@admin_required
def ip_lookup():
    ip = request.args.get("ip")
    if not ip:
        return

    key = "IP:{}".format(ip)
    cached = redis.get(key)

    if cached:
        info = json.loads(cached)
        # log.debug("got cached info for {}".format(ip))

    else:
        url = (
            "http://api.ipstack.com/{}?access_key={}"
            .format(ip, os.environ["IPSTACK_ACCESS_KEY"])
        )
        resp = requests.get(url)
        info = json.dumps(resp.json()) if resp else ""
        if info:
            redis.setex(key, info, app.config["CACHE_IP_INFO_TIMEOUT"])

    return jsonify(info)


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
            log.debug(
                "subscription callback with {}".format(request.args))
            cb = Webhooks.handle_subscription_callback(request.args)
            log.debug(
                "handle_subscription_callback returns {}".format(cb))
            return jsonify(cb)

    elif request.method == 'POST':
        update_raw = request.get_json(force=True)
        Webhooks.handle_update_callback(update_raw)
        return "success"


# SSE (Server-Side Events) stuff
def sse_out(obj=None):
    data = json.dumps(obj) if obj else "done"
    return "data: {}\n\n".format(data)


def errout(msg):
    # outputs a terminating SSE stream consisting of one error message
    data = {"error": "{}".format(msg)}
    return Response(map(sse_out, [data, None]),
                    mimetype='text/event-stream')


# makes python ignore sigpipe and prevents broken pipe exception when client
#  aborts an SSE stream
signal(SIGPIPE, SIG_DFL)

# python heatmapp.py works but you really should use `flask run`
if __name__ == '__main__':
    from gevent import pywsgi
    from geventwebsocket.handler import WebSocketHandler
    server = pywsgi.WSGIServer(('', 5000), app, handler_class=WebSocketHandler)
    server.serve_forever()
