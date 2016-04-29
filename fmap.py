#! /usr/bin/env python

import folium
from folium import plugins
import pandas as pd
import sys


def makemap():
    df = pd.read_csv('allpoints.csv')
    df = df[df.lat != "None"].astype(float)

    heatmap = folium.Map(location=[37.831390, -122.185242], zoom_start=3)

    point_tuples = zip(df.lat, df.long)

    points = [[la, lo] for la, lo in point_tuples]

    cluster = plugins.HeatMap(data=points,
                              name="heatmap",
                              radius=5)

    heatmap.add_children(cluster)

    return heatmap


def main(args):
    if args:
        filename = args[0]
    else:
        filename = "map.html"

    M = makemap()
    M.save(filename)


if __name__ == "__main__":
    main(sys.argv[1:])
