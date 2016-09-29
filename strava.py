#! /usr/bin/env python
# This is a sample app to test Strava API functionality


from flask import Flask, redirect, url_for, request, jsonify, Response
import stravalib
import os

STRAVA_CLIENT_ID = os.environ["STRAVA_CLIENT_ID"]
STRAVA_CLIENT_SECRET = os.environ["STRAVA_CLIENT_SECRET"]
STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
SECRET_KEY = "secret"


app = Flask(__name__)
app.config.from_object(__name__)

client = stravalib.Client()


@app.route('/')
def index():
    if client.access_token:
        athlete = client.get_athlete()

        ath = {"id": athlete.id,
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
                                        approval_prompt="force",
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
    if client.access_token:
        limit = request.args.get("limit")

        def do_import():
            count = 0
            yield "importing activities from Strava...\n"
            for a in client.get_activities(limit=limit):
                # a2 = {
                #     "id": a.id,
                #     "name": a.name,
                #     "external_id": a.external_id,
                #     "distance": a.distance,
                #     "elapsed_time": a.elapsed_time,
                #     "type": a.type,
                #     "start_date_local": a.start_date_local
                # }
                count += 1
                yield "[{0.id}] {0.name}: {0.start_date_local}, {0.elapsed_time}, {0.distance}\n".format(a)
            yield "Done! {} activities exported\n".format(count)

        return Response(do_import(), mimetype='text/event-stream')
    else:
        return redirect(url_for('login', next=url_for("activities",
                                                      _external=True)))


@app.route('/activities/<activity_id>')
def data_points(activity_id):
    if client.access_token:
        streams = client.get_activity_streams(int(activity_id),
                                              types=['time', 'latlng'])
        print(streams)

        time = streams["time"].data
        latlng = streams["latlng"].data
        points = ("{}: {}\n".format(t, ll) for t, ll in zip(time, latlng))
        return Response(points, mimetype='text/event-stream')
    else:
        return redirect(url_for('login',
                                next=url_for("data_points",
                                             activity_id=activity_id,
                                             _external=True)))


if __name__ == '__main__':
    app.run()
