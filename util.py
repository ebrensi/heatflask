#! usr/bin/env python
import argparse

from heatmapp import Activities, app, cache

#  Define command-line arguents
parser = argparse.ArgumentParser()


parser.add_argument('--clear_cache', action='store_true')

parser.add_argument("-p", "--purge", action='store_true',
                    help="purge activities older than x days old")

# Retrive command-line arguments
args = parser.parse_args()

if args.clear_cache:
    cache.clear()
    app.logger.info("cleared cache")

if args.purge:
    days = app.config["STORE_ACTIVITIES_TIMEOUT"]
    result = Activities.purge(days)
    app.logger.info("purged {} activities older than {} days"
                    .format(result.deleted_count,
                            days))
