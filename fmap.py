#! /usr/bin/env python

import folium
from folium import plugins
import pandas as pd
import sys


def makemap(start=None, end=None):
    df = pd.read_csv('allpoints.csv',
                     parse_dates=['timestamp'],
                     index_col="timestamp").sort_index()
    if not start:
        start = df.index[0]
    if not end:
        end = df.index[-1]

    df = df[start:end].dropna()

    heatmap = folium.Map(location=[37.831390, -122.185242], zoom_start=3)

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
