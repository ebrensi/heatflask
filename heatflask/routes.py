#! usr/bin/env python

from __future__ import unicode_literals
from functools import wraps
from flask import current_app as app
from flask import (
    Response, render_template, request, redirect, jsonify, url_for,
    flash, send_from_directory, stream_with_context
)
from datetime import datetime, timedelta
# import logging
import os
import json
import itertools
import base36
import requests
import stravalib
import uuid
from flask_login import current_user, login_user, logout_user, login_required

# from urllib.parse import urlparse, urlunparse #python3
from urlparse import urlparse, urlunparse  # python2

# Local imports
from . import login_manager, redis, mongo, sockets


from .models import (
    Users, Activities, EventLogger, Utility, Webhooks, Index, Payments,
    StravaClient, BinaryWebsocketClient
)

mongodb = mongo.db

log = app.logger

# Handles logging-in and logging-out users via cookies
login_manager.login_view = 'splash'


# -------------------------------------------------------------


@login_manager.user_loader
def load_user(user_id):
    user = Users.get(user_id)
    return user


def admin_required(f):
    # Views wrapped with this wrapper will only allow admin users
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if (current_user.is_authenticated and
                current_user.is_admin()):
            return f(*args, **kwargs)
        else:
            return login_manager.unauthorized()
    return decorated_function


def admin_or_self_required(f):
    #  Only allow users viewing their own data
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


# Redirect any old domain urls to new domain
@app.before_request
def redirect_to_new_domain():
    urlparts = urlparse(request.url)
    # log.debug("request to {}".format(urlparts))
    
    # Don't redirect calls to /webhook _callback.
    #  They cause an error for some reason
    if urlparts.path == '/webhook_callback':
        return

    if urlparts.netloc == app.config["FROM_DOMAIN"]:
        urlparts_list = list(urlparts)
        urlparts_list[1] = app.config["TO_DOMAIN"]
        new_url = urlunparse(urlparts_list)
        # log.debug("new url: {}".format(new_url))
        return redirect(new_url, code=301)



#  ------------- Serve some static files -----------------------------
#  TODO: There might be a better way to do this.
@app.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'favicon.ico')


@app.route('/avatar/athlete/medium.png')
def anon_photo():
    return send_from_directory(os.path.join(app.root_path, 'static'),
                               'anon-photo.jpg')


@app.route('/apple-touch-icon')
@app.route('/logo.png')
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


# -----------------------------------------------------------------------------
#  **** "routes" are our endpoints ***
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


