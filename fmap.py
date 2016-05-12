#! /usr/bin/env python

import folium
from folium import plugins
import pandas as pd
import sys


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


def main(args):
    M = makemap()
    M.save("map.html")

if __name__ == "__main__":
    main(sys.argv[1:])
