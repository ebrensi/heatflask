#! usr/bin/env python

from flask import Flask, render_template, request, g
import sqlite3
import folium
from folium import plugins
import pandas as pd

# configuration
DATABASE = "activities_db.sqlite"
DEBUG = True


app = Flask(__name__)
app.config.from_object(__name__)


def get_db():
    db = getattr(g, "_database", None)
    if db is None:
        db = g._database = sqlite3.connect(app.config['DATABASE'])
        db.row_factory = sqlite3.Row
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
    return render_template('index.html')


@app.route('/defaultmap')
def blank_map():
    return render_template("defaultmap.html")


@app.route('/map')
def heatmap():
    start = request.args.get('start')
    end = request.args.get('end')
    print("Constructing map on dates ranging from...{} to {}"
          .format(start, end))
    Map = makemap(start, end)

    print("Rendering map into html...")
    html = Map.get_root().render()

    print("Sending Map to browser...")
    return html


def makemap(start=None, end=None):
    # TODO: use proper method for parameter passing
    query = ("SELECT timestamp, latitude, longitude FROM points"
             " WHERE timestamp >= '{}' and timestamp <= '{}';"
             .format(start, end))

    df = pd.read_sql(query,
                     con=get_db(),
                     parse_dates=["timestamp"],
                     index_col="timestamp").sort_index()

    # TODO: make sure datetimes are valid and start <= finish
    if not start:
        start = df.index[0]
    if not end:
        end = df.index[-1]

    df = df[start:end].dropna()

    meanlat, meanlong = df.mean()

    heatmap = folium.Map(location=[meanlat, meanlong],
                         control_scale=True,
                         zoom_start=12)

    point_tuples = zip(df.latitude, df.longitude)

    points = [[la, lo] for la, lo in point_tuples]

    cluster = plugins.HeatMap(data=points,
                              name="heatmap",
                              radius=5)

    heatmap.add_children(cluster)

    return heatmap


if __name__ == '__main__':
    app.run()
