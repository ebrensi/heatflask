#! /usr/bin/env python

from flask import Flask, redirect, url_for, session, request, jsonify
from stravalib import Client

STRAVA_CLIENT_ID = "12700"
STRAVA_CLIENT_SECRET = "04d0fffe327fa71bffcbb4c9bc00c26a0d530e4b"
STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
SECRET_KEY = "secret"


app = Flask(__name__)
app.config.from_object(__name__)

client = Client()


@app.route('/')
def index():
    if client.access_token:
        athlete = client.get_athlete()

        ath = {"id": athlete.id,
               "firstname": athlete.firstname,
               "lastname": athlete.lastname,
               "username": athlete.username
               }
        return jsonify(ath)
    else:
        return redirect(url_for('login'))


@app.route('/login')
def login():
    redirect_uri = url_for('authorized', _external=True)
    auth_url = client.authorization_url(client_id=app.config["STRAVA_CLIENT_ID"],
                                        redirect_uri=redirect_uri,
                                        approval_prompt="force")
    return redirect(auth_url)


# @app.route('/logout')
# def logout():
#     session.pop('strava_token', None)
#     return redirect(url_for('index'))


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
        return redirect(url_for("index"))


@app.route('/activities')
def activities():
    if client.access_token:
        act = client.get_activities(after="2010-01-01T00:00:00Z")
        ids = {a.id: a.name for a in act}
        return jsonify(ids)

    # if 'strava_token' in session:
    #     page = request.args["page"]
    #     data = {"page": page,
    #             "per_page": 50}
    #     activities = strava.get('athlete/activities', data=data).data
    #     a_list = {a["id"]: "{}: {}".format(a["name"], a["start_date"])
    #               for a in activities}
    #     a_dict = {"activities": a_list,
    #               "count": len(a_list)}
    #     return jsonify(a_dict)
    else:
        return redirect(url_for('login'))


# @strava.tokengetter
# def get_strava_token():
#     return session.get('strava_token')


if __name__ == '__main__':
    app.run()
