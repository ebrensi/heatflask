#! /usr/bin/env python

# tcx.py is a script for parsing tcx files that I found online
from fitnesshacks import tcx
import os
import pandas as pd
import logging


logging.basicConfig(format='%(levelname)s:%(message)s', level=logging.DEBUG)


class Activity():

    """
    An object instance of Activity class represents one activity from a
    Garmin TCX (v2) file.  For now, all we care about is the time series of
    waypoints, which is a list of tuples (timestamp, latitude, longitude).
    """

    def __init__(self, xml):
        """
        The default constructor creates an Activity from a tcx file in the
        form of a string.
        """
        activity, points = tcx.parsetcx(xml)
        # (lapnum, timestamp, seconds, xy_pos, alt, dist, heart, cad)

        self.name = activity
        self.time_series = [(point[1], point[3][0], point[3][1])
                            for point in points]

    @classmethod
    def from_file(cls, fname):
        """ Create Activity from file, given filename (full-path)"""
        with open(fname, "r") as f:
            xml = f.read()
        return cls(xml)

    def dataframe(self):
        """Return a Pandas DataFrame of this Activity's time series"""

        df = pd.DataFrame.from_records(self.locs,
                                       columns=["timestamp", "lat", "long"])
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.set_index("timestamp")
        return df

    def csv(self):
        """
        Return a CSV (string) representation of this Activity's time series.
        """
        return "\n".join("{}, {}".format(x, y)
                         for t, x, y in self.time_series) + "\n"


def main():
    """
    Running this script creates a csv file containing all waypoints of tcx
    acvtivity files in my (local) Dropbox Tapiriik folder.
    """

    path = "/home/efrem/Dropbox/Apps/tapiriik"
    outfname = "allpoints.csv"

    with open(outfname, "w") as outfile:

        for in_fname in os.listdir(path):

            if in_fname.endswith(".tcx"):
                activity = Activity.from_file(path + "/" + in_fname)

                if ("run" in activity.name.lower() and
                        (None not in activity.time_series[0])):
                    logging.debug("Processing {}".format(in_fname))
                    outfile.write(activity.csv())

                else:
                    logging.debug("Ignoring {}".format(in_fname))


if __name__ == "__main__":
    main()
