#! usr/bin/env python
from __future__ import unicode_literals

import gevent
# from gevent import monkey
# monkey.patch_all()  # may not be necessary
from exceptions import StopIteration
from functools import wraps

from flask import Flask, Response, render_template, request, redirect, \
    jsonify, url_for, flash, send_from_directory, render_template_string
import flask_compress
import dateutil.parser
from datetime import datetime
import os
import re
import json
import stravalib
import flask_login
from flask_login import current_user, login_user, logout_user, login_required
import flask_assets
from flask_analytics import Analytics
from flask_sslify import SSLify
from signal import signal, SIGPIPE, SIG_DFL

app = Flask(__name__)
app.config.from_object(os.environ['APP_SETTINGS'])
sslify = SSLify(app)

# models depend app so we import them afterwards
from models import Users, Activities, EventLogger, db_sql, mongodb, redis


def href(url, text):
    return "<a href='{}' target='_blank'>{}</a>".format(url, text)


Analytics(app)

# we bundle javascript and css dependencies to reduce client-side overhead
bundles = {
    "index_css": flask_assets.Bundle('css/jquery-ui.css',
                                     'css/bootstrap.min.css',
                                     'css/font-awesome.min.css',
                                     'css/leaflet.css',
                                     'css/leaflet-sidebar.css',
                                     'css/L.Control.Window.css',
                                     'css/L.Control.Locate.min.css',
                                     filters='cssmin',
                                     output='gen/index.css'),

    "index_js": flask_assets.Bundle('js/jquery-3.1.0.min.js',
                                    'js/jquery-ui.min.js',
                                    'js/leaflet.js',
                                    'js/leaflet-sidebar.js',
                                    'js/Polyline.encoded.js',
                                    'js/moment.js',
                                    'js/leaflet-heat.js',
                                    'js/leaflet-ant-path.js',
                                    'js/L.Control.Window.js',
                                    'js/leaflet-providers.js',
                                    'js/Leaflet.GoogleMutant.js',
                                    'js/L.Control.Locate.min.js',
                                    'js/eventsource.js',
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


def log_request(f):

    @wraps(f)
    def decorated_function(*args, **kwargs):
        if current_user.is_anonymous or (not current_user.is_admin()):
            EventLogger.new_event(**{
                "ip": request.environ.get('HTTP_X_REAL_IP', request.remote_addr),
                "cuid": "" if current_user.is_anonymous else current_user.id,
                "agent": vars(request.user_agent),
                "msg": href(request.url, request.full_path)
            })

            ips = {"remote_addr": request.remote_addr,
                   "access_route": request.access_route,
                   'HTTP_X_REAL_IP': request.environ.get('HTTP_X_REAL_IP'),
                   }
            app.logger.info("ips={}\nuser_agent={}"
                            .format(ips, request.user_agent))
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
    EventLogger.new_event(msg="robots.txt request",
                          agent=request.user_agent)
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'robots.txt')


@app.route('/')
def splash():
    if current_user.is_authenticated:
        try:
            assert current_user.id
        except:
            # If a user is logged in but has no record in our database.
            #  i.e. was deleted.  We direct them to initialize a new account.
            logout_user()
            flash("oops! Please log back in.")
        else:
            return redirect(url_for('index',
                                    username=current_user.id))

    return render_template("splash.html",
                           next=(request.args.get("next") or
                                 url_for("splash")))


@app.route('/demo')
def demo():
    # Last 7 days of activity
    # return redirect(url_for("index",
    #                         username="15972102",
    #                         preset="7",
    #                         heatres="high",
    #                         flowres="high",
    #                         info=1,
    #                         autozoom=1
    #                         )
    #                 )

    # My Christmas week in Houston
    return redirect(url_for("index",
                            username="15972102",
                            date1="2016-12-21",
                            date2="2016-12-28",
                            autozoom=1,
                            heatres="high",
                            flowres="high",
                            info=1
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
            app.logger.info("authorization error:\n{}".format(e))
            flash(str(e))
            return redirect(state)

        user = Users.from_access_token(access_token)

        # remember=True, for persistent login.
        login_user(user, remember=True)
        app.logger.debug("authenticated {}".format(user))
        EventLogger.new_event(msg="authenticated {}".format(user.id))

    return redirect(request.args.get("state") or
                    url_for("index", username=current_user.id))


@app.route("/<username>/logout")
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
        EventLogger.new_event(msg="{} logged out".format(user_id))
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
@log_request
def index(username):
    if current_user.is_authenticated:
        # If a user is logged in from a past session but has no record in our
        #  database (was deleted), we log them out and consider them anonymous
        try:
            assert current_user.id
        except:
            logout_user()
        else:
            current_user.update(
                dt_last_active=datetime.utcnow(),
                app_activity_count=current_user.app_activity_count + 1
            )

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
                except:
                    flash("'{}' is not a valid preset".format(preset))
                    preset = 7
            elif limit:
                try:
                    limit = int(limit)
                except:
                    flash("'{}' is not a valid limit".format(limit))
                    limit = 1
            else:
                limit = 5

    flowres = request.args.get("flowres", "")
    heatres = request.args.get("heatres", "")
    if (not flowres) and (not heatres):
        flowres = "high"
        heatres = "high"

    lat = request.args.get("lat")
    lng = request.args.get("lng")
    zoom = request.args.get("zoom")
    autozoom = request.args.get("autozoom")
    info = request.args.get("hover") or request.args.get("info")
    if not info:
        info = 1

    if (not lat) or (not lng):
        lat, lng = app.config["MAP_CENTER"]
        zoom = app.config["MAP_ZOOM"]
        autozoom = "1"
    return render_template('index.html',
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
                           baselayer=baselayer
                           )


@app.route('/<username>/getdata')
@log_request
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
        except:
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
            except:
                return errout("Invalid Dates")
        elif not limit:
            options["limit"] = 10

    hires = request.args.get("hires") == "true"

    # app.logger.debug("getdata: {}, hires={}".format(options, hires))

    def sse_iterator(client, Q):
        # streams_out = ["polyline", "time"]
        # streams_to_cache = ["polyline", "time"]
        streams_out = ["polyline"]
        streams_to_cache = ["polyline"]

        def import_and_queue(Q, activity):
            stream_data = Activities.import_streams(
                client, activity["id"], streams_to_cache)

            data = {s: stream_data[s] for s in streams_out + ["error"]
                    if s in stream_data}
            data.update(activity)
            # app.logger.debug("imported streams for {}".format(activity["id"]))
            Q.put(sse_out(data))
            gevent.sleep(0)

        pool = gevent.pool.Pool(app.config.get("CONCURRENCY"))
        Q.put(sse_out({"msg": "Retrieving Index..."}))

        activity_data = user.index(**options)
        if isinstance(activity_data, list):
            total = len(activity_data)
            ftotal = float(total)
        else:
            total = "?"
            ftotal = None

        count = 0
        try:
            for activity in activity_data:
                # app.logger.debug("activity {}".format(activity))
                if (("msg" in activity) or
                    ("error" in activity) or
                        ("stop_rendering" in activity)):
                    Q.put(sse_out(activity))

                if activity.get("summary_polyline"):
                    count += 1
                    activity.update(
                        Activities.ATYPE_MAP.get(activity["type"].lower())
                    )

                    data = {"msg": "activity {0}/{1}...".format(count, total)}
                    if ftotal:
                        data["value"] = count / ftotal

                    Q.put(sse_out(data))

                    if hires:
                        stream_data = Activities.get(activity["id"])

                        if not stream_data:
                            pool.spawn(import_and_queue, Q, activity)
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
            # raise
            Q.put(sse_out({"error": str(e)}))

        pool.join(timeout=10)  # make sure all spawned jobs are done
        Q.put(sse_out())

        # We must put a StopIteration here to close the (http?) connection,
        # otherise we'll get an idle connection error from Heroku
        Q.put(StopIteration)

    Q = gevent.queue.Queue()
    gevent.spawn(sse_iterator, user.client(), Q)
    return Response(Q, mimetype='text/event-stream')


# creates a SSE stream of current.user's activities, using the Strava API
# arguments
@app.route('/<username>/activities_sse')
@login_required
def activity_stream(username):

    user = Users.get(username)
    if (user == current_user):
        options = {}

        if "id" in request.args:
            options["activity_ids"] = request.args.get("id")
        else:
            if "friends" in request.args:
                options["friends"] = True

            if "before" in request.args:
                options["before"] = dateutil.parser.parse(
                    request.args.get("before"))

            if "after" in request.args:
                options["after"] = dateutil.parser.parse(
                    request.args.get("after"))

            if "limit" in request.args:
                options["limit"] = int(request.args.get("limit"))

        def boo():
            for a in user.index(**options):
                yield "data: {}\n\n".format(json.dumps(a))
            yield "data: done\n\n"

        return Response(boo(), mimetype='text/event-stream')
    else:
        return "sorry, wrong user."


@app.route('/<username>/activities')
@login_required
@log_request
def activities(username):
    if (Users.get(username) == current_user):
        if request.args.get("rebuild"):
            current_user.delete_index()
        return render_template("activities.html",
                               user=current_user,
                               limit=request.args.get("limit"))
    else:
        return "sorry"


@app.route('/users')
@admin_required
def users():
    info = [
        {
            "id": user.id,
            "dt_last_active": user.dt_last_active,
            "app_activity_count": user.app_activity_count,
            "username": user.username
        }
        for user in Users.query
    ]

    info = sorted(info, key=lambda(x): x["app_activity_count"] or 0)

    html = """
    <h1> Registered Users </h1>
    <table>
        {%- for d in data %}
          <tr>
            <td><a href="{{ url_for('index',username=d['id']) }}" target='_blank'>{{ d['id'] }}</a></td>
            <td>{{ d["app_activity_count"] }}</td>
            <td>{{ d["dt_last_active"] }}</td>
          </tr>
        {%- endfor %}
    </table>

    """
    return render_template_string(html, data=info)


@app.route('/users/backup')
@admin_required
def users_backup():
    return jsonify(Users.backup())


@app.route('/history')
@admin_required
def event_history():
    events = EventLogger.get_log()
    if events:
        html = """
        <h1>Events</h1>
        <table>
            <tr>
            <td>time</td>
            <td>ip</td>
            <td>from</td>
            <td>event</td>
            </tr>
            {%- for e in events %}
              <tr>
                <td> <a href='{{ url_for('logged_event', id=e['_id']) }}' target='_blank'>{{e.get('ts').strftime("%m-%d %H:%M:%S")}}</a></td>
                <td>{{ e.get('ip', '') }}</td>
                <td>{{ e.get('cuid', '') }}</td>
                <td>{{ e.get('msg', '')|safe }}</td>
              </tr>
            {%- endfor %}
        </table>

        """
        return render_template_string(html, events=events)
    return "No history"


@app.route('/history/raw')
@admin_required
def event_history_raw():
    return jsonify(EventLogger.get_log())


@app.route('/history/<id>')
@admin_required
def logged_event(id):
    return jsonify(EventLogger.get_event(id))


@app.route('/history/init')
@admin_required
def event_history_init():
    EventLogger.init()
    return redirect(url_for("event_history"))


# makes python ignore sigpipe and prevents broken pipe exception when client
#  aborts an SSE stream
signal(SIGPIPE, SIG_DFL)

# python heatmapp.py works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
