#! usr/bin/env python

from flask import Flask, Response, render_template, request, redirect, jsonify,\
    url_for, abort, session, flash
import flask_compress
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from datetime import date, timedelta
import os
import stravalib


app = Flask(__name__)
app.config.from_object(os.environ['APP_SETTINGS'])

# initialize database
db = SQLAlchemy(app)

# data models defined in models.py
from models import User, Activity
migrate = Migrate(app, db)

# Strava client
client = stravalib.Client()


# views will be sent as gzip encoded
flask_compress.Compress(app)


@app.route("/login", methods=["GET", "POST"])
def login():
    return render_template("login.html")


@app.route('/')
def nothing():
    return redirect(url_for('login'))


@app.route('/<username>')
def user_map(username):
    return render_template('map.html',
                           username=username)


@app.route('/<username>/points.json')
def pointsJSON(username):
    tomorrow = (date.today() + timedelta(1)).strftime('%Y-%m-%d')
    today = date.today().strftime('%Y-%m-%d')

    start = request.args.get("start", today)
    end = request.args.get("end", tomorrow)

    user = User.query.get(username)
    points = [[row[0], row[1]] for row in get_points(user, start, end)]
    resp = jsonify(points)
    resp.status_code = 200

    return resp


def get_points(user, start=None, end=None):
    # TODO: make sure datetimes are valid and start <= finish
    # query = """
    #         SELECT  lat, lng
    #         FROM (
    #             SELECT elapsed, lat, lng
    #             FROM(
    #                 SELECT unnest(elapsed) AS elapsed,
    #                        unnest(latitudes) AS lat,
    #                        unnest(longitudes) AS lng
    #                 FROM %s
    #                 WHERE user_name == '%s'
    #                   AND begintimestamp >= '%s'
    #                   AND begintimestamp <= '%s'
    #                 ) AS sub
    #             ) AS sub2
    #         WHERE lat <> 0 AND lng <> 0;
    #         """ % (Activity.__tablename__, user.name, start, end)

    result = db.session.query(db.func.unnest(Activity.latitudes),
                              db.func.unnest(Activity.longitudes))
    result = result.filter_by(user=user)
    result = result.filter(Activity.beginTimestamp.between(start, end))

    # figure out a better way to do this
    result = [(a, b) for a, b in result if (a, b) != (0, 0)]
    return result


@app.route('/<user_name>/activity_import')
def activity_import(user_name):
    user = User.get(user_name)

    if user:
        clean = request.args.get("clean", "")
        count = request.args.get("count", 0)
        service = request.args.get("service")

        if service == "gc":
            import gcimport
            if clean:
                return "<h1>{}: clear data for {} and import {} most recent activities</h1>".format(service, user_name, count)
            else:
                do_import = gcimport.import_activities(db, user, count=count)
                return Response(do_import, mimetype='text/event-stream')

        elif service == "strava":
            return redirect(url_for("strava_activities",
                                    limit=count,
                                    username=user.name,
                                    really="yes"))

# ------- Strava API stuff -----------


@app.route('/strava/login')
def strava_login():
    redirect_uri = url_for('authorized', _external=True)
    auth_url = client.authorization_url(client_id=app.config["STRAVA_CLIENT_ID"],
                                        redirect_uri=redirect_uri,
                                        approval_prompt="force",
                                        state=request.args.get("next", ""))
    return redirect(auth_url)


@app.route('/strava/login/authorized')
def authorized():
    if "error" in request.args:
        error = request.args["error"]
        flash('Error: {}'.format(error))
        return redirect(url_for('login'))
    else:
        code = request.args['code']
        access_token = client.exchange_code_for_token(client_id=app.config["STRAVA_CLIENT_ID"],
                                                      client_secret=app.config[
                                                          "STRAVA_CLIENT_SECRET"],
                                                      code=code)
        client.access_token = access_token
        return redirect(request.args.get("state") or url_for("account_create"))


@app.route('/strava/account_create')
def account_create():
    if client.access_token:
        A = client.get_athlete()
        user = User.get(A.username)
        if not user:
            athlete_info = {"id": A.id,
                            "firstname": A.firstname,
                            "lastname": A.lastname,
                            "username": A.username,
                            "pic_url": A.profile,
                            }

            user = User(name=A.username,
                        strava_user_data=athlete_info)
            db.session.add(user)
            db.session.commit()
        return redirect(url_for("user_map", username=A.username))


@app.route('/strava/account_delete')
def account_delete():
    if client.access_token:
        A = client.get_athlete()
        user = User.get(A.username)
        if user.name == A.username:
            db.session.delete(user)
            db.session.commit()
            flash("user {} deleted".format(A.username))
            return redirect(url_for("login"))


@app.route('/<username>/strava/activities')
def strava_activities(username):
    user = User.get(username)
    already_got = [d[0] for d in db.session.query(
        Activity.id).filter_by(user_name=user.name, source="ST").all()]

    limit = request.args.get("limit")
    limit = int(limit) if limit else ""

    if client.access_token:
        really = (request.args.get("really") == "yes")

        def do_import():
            count = 0
            yield "importing activities from Strava...\n"
            for a in client.get_activities(limit=limit):
                if really:

                    if a.id in already_got:
                        msg = "activity {} already in database.".format(a.id)
                        yield msg + "\n"
                    else:
                        streams = client.get_activity_streams(int(a.id),
                                                              types=['time', 'latlng'])
                        if "latlng" in streams:
                            time = streams["time"].data
                            lat, lng = zip(*streams["latlng"].data)

                            A = Activity(user=user,
                                         id=a.id,
                                         beginTimestamp=a.start_date_local,
                                         elapsed=time,
                                         latitudes=list(lat),
                                         longitudes=list(lng),
                                         source="ST")
                            db.session.add(A)
                            db.session.commit()
                        else:
                            yield "activity {} has no data points".format(a.id)

                count += 1
                yield ("[{0.id}] {0.name}: {0.start_date_local},"
                       " {0.elapsed_time}, {0.distance}\n").format(a)
            yield "Done! {} activities imported\n".format(count)

        return Response(do_import(), mimetype='text/event-stream')

    else:
        return redirect(url_for('strava_login',
                                next=url_for("strava_activities",
                                             limit=limit,
                                             really=really,
                                             username=username,
                                             _external=True)))


@app.route('/strava/activities/<activity_id>')
def data_points(activity_id):
    if client.access_token:
        streams = client.get_activity_streams(int(activity_id),
                                              types=['time', 'latlng'])

        time = streams["time"].data
        latlng = streams["latlng"].data
        points = ("{}: {}\n".format(t, ll) for t, ll in zip(time, latlng))
        return Response(points, mimetype='text/event-stream')
    else:
        return redirect(url_for('strava_login',
                                next=url_for("data_points",
                                             activity_id=activity_id,
                                             _external=True)))


# python heatmapp.py works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
