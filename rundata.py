#! /usr/bin/env python

# tcx.py is a script for parsing tcx files that I found online
import gpxpy
import os
import pandas as pd
import logging


logging.basicConfig(format='%(levelname)s:%(message)s', level=logging.DEBUG)


class Activity():

    """
    An object instance of Activity class represents one activity from a
    gpx file.  For now, all we care about is the time series of
    waypoints, which is a list of tuples (timestamp, latitude, longitude).
    """

    def __init__(self, filename):
        """
        The default constructor creates an Activity from a gpx file in the
        form of a string.
        """

        with open(filename, "r") as file:
            activity = gpxpy.parse(file)

        self.time_series = []

        for track in activity.tracks:
            for segment in track.segments:
                points = [(point.time, point.latitude, point.longitude)
                          for point in segment.points]

                self.time_series.extend(points)

    def dataframe(self):
        """Return a Pandas DataFrame of this Activity's time series"""

        df = pd.DataFrame.from_records(self.time_series,
                                       columns=["timestamp", "lat", "long"])
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.set_index("timestamp")
        return df

    def csv(self):
        """
        Return a CSV (string) representation of this Activity's time series.
        """
        return "\n".join("{}, {}, {}".format(t, x, y)
                         for t, x, y in self.time_series) + "\n"


def main():
    """
    Running this script creates a csv file containing all waypoints of tcx
    acvtivity files in my (local) Dropbox Tapiriik folder.
    """

    path = "./Activities"
    outfname = "allpoints2.csv"

    with open(outfname, "w") as outfile:

        for in_fname in os.listdir(path):

            if in_fname.endswith(".gpx"):
                activity = Activity(path + "/" + in_fname)

                logging.debug("Processing {}".format(in_fname))
                outfile.write(activity.csv())

if __name__ == "__main__":
    main()
