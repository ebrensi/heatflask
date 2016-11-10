#! /usr/bin/env python
# This is a little app to test stravalib API functionality

from __future__ import unicode_literals
from flask import Flask, redirect, url_for, request, jsonify, Response, \
    render_template
import stravalib
import os
import polyline
import json
import random
import gevent
from gevent.pool import Pool

STRAVA_CLIENT_ID = os.environ["STRAVA_CLIENT_ID"]
STRAVA_CLIENT_SECRET = os.environ["STRAVA_CLIENT_SECRET"]
STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
SECRET_KEY = "secret"
JSONIFY_PRETTYPRINT_REGULAR = False

app = Flask(__name__)
app.config.from_object(__name__)

client = stravalib.Client()


@app.route('/')
def index():
    if client.access_token:
        athlete = client.get_athlete()

        ath = {
            "id": athlete.id,
            "firstname": athlete.firstname,
            "lastname": athlete.lastname,
            "username": athlete.username,
            "pic_url": athlete.profile
        }

        return jsonify(ath)
    else:
        return redirect(url_for('login'))


@app.route('/login')
def login():
    redirect_uri = url_for('authorized', _external=True)
    auth_url = client.authorization_url(client_id=app.config["STRAVA_CLIENT_ID"],
                                        redirect_uri=redirect_uri,
                                        state=request.args.get("next", ""))
    return redirect(auth_url)


@app.route('/login/authorized')
def authorized():
    code = request.args['code']
    access_token = client.exchange_code_for_token(client_id=app.config["STRAVA_CLIENT_ID"],
                                                  client_secret=app.config[
                                                      "STRAVA_CLIENT_SECRET"],
                                                  code=code)

    if not access_token:
        return ('Access denied: reason={} error={}'
                .format(request.args['error'],
                        request.args['error_description']))

    else:
        client.access_token = access_token
        return redirect(request.args.get("state") or url_for("index"))


@app.route('/activities')
def activities():
    limit = request.args.get("limit", None, type=int)
    streams = request.args.get("streams")

    if client.access_token:
        def actvity_msg_list():
            yield "Activities list:\n"
            for a in activity_iterator(client, streams=streams, limit=limit):
                yield a["msg"] + "\n"
            yield "Done.\n"

        return Response(actvity_msg_list(), mimetype='text/event-stream')
    else:
        args = {"_external": True}
        if limit:
            args["limit"] = limit
        return redirect(url_for('login', next=url_for("activities", **args)))


@app.route('/activities_sse')
def activity_stream():
    limit = request.args.get("limit", None, type=int)

    def stream():
        for a in activity_iterator(client, limit=limit):
            yield "data: {}\n\n".format(json.dumps(a))

        yield "data: done\n\n"

    return Response(stream(), mimetype='text/event-stream')


@app.route('/activity_list')
def activity_list():
    limit = request.args.get("limit", None, type=int)
    if client.access_token:

        return render_template("activities.html", limit=limit)
    else:
        args = {"_external": True}
        if limit:
            args["limit"] = limit
        return redirect(url_for('login', next=url_for("activity_list", **args)))


@app.route('/retrieve_list', methods=['POST'])
def retrieve():
    data = {
        "to": request.form.getlist("to"),
        "from": request.form.getlist("from")
    }

    return jsonify(data)


@app.route('/activities/<activity_id>')
def data_points(activity_id):
    if client.access_token:
        stream_data = get_stream_data(activity_id)
        return jsonify(stream_data)
    else:
        return redirect(url_for('login',
                                next=url_for("data_points",
                                             activity_id=activity_id,
                                             _external=True)))


def activity_iterator(client, streams=False, **args):
    for a in client.get_activities(**args):
        activity = {
            "id": a.id,
            "name": a.name,
            "type": a.type,
            "summary_polyline": a.map.summary_polyline,
            "beginTimestamp": str(a.start_date_local),
            "total_distance": float(a.distance),
            "elapsed_time": int(a.elapsed_time.total_seconds()),
            "msg": "[{0.id}] {0.type}: '{0.name}' {0.start_date_local}, {0.distance}".format(a)
        }

        yield activity


def get_stream_data(activity_id):
    stream_names = ['time', 'latlng', 'distance', 'altitude']

    streams = client.get_activity_streams(activity_id,
                                          types=stream_names)

    stream_data = {name: streams[name].data for name in streams}

    if 'latlng' in stream_data:
        stream_data["polyline"] = (
            polyline.encode(stream_data.pop('latlng'))
        )

    return stream_data


@app.route('/test')
def data_stream():
    pool = Pool()

    def test_job(i):
        r = random.randint(1, 10)
        gevent.sleep(r)
        return "test {} completed in {} secs".format(i, r)

    def yield_from_queue():
        for a in pool.imap_unordered(test_job, xrange(1, 10)):
            yield "data: {}\n\n".format(json.dumps(a))

        yield "data: done\n\n"

    return Response(yield_from_queue(), mimetype='text/event-stream')


if __name__ == '__main__':
    app.run()
