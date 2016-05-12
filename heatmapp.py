#! usr/bin/env python

from flask import Flask, render_template, request, g
import sqlite3
import folium
from folium import plugins
import pandas as pd


app = Flask(__name__)


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
    df = pd.read_csv('all_points.csv',
                     header=None,
                     names=["timestamp", "lat", "long"],
                     parse_dates=["timestamp"],
                     index_col="timestamp").sort_index()

    if not start:
        start = df.index[0]
    if not end:
        end = df.index[-1]

    df = df[start:end].dropna()

    meanlat, meanlong = df.mean()

    heatmap = folium.Map(location=[meanlat, meanlong],
                         control_scale=True,
                         zoom_start=12)

    point_tuples = zip(df.lat, df.long)

    points = [[la, lo] for la, lo in point_tuples]

    cluster = plugins.HeatMap(data=points,
                              name="heatmap",
                              radius=5)

    heatmap.add_children(cluster)

    return heatmap


if __name__ == '__main__':
    app.run(debug=True)
