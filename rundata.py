#! /usr/bin/env python3

import tcx
import os
import pandas as pd
import logging


logging.basicConfig(format='%(levelname)s:%(message)s', level=logging.DEBUG)


class Activity():

    def __init__(self, xml):
        activity, points = tcx.parsetcx(xml)
        # (lapnum, timestamp, seconds, xy_pos, alt, dist, heart, cad)

        self.name = activity
        self.times_eries = [(point[1], point[3][0], point[3][1])
                            for point in points]

    @classmethod
    def from_file(cls, fname):
        with open(fname, "r") as f:
            xml = f.read()
        return cls(xml)

    def dataframe(self):
        df = pd.DataFrame.from_records(self.locs,
                                       columns=["timestamp", "lat", "long"])
        df["timestamp"] = pd.to_datetime(df["timestamp"])
        df = df.set_index("timestamp")
        return df

    def csv(self):
        return "\n".join("{}, {}".format(x, y)
                         for t, x, y in self.times_series)


def main():
    path = "/home/efrem/Dropbox/Apps/tapiriik"
    outfname = "allpoints.csv"

    with open(outfname, "w") as outfile:

        for in_fname in os.listdir(path)

            if in_fname.endswith(".tcx"):
                activity = Activity.from_file(path + "/" + in_fname)
                if "run" in activity.name.lower():
                    logging.debug("processing {}".format(in_fname))
                    outfile.write(in_fname)
                else:
                    logging.debug("Ignoring {}".format(in_fname))


if __name__ == "__main__":
    main()
