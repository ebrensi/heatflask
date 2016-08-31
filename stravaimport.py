#! usr/bin/env python

import stravalib
from heatmapp import db, Activity, User

client = stravalib.Client()


def import_activities(user, count=1):
    # get the ids of activities for this user
    #  that already exist in our database
    already_got = [d[0] for d in db.session.query(
        Activity.id).filter_by(user_name=user.name, source="strava").all()]

    # log in to Garmin Connect
    yield "logging in Garmin Connect user {}...\n".format(user.gc_username)
    sesh = logged_in_session(user.gc_username, user.gc_password)
