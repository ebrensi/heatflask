#! usr/bin/env python

from flask import Flask, render_template, request, g
from sqlalchemy import create_engine
import os
from flask_compress import Compress
from datetime import date, timedelta


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
    tomorrow = (date.today() + timedelta(1)).strftime('%Y-%m-%d')
    today = date.today().strftime('%Y-%m-%d')

    start = request.args.get("start", today)
    end = request.args.get("end", tomorrow)

    points = get_points(start, end)

    html = render_template('index.html',
                           start=start,
                           end=end,
                           data=points)

    with open("test.html", "w") as f:
        f.write(html)

    return html


def get_points(start=None, end=None):
    # TODO: make sure datetimes are valid and start <= finish

    query = """
            SELECT  lat, lng
            FROM (
                SELECT timestamp, lat, lng
                FROM(
                    SELECT unnest(timestamps) AS timestamp,
                           unnest(latitudes) AS lat,
                           unnest(longitudes) AS lng FROM activities
                                WHERE begintimestamp >= '%s'
                                AND begintimestamp <= '%s'
                    ) AS sub
                ) AS sub2;
            """ % (start, end)

    result = query_db(query)
    print(result)
    return result


# This works but you really should use `flask run`
if __name__ == '__main__':
    app.run()
