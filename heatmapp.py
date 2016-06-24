#! usr/bin/env python

from flask import Flask, render_template, request, g
from sqlalchemy import create_engine
import pandas as pd
import os
from flask_compress import Compress


# Configuration
SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
DEBUG = True


app = Flask(__name__)
app.config.from_object(__name__)
Compress(app)


def get_db():
    db = getattr(g, "_database", None)
    if db is None:
        engine = create_engine(SQLALCHEMY_DATABASE_URI)
        db = g._database = engine.connect()
    return db


def query_db(query, args=(), one=False):
    cur = get_db().execute(query, args)
    rv = cur.fetchall()
    cur.close()
    return (rv[0] if rv else None) if one else rv


@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()


@app.route('/')
def index():
    start = request.args.get("start", "2016-06-01")
    end = request.args.get("end", "2016-06-24")

    df = get_points_df(start, end)

    meanlat, meanlong = df.mean()

    # with open("test.html", "w") as f:
    #     f.write(t)

    return render_template('sidebarv2.html',
                           data=df.values,
                           zoom=13,
                           center={"lat": meanlat, "lng": meanlong})


def get_points_df(start=None, end=None):
    # TODO: make sure datetimes are valid and start <= finish

    query = """
            SELECT timestamp, latitude, longitude FROM(
                SELECT unnest(timestamps) AS timestamp,
                       unnest(latitudes) AS latitude,
                       unnest(longitudes) AS longitude FROM activities
                            WHERE begintimestamp >= '%s'
                            AND begintimestamp <= '%s') AS f;

            """ % (start, end)

    df = pd.read_sql(query,
                     con=get_db(),
                     parse_dates=["timestamp"],
                     index_col="timestamp")
    return df


# This works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
