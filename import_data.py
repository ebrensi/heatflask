#! /usr/bin/env python

# tcx.py is a script for parsing tcx files that I found online
import gpxpy
import os
import logging
import json

logging.basicConfig(format='%(levelname)s:%(message)s', level=logging.DEBUG)


class Activity():

    """
    An object instance of Activity class represents one activity from a
    gpx file.  For now, all we care about is the time series of
    waypoints, which is a list of tuples (timestamp, latitude, longitude).
    """

    def __init__(self, gpx):
        """
        The default constructor creates an Activity from a gpx file in the
        form of a string.
        """
        self.time_series = []
        self.empty = False

        try:
            activity = gpxpy.parse(gpx)
        except:
            self.empty = True
        else:
            for track in activity.tracks:
                for segment in track.segments:
                    points = [(point.time, point.latitude, point.longitude)
                              for point in segment.points]
                    self.time_series.extend(points)

    @classmethod
    def from_file(cls, filename):
        with open(filename, "r") as file:
            return cls(file)

    def csv(self):
        """
        Return a CSV (string) representation of this Activity's time series.
        """
        return ("\n".join("{}, {}, {}"
                          .format(t, x, y)
                          for t, x, y in self.time_series) + "\n")


def main():
    activity_path = "./Activities"
    points_fname = "all_points.csv"
    ids_fname = "all_ids.json"

    if os.path.isfile(ids_fname):
        logging.debug("appending to %s", points_fname)
        with open(ids_fname, "r") as idsfile:
            ids = set(json.load(idsfile))

    else:
        ids = set()

    with open(points_fname, "a") as pointsfile:
        for in_fname in os.listdir(activity_path):

            if in_fname.endswith(".gpx"):
                activity_id = in_fname.split("_")[1].split(".")[0]

                if activity_id in ids:
                    logging.debug("Skipping {}".format(in_fname))
                else:
                    logging.debug("Processing {}".format(in_fname))
                    activity = (Activity
                                .from_file(activity_path + "/" + in_fname))
                    if not activity.empty:
                        pointsfile.write(activity.csv())

                ids.add(activity_id)

    with open(ids_fname, "w") as ids_file:
        json.dump(list(ids), ids_file)


if __name__ == "__main__":
    main()
