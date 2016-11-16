#! usr/bin/env python
import heatmapp
import argparse


#  Define command-line arguents
parser = argparse.ArgumentParser()


parser.add_argument('--clear_cache', action='store_true')

parser.add_argument("-p", "--purge", action='store_true',
                    help="purge activities older than x days old")

# Retrive command-line arguments
args = parser.parse_args()

if args.clear_cache:
    heatmapp.cache.clear()
    heatmapp.app.logger.info("cleared cache")

if args.purge:
    heatmapp.purge_old_activities()
