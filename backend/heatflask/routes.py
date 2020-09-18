#! usr/bin/env python

# Standard library imports
import os
import re
import time
import json
import itertools
from functools import wraps
from datetime import datetime, timedelta
from urllib.parse import urlparse, urlunparse

# Third party imports
import base36
import requests
import stravalib
from flask import current_app as app
from flask import (
    Response,
    render_template,
    request,
    redirect,
    jsonify,
    url_for,
    flash,
    send_from_directory,
    get_flashed_messages,
)
from flask_login import current_user, login_user, logout_user

# Local imports
from . import login_manager, redis, mongo, sockets

from .models import (
    Users,
    Activities,
    EventLogger,
    Utility,
    Webhooks,
    Index,
    Payments,
    BinaryWebsocketClient,
    StravaClient,
    Timer,
)

mongodb = mongo.db

log = app.logger

# Handles logging-in and logging-out users via cookies
login_manager.login_view = "splash"


# -------------------------------------------------------------


@login_manager.user_loader
def load_user(user_id):
    user = Users.get(user_id)
    return user


@login_manager.unauthorized_handler
def handle_needs_login():
    return redirect(url_for("authorize", state=request.full_path))


def admin_required(f):
    # Views wrapped with this wrapper will only allow admin users
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if current_user.is_authenticated and current_user.is_admin():
            return f(*args, **kwargs)
        else:
            return login_manager.unauthorized()

    return decorated_function


def admin_or_self_required(f):
    #  Only allow users viewing their own data
    @wraps(f)
    def decorated_function(*args, **kwargs):

        if current_user.is_anonymous:
            return login_manager.unauthorized()

        if current_user.is_admin():
            return f(*args, **kwargs)

        user_identifier = request.view_args.get("username")

        if user_identifier in [current_user.username, str(current_user.id)]:
            return f(*args, **kwargs)
        else:
            return login_manager.unauthorized()

    return decorated_function