# Attempt to authorize a user via Oauth(2)
@app.route('/authorize')
def authorize():
    state = request.args.get("state")
    redirect_uri = url_for('auth_callback', _external=True)

    client = stravalib.Client()
    auth_url = client.authorization_url(
        client_id=app.config["STRAVA_CLIENT_ID"],
        redirect_uri=redirect_uri,
        approval_prompt="force",
        scope=["read", "activity:read", "activity:read_all"],
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
        return redirect(state or url_for("splash"))

    scope = request.args.get("scope")
    # log.debug("scope: {}".format(scope))

    if "activity:read" not in scope:
        # We need to be able to read the user's activities
        return redirect(url_for("authorize", state=state))

    if current_user.is_anonymous:
        args = {"code": request.args.get("code"),
                "client_id": app.config["STRAVA_CLIENT_ID"],
                "client_secret": app.config["STRAVA_CLIENT_SECRET"]}
        
        client = stravalib.Client()
        
        try:
            access_info = client.exchange_code_for_token(**args)
            # access_info is a dict containing the access_token, 
            #  date of expire, and a refresh token

        except Exception as e:
            log.error("authorization error:\n{}".format(e))
            flash(str(e))
            return redirect(state)

        # log.debug("got code exchange response: {}".format(access_info))
        user_data = Users.strava_user_data(
            access_info=access_info)
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
            EventLogger.new_event(
                msg="{} authenticated as {}. Token expires at {}."
                .format(user.id, scope,
                        datetime.fromtimestamp(access_info.get("expires_at"))))
        else:
            log.error("user authentication error")
            log.exception(e)
            flash("There was a problem authorizing user")

    return redirect(state or url_for("main", username=user.id))


@app.route("/<username>/logout")
@admin_or_self_required
@login_required
def logout(username):
    user = Users.get(username)
    user_id = user.id
    username = user.username
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
            flash("You need to re-authenticate (log-in).")
        else:
            current_user.update_usage()

    user = None

    #
    # note: 'current_user' is the user that is currently logged in.
    #       'user' is the user we are displaying data for.
    
    user = Users.get(username)
    if not user:
        flash("user '{}' is not registered with this app"
              .format(username))
        return redirect(url_for('splash'))
    
    try:
        #  Catch any registered users that still have the old access_token
        json.loads(user.access_token)

    except Exception:
        # if the logged-in user has a bad access_token
        #  then we log them out so they can re-authenticate
        flash(
            "Invalid access token for {}. please re-authenticate."
            .format(user))
        if current_user == user:
            return redirect(url_for("logout", username=username))
        else:
            return redirect(url_for('splash'))

    date1 = request.args.get("date1") or request.args.get("after", "")
    date2 = request.args.get("date2") or request.args.get("before", "")
    preset = request.args.get("days", "") or request.args.get("preset", "")
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

    # Assign an id to this web client in order to prevent
    #  websocket access from unidentified connections 
    timeout = app.config["WEB_CLIENT_ID_TIMEOUT"]
    web_client_id = "C:{}".format(uuid.uuid1().get_hex())
    ip_address = request.access_route[-1]
    redis.setex(web_client_id, timeout, ip_address)


    paused = request.args.get("paused") in ["1", "true"]

    return render_template(
        'main.html',
        user=user,
        client_id=web_client_id,
        lat=lat,
        lng=lng,
        zoom=zoom,
        ids=ids,
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


@app.route('/<username>/list')
def list_activities(username):
    user = Users.get(username)
    if not user:
        return "no user {}".format(username)

    try:
        client = StravaClient(user=user)
    except Exception as e:
        log.exception(e)
        return "sorry, there was an error"
    
    args = dict(
        limit=request.args.get("limit", 100),
    )
    if request.args.get("days"):
        days = int(request.args.get("days"))
        args["after"] = datetime.utcnow() - timedelta(days=days)

    stream = ("{}\n\n".format(a) for a in client.get_index(**args))

    

    return Response(stream_with_context(
        stream
    ), mimetype='text/event-stream')


@app.route('/<username>/activities')
@log_request_event
@admin_or_self_required
def activities(username):
    user = Users.get(username)
    if request.args.get("rebuild"):
        try:
            user.delete_index()
        except Exception as e:
            log.error("error deleting index for {}".format(user))
            log.exception(e)
    

    # Assign an id to this web client in order to prevent
    #  websocket access from unidentified users 
    timeout = 60 * 30  # 30 min
    web_client_id = "C:{}".format(uuid.uuid1().get_hex())
    ip_address = request.access_route[-1]
    redis.setex(web_client_id, timeout, ip_address)
    
    try:
        html = render_template(
            "activities.html",
            user=user,
            client_id=web_client_id)
        
    except Exception as e:
        log.exception(e)
        html = "?? Something is wrong.  Contact us at info@heatflask.com"
    
    return html if html else "There is a problem here."


@app.route('/<username>/update_info')
@log_request_event
@admin_or_self_required
def update_share_status(username):
    status = request.args.get("status")
    user = Users.get(username)

    # set user's share status
    status = user.is_public(status == "public")
    log.info(
        "share status for {} set to {}"
        .format(user, status)
    )

    return jsonify(user=user.id, share=status)


def toObj(string):
    try:
        return json.loads(string)
    except ValueError:
        return string


@sockets.route('/data_socket')
def data_socket(ws):

    wsclient = BinaryWebsocketClient(ws)

    while not ws.closed:
        msg = wsclient.receiveObj()

        if msg:
            if "query" in msg:
                # Make sure this socket is being accessed by
                #  a legitimate client
                query = msg["query"]
                try:
                    assert redis.exists(query["client_id"])
                except Exception:
                    obj = {"error": "client does not exist or is expired. please refresh your browser. "}
                    wsclient.sendObj(obj)
                    log.info(
                        "query from invalid client {} rejected"
                        .format(wsclient)
                    )
                    break
    
                wsclient.client_id = query.pop("client_id")

                query_result = Activities.query(query)
                for a in query_result:
                    if ws.closed:
                        wsclient.close()
                        try:
                            # make the generator yield one more time in order
                            #  to let it wrap up, ideally in the code right after
                            next(query_result)
                        except Exception:
                            pass
                        return

                    wsclient.sendObj(a)
               
            elif "close" in msg:
                log.debug("{} close request".format(wsclient))
                break
            else:
                log.debug("{} says {}".format(wsclient, msg))

    wsclient.close()
    # log.debug("socket {} CLOSED".format(name))


#  Endpoints for named demos
@app.route('/demos/<demo_key>')
def demos(demo_key):
    # Last 60 activities
    demos = app.config.get("DEMOS")
    if not demos:
        return "No Demos defined"
    
    params = demos.get(demo_key)
    if not params:
        return 'demo "{}" does not exist'.format(demo_key)

    return redirect(url_for("main", **params))


@app.route('/demo')
def demo():
    # Last 60 activities
    return redirect(url_for("demos", demo_key="last60activities"))


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
            log.debug(
                "error writing query {} to MongoDB: {}"
                .format(_id, e)
            )
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


@app.route('/users/update')
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

    iterator = Users.triage(
        days_inactive_cutoff=days,
        delete=delete,
        update=update
    )

    stream = (
        "{}: {}\n".format(id, status)
        for id, status in iterator
    )
    return Response(
        stream_with_context(stream),
        mimetype='text/event-stream'
    )


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

@app.route("/beacon_handler", methods=["POST"])
def beacon_handler():
    # log.debug("received beacon: {}".format(request.data))
    Utility.del_genID(request.data)
    return "ok"


# ---- Event log stuff ----
@app.route('/history')
@log_request_event
@admin_required
def event_history():
    events = EventLogger.get_log(int(request.args.get("n", 100)))
    if events:
        return render_template("history.html", events=events)
    return "No history"


@app.route('/history/live-updates')
@log_request_event
@admin_required
def live_updates():
    # log.debug(request.headers)
    secs = float(request.headers.get("Last-Event-Id", 0))
    ts = datetime.utcfromtimestamp(secs) if secs else None
    # log.debug("live-updates init at {}".format(ts))
    
    stream = EventLogger.live_updates_gen(ts)
    return Response(
        stream_with_context(stream),
        content_type='text/event-stream')


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
            .format(ip, app.config.get("IPSTACK_ACCESS_KEY"))
        )
        resp = requests.get(url)
        info = json.dumps(resp.json()) if resp else ""
        if info:
            redis.setex(key, app.config["CACHE_IP_INFO_TIMEOUT"], info)

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

        log.debug("webhook_callback: {}".format(request))
        return "ok"

    elif request.method == 'POST':
        update_raw = request.get_json(force=True)
        Webhooks.handle_update_callback(update_raw)
        return "success"


# Paypal stuff
@app.route('/paypal/success')
def success():
    try:
        return "Thanks for your donation!"
    except Exception, e:
        return(str(e))

#
# Donation/Payment notification handler
#  Handle calls from Paypal's PDT and IPN APIs
#  PDT:
#  https://developer.paypal.com/docs/classic/products/payment-data-transfer
#  IPN:
#  https://developer.paypal.com/docs/classic/products/instant-payment-notification
@app.route('/paypal/ipn', methods=['POST'])
def paypal_ipn_handler():

    # Check with Paypal to confirm that this POST form data comes from them
    r = requests.post(
        app.config.get("PAYPAL_VERIFY_URL"), 
        headers={
            'User-Agent': 'PYTHON-IPN-VerificationScript',
            'content-type': 'application/x-www-form-urlencoded'
        },
        data='cmd=_notify-validate&{}'.format(request.data)
    )
    log.debug("ipn verification:  {}".format(r))

    if r.text == 'VERIFIED':
        log.info("Received verified data: {}".format(request.form))

        # Here we take some action based on the data from Paypal, 
        #  with info about a payment from a user.
        return "Paypal IPN message verified.", 200
    else:
        return "Paypal IPN message could not be verified.", 403



