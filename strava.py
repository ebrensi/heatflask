#! /usr/bin/env python

from flask import Flask, redirect, url_for, session, request, jsonify
from flask_oauthlib.client import OAuth

STRAVA_CLIENT_ID = "12700"
STRAVA_CLIENT_SECRET = "04d0fffe327fa71bffcbb4c9bc00c26a0d530e4b"
STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
SECRET_KEY = "secret"


app = Flask(__name__)
app.config.from_object(__name__)

oauth = OAuth(app)

strava = oauth.remote_app(
    'strava',
    base_url='https://www.strava.com/api/v3/',
    request_token_url=None,
    access_token_url=app.config["STRAVA_TOKEN_URL"],
    authorize_url=app.config["STRAVA_AUTH_URL"],
    consumer_key=app.config["STRAVA_CLIENT_ID"],
    consumer_secret=app.config["STRAVA_CLIENT_SECRET"],
    access_token_method='POST'
)


@app.route('/')
def index():
    if 'strava_token' in session:
        me = strava.get('athlete')
        return jsonify(me.data)
    else:
        return redirect(url_for('login'))


@app.route('/login')
def login():
    redirect_uri = url_for('authorized', _external=True)
    return strava.authorize(callback=redirect_uri,
                            approval_prompt="force")


@app.route('/logout')
def logout():
    session.pop('strava_token', None)
    return redirect(url_for('index'))


@app.route('/login/authorized')
def authorized():
    resp = strava.authorized_response()

    if resp is None:
        return ('Access denied: reason={} error={}'
                .format(request.args['error'],
                        request.args['error_description']))

    else:
        session['strava_token'] = (resp['access_token'], '')
        me = strava.get('athlete')
        return jsonify(me.data)


@app.route('/activities')
def activities():
    if 'strava_token' in session:
        page = request.args["page"]
        data = {"page": page,
                "per_page": 50}
        activities = strava.get('athlete/activities', data=data).data
        a_list = {a["id"]: "{}: {}".format(a["name"], a["start_date"])
                  for a in activities}
        a_dict = {"activities": a_list,
                  "count": len(a_list)}
        return jsonify(a_dict)
    else:
        return redirect(url_for('login'))


@strava.tokengetter
def get_strava_token():
    return session.get('strava_token')


if __name__ == '__main__':
    app.run()