def log_request_event(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        event = dict(msg=request.url)

        if current_user.is_authenticated:
            if current_user.is_admin():
                # if current user is admin
                # we don't bother logging this event
                return f(*args, **kwargs)

            event.update(dict(cuid=current_user.id, profile=current_user.profile))

        # If the user is anonymous or a regular user, we log the event
        EventLogger.log_request(request, **event)
        return f(*args, **kwargs)

    return decorated_function


# Redirect any old domain urls to new domain
@app.before_request
def redirect_to_new_domain():
    urlparts = urlparse(request.url)

    # Don't redirect calls to /webhook _callback.
    #  They cause an error for some reason
    if urlparts.path == "/webhook_callback":
        return

    # ignore localhost requests
    if urlparts.netloc.startswith("127"):
        return

    urlparts_list = list(urlparts)

    changed = False

    if urlparts.netloc == app.config["FROM_DOMAIN"]:
        urlparts_list[1] = app.config["TO_DOMAIN"]
        changed = True

    if changed:
        new_url = urlunparse(urlparts_list)
        # log.debug("request to {}".format(request.url))
        # log.debug("redirected to %s", new_url)

        return redirect(new_url, code=301)
    return


# @app.route('/avatar/athlete/medium.png')
# def anon_photo():
#     return image_url('anon-photo.jpg')


# -----------------------------------------------------------------------------
#  **** "routes" are our endpoints ***
@app.route("/")
def splash():
    if current_user.is_authenticated:
        if hasattr(current_user, "id"):
            return redirect(url_for("main", username=current_user.id))
        else:
            # If a user is logged in but has no record in our database.
            #  i.e. was deleted.  We direct them to initialize a new account.
            logout_user()
            flash("oops! Please log back in.")

    next_url = (request.args.get("next") or url_for("splash"))
    args = {
        "DEVELOPMENT": app.config.get("DEVELOPMENT"),
        "URLS": {
            "demo": url_for("demo"),
            "directory": url_for("public_directory"),
            "authorize": url_for("authorize", next=next_url),
        },
    }

    return render_template("splash.html", args=args)


# Attempt to authorize a user via Oauth(2)
@app.route("/authorize")
def authorize():
    state = request.args.get("state")
    redirect_uri = url_for("auth_callback", _external=True)

    client = stravalib.Client()
    auth_url = client.authorization_url(
        client_id=app.config["STRAVA_CLIENT_ID"],
        redirect_uri=redirect_uri,
        # approval_prompt="force",
        scope=["read", "activity:read", "activity:read_all"],
        state=state,
    )
    return redirect(auth_url)


# Authorization callback.  The service returns here to give us an access_token
#  for the user who successfully logged in.
@app.route("/authorized")
def auth_callback():
    state = request.args.get("state")

    if "error" in request.args:
        flash("Error: {}".format(request.args.get("error")))
        return redirect(state or url_for("splash"))

    scope = request.args.get("scope")
    if "activity:read" not in scope:
        # We need to be able to read the user's activities
        return redirect(url_for("authorize", state=state))

    if current_user.is_anonymous:
        args = dict(
            code=request.args.get("code"),
            client_id=app.config["STRAVA_CLIENT_ID"],
            client_secret=app.config["STRAVA_CLIENT_SECRET"],
        )

        client = stravalib.Client()

        try:
            access_info = client.exchange_code_for_token(**args)
            # access_info is a dict containing the access_token,
            #  date of expire, and a refresh token
            user_data = Users.strava_user_data(access_info=access_info)

            assert user_data

            new_user = "" if Users.get(user_data["id"]) else " NEW USER"

            user = Users.add_or_update(**user_data)

            assert user

        except Exception:
            log.exception("authorization error")
            flash("Authorization Error: {}".format(datetime.utcnow()))
            return redirect(state)

        # remember=True, for persistent login.
        login_user(user, remember=True)

        msg = "Authenticated{} {}".format(new_user, user, scope)
        log.info(msg)
        if new_user:
            EventLogger.new_event(msg=msg)

    return redirect(state or url_for("main", username=user.id))


@app.route("/<username>/logout")
@admin_or_self_required
def logout(username):
    user = Users.get(username)
    user_id = user.id
    username = user.username
    logout_user()
    flash("user '{}' ({}) logged out".format(username, user_id))
    return redirect(url_for("splash"))


@app.route("/<username>/delete_index")
@admin_or_self_required
def delete_index(username):
    user = Users.get(username)
    if user:
        user.delete_index()
        msg = "index for {} deleted".format(user)
        EventLogger.new_event()
        return msg
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
        flash(str(e, "utf-8"))
    else:
        flash("user '{}' ({}) deleted".format(username, user_id))
        EventLogger.new_event(msg="{} deleted".format(user_id))
    return redirect(url_for("splash"))


@app.route("/<username>")
def main(username):
    if current_user.is_authenticated:
        # If a user is logged in from a past session but has no record in our
        #  database (was deleted), we log them out and consider them anonymous
        try:
            assert current_user.id
        except AssertionError:
            logout_user()
            return login_manager.unauthorized()
        current_user.update_usage()

    user = None

    #
    # note: 'current_user' is the user that is currently logged in.
    #       'user' is the user we are displaying data for.

    user = Users.get(username)
    if not user:
        flash("user '{}' is not registered with heatflask".format(username))
        return redirect(url_for("splash"))

    try:
        #  Catch any registered users that still have the old access_token
        json.loads(user.access_token)

    except Exception:
        # if the logged-in user has a bad access_token
        #  then we log them out so they can re-authenticate
        flash("Invalid access token for {}. please re-authenticate.".format(user))
        if current_user == user:
            logout_user()
            return login_manager.unauthorized()
        else:
            return redirect(url_for("splash"))

    ip = Utility.ip_address(request)
    web_client_id = "H:{}:{}".format(ip, int(time.time()))
    log.debug("%s OPEN", web_client_id)

    # Record the event unless current_user is an admin
    if current_user.is_anonymous or (not current_user.is_admin()):
        event = {
            "ip": request.access_route[-1],
            "agent": vars(request.user_agent),
            "msg": Utility.href(request.url, request.full_path),
        }

        if current_user.is_authenticated:
            event.update({"profile": current_user.profile, "cuid": current_user.id})

        EventLogger.new_event(**event)

    args = {
        "CLIENT_ID": web_client_id,
        "DEVELOPMENT": app.config.get("DEVELOPMENT"),
        "FLASH_MESSAGES": get_flashed_messages(),
        "APP_NAME": app.config.get("APP_NAME"),
    }

    if current_user.is_authenticated:
        current_user_info = current_user.info()
        current_user_info["isAdmin"] = current_user.is_admin()
        args["CURRENT_USER"] = current_user_info

    return render_template("main.html", args=args)


@app.route("/<username>/activities")
@log_request_event
# @admin_or_self_required
def activities(username):
    user = Users.get(username)
    if request.args.get("rebuild"):
        try:
            user.delete_index()
        except Exception:
            log.exception("error deleting index for {}".format(user))

    # Assign an id to this web client in order to prevent
    #  websocket access from unidentified users
    ip = Utility.ip_address(request)
    web_client_id = "HA:{}:{}".format(ip, int(time.time()))
    log.debug("%s OPEN", web_client_id)

    args = {
        "USER_ID": user.id,
        "CLIENT_ID": web_client_id,
        "OFFLINE": app.config.get("OFFLINE"),
        "ADMIN": current_user.is_admin(),
        "IMPERIAL": user.measurement_preference == "feet",
        "DEVELOPMENT": app.config.get("DEVELOPMENT"),
    }

    return render_template("activity-list.html", user=user, _args=args)


@app.route("/<username>/activities/<int:_id>")
@admin_or_self_required
def activity(username, _id):
    user = Users.get(username)
    client = StravaClient(user=user)
    raw = client.get_raw_activity(_id)
    return jsonify(raw)


@app.route("/<username>/update_info")
@log_request_event
@admin_or_self_required
def update_share_status(username):
    status = request.args.get("status")
    user = Users.get(username)

    # set user's share status
    status = user.is_public(status == "public")
    log.info("share status for %s set to %s", user, status)
    return jsonify(user=user.id, share=status)


@sockets.route("/data_socket")
def data_socket(ws):

    wsclient = BinaryWebsocketClient(ws)

    while not wsclient.closed:
        obj = wsclient.receiveobj()
        if not obj:
            continue

        if "close" in obj:
            break

        elif "query" in obj:
            # Make sure this socket is being accessed by
            #  a legitimate client
            query = obj["query"]

            if "client_id" in query:
                wsclient.client_id = query.pop("client_id")

            query_result = Activities.query(query)
            wsclient.send_from(query_result)

        elif "admin" in obj:
            admin_request = obj["admin"]
            if "events" in admin_request:
                ts = admin_request.get("events") or time.time()
                start = datetime.utcfromtimestamp(ts)
                event_stream = EventLogger.live_updates_gen(start)
                wsclient.send_from(event_stream)
        else:
            log.debug("%s received object %s", wsclient, obj)

    wsclient.close()
    # log.debug("socket {} CLOSED".format(name))


#  Endpoints for named demos
@app.route("/demos/<demo_key>")
def demos(demo_key):
    # Last 60 activities
    demos = app.config.get("DEMOS")
    if not demos:
        return "No Demos defined"

    params = demos.get(demo_key)
    if not params:
        return 'demo "{}" does not exist'.format(demo_key)

    return redirect(url_for("main", **params))


@app.route("/demo")
def demo():
    # Last 60 activities
    return redirect(url_for("demos", demo_key="last60activities"))


# ---- Endpoints to cache and retrieve query urls that might be long
#   we store them as integer ids and the key for access is that integer
#   in base-36
@app.route("/cache", methods=["GET", "POST"])
def cache_put(query_key):
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

    obj = {}
    if request.method == "GET":
        obj = request.args.to_dict()

    if request.method == "POST":
        obj = request.get_json(force=True)

    if not obj:
        return ""

    h = hash(obj)

    doc = mongodb.queries.find_one({"hash": h})

    # if a record exists with this hash already then return
    #  the id for that record
    if doc:
        _id = doc["_id"]

    else:
        _id = new_id(obj)
        obj.update({"_id": _id, "hash": h, "ts": datetime.utcnow()})

        try:
            mongodb.queries.update_one({"_id": _id}, {"$set": obj}, upsert=True)

        except Exception as e:
            log.debug("error writing query {} to MongoDB: {}".format(_id, e))
            return

    return jsonify(base36.dumps(_id))


@app.route("/cache/<key>")
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
@app.route("/public/directory")
@log_request_event
def public_directory():
    fields = ["id", "dt_last_active", "username", "profile", "city", "state", "country"]
    info = Users.dump(fields, share_profile=True)
    return render_template("directory.html", data=info)


# ---- User admin stuff ----
@app.route("/users")
@admin_required
def users():
    fields = [
        "id",
        "dt_last_active",
        "firstname",
        "lastname",
        "profile",
        "app_activity_count",
        "city",
        "state",
        "country",
        "email",
        "dt_indexed",
    ]
    info = Users.dump(fields)
    return render_template("admin.html", data=info)


@app.route("/users/update")
@admin_required
def users_update():
    delete = request.args.get("delete")
    update = request.args.get("update")
    days = request.args.get("days")

    if days:
        try:
            days = int(days)
        except Exception:
            return "bad days value"

    iterator = Users.triage(days_inactive_cutoff=days, delete=delete, update=update)
    return "ok"

    # stream = (
    #     "{}: {}\n".format(id, status)
    #     for id, status in iterator
    # )
    # return Response(
    #     stream_with_context(stream),
    #     mimetype='text/event-stream'
    # )


@app.route("/users/<username>")
@log_request_event
@admin_or_self_required
def user_profile(username):
    user = Users.get(username)
    output = user.info() if user else {}
    return jsonify(output)


# ---- App maintenance stuff -----
@app.route("/app/info")
@admin_required
def app_info():
    info = {
        "config": str(app.config),
        "mongodb": mongodb.command("dbstats"),
        Activities.name: mongodb.command("collstats", Activities.name),
        Index.name: mongodb.command("collstats", Index.name),
        "config": app.config,
    }
    return jsonify(info)


@app.route("/app/dbinit")
@admin_required
def app_init():
    keys = redis.keys("*")
    info = {
        "redis": redis.delete(*keys) if keys else [],
        "Activities": Activities.init_db(),
        "Index": Index.init_db(),
    }
    return "Activities, Index initialized and redis cleared\n{}".format(info)


@app.route("/beacon_handler", methods=["POST"])
def beacon_handler():
    key = str(request.data, "utf-8")

    try:
        ts = int(key.split(":")[-1])
    except Exception:
        log.debug("beacon: %s CLOSED.", key)
    else:
        elapsed = int(time.time() - ts)
        elapsed_td = timedelta(seconds=elapsed)
        log.debug("beacon: %s CLOSED. elapsed=%s", key, elapsed_td)

    return "ok"


# ---- Event log stuff ----
@app.route("/events")
@admin_required
def event_history():
    events = EventLogger.get_log(int(request.args.get("n", 100)))
    if events:
        return render_template("events.html", events=events)
    return "No history"


@app.route("/events/<event_id>")
@log_request_event
@admin_required
def logged_event(event_id):
    return jsonify(EventLogger.get_event(event_id))


@app.route("/events/init")
@log_request_event
@admin_required
def event_history_init():
    EventLogger.init()
    return redirect(url_for("event_history"))


# IP lookup url
@app.route("/ip_lookup")
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
        url = "http://api.ipstack.com/{}?access_key={}".format(
            ip, app.config.get("IPSTACK_ACCESS_KEY")
        )
        resp = requests.get(url)
        info = json.dumps(resp.json()) if resp else ""
        if info:
            redis.setex(key, app.config["CACHE_IP_INFO_TIMEOUT"], info)

    return jsonify(info)


# Stuff for subscription to Strava webhooks
@app.route("/subscription/<operation>")
@admin_required
def subscription_endpoint(operation):
    if operation == "create":
        return jsonify(Webhooks.create(url_for("webhook_callback", _external=True)))

    elif operation == "list":
        return jsonify({"subscriptions": Webhooks.list()})

    elif operation == "delete":
        result = Webhooks.delete(
            subscription_id=request.args.get("id"),
            delete_collection=request.args.get("reset"),
        )
        return jsonify(result)

    elif operation == "updates":
        return render_template(
            "webhooks.html",
            events=list(Webhooks.iter_updates(int(request.args.get("n", 100)))),
        )


@app.route("/webhook_callback", methods=["GET", "POST"])
# @talisman(force_https=False)
def webhook_callback():

    if request.method == "GET":
        if request.args.get("hub.challenge"):
            log.debug("subscription callback with {}".format(request.args))
            cb = Webhooks.handle_subscription_callback(request.args)
            log.debug("handle_subscription_callback returns {}".format(cb))
            return jsonify(cb)

        log.debug("webhook_callback: {}".format(request))
        return "ok"

    elif request.method == "POST":
        update_raw = request.get_json(force=True)
        Webhooks.handle_update_callback(update_raw)
        return "success"


# Paypal stuff
@app.route("/paypal/success")
def success():
    try:
        return "Thanks for your donation!"
    except Exception as e:
        return str(e, "utf-8")


#
# Donation/Payment notification handler
#  Handle calls from Paypal's PDT and IPN APIs
#  PDT:
#  https://developer.paypal.com/docs/classic/products/payment-data-transfer
#  IPN:
#  https://developer.paypal.com/docs/classic/products/instant-payment-notification
@app.route("/paypal/ipn", methods=["POST"])
def paypal_ipn_handler():

    # Check with Paypal to confirm that this POST form data comes from them
    r = requests.post(
        app.config.get("PAYPAL_VERIFY_URL"),
        headers={
            "User-Agent": "PYTHON-IPN-VerificationScript",
            "content-type": "application/x-www-form-urlencoded",
        },
        data="cmd=_notify-validate&{}".format(request.data),
    )
    log.debug("ipn verification:  {}".format(r))

    if r.text == "VERIFIED":
        log.info("Received verified data: {}".format(request.form))

        # Here we take some action based on the data from Paypal,
        #  with info about a payment from a user.
        return "Paypal IPN message verified.", 200
    else:
        return "Paypal IPN message could not be verified.", 403


@app.route("/test", methods=["GET", "POST"])
@admin_required
def test_endpoint():
    return "yo!"
