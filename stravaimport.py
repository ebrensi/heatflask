#! usr/bin/env python

import stravalib
from heatmapp import db, Activity, User
import polyline
import argparse
import logging

logging.basicConfig(  # filename="strava_import_{}.log".format(CURRENT_DATE),
    format='%(levelname)s:%(message)s',
    level=logging.INFO)


def import_activities(db, user, client, limit=1, detailed=True):
    already_got = [int(d[0]) for d in db.session.query(
        Activity.id).filter_by(user=user).all()]

    count = 0
    msg = "importing activities from Strava..."
    logging.info(msg)
    yield msg + "\n"

    activities = client.get_activities(limit=limit)

    for a in activities:
        count += 1

        if not a.start_latlng:
            msg = ("{}. activity {} has no data points"
                   .format(count, a.id))
            logging.info(msg)
            yield msg + "\n"

        elif a.id in already_got:
            msg = ("{}. activity {} already in database."
                   .format(count, a.id))
            logging.info(msg)
            yield msg + "\n"
        else:
            other = {"name": a.name,
                     "strava_polyline": a.map.summary_polyline}
            params = {"user": user,
                      "id": a.id,
                      "other": other,
                      "beginTimestamp": a.start_date_local,
                      "source": "ST"}

            if detailed:
                streams = client.get_activity_streams(a.id,
                                                      types=['time', 'latlng'])

                params["elapsed"] = streams["time"].data

                # eliminate (0,0) points
                latlng = [(x, y) for x, y in streams["latlng"].data
                          if (x, y) != (0, 0)]

                params["polyline"] = polyline.encode(latlng)

            A = Activity(**params)
            db.session.add(A)
            db.session.commit()

            mi = stravalib.unithelper.miles(a.distance)
            msg = ("[{0.id}] {0.name}: {0.start_date_local}"
                   .format(a))
            msg = "{}. {}, {}".format(count, msg, mi)
            logging.info(msg)
            yield msg + "\n"

    msg = "Done! {} activities imported".format(count)
    logging.info(msg)
    yield msg + "\n"

if __name__ == '__main__':
    # create tables from data models if they don't exist
    db.create_all()
    db.session.commit()

    #  Define command-line arguents
    parser = argparse.ArgumentParser()

    parser.add_argument("--user",
                        help="your app username",
                        nargs='?')

    parser.add_argument('-c', '--count', nargs='?', default="1",
                        help=("number of recent activities to download, or 'all'"
                              " (default: 1)"))

    parser.add_argument('--clean', action='store_true', default=False)

    parser.add_argument('--detailed', action='store_true', default=True)

    # Retrive command-line arguments
    args = parser.parse_args()

    if not args.user:
        logging.info("no username given")
        exit()

    if args.user == "all":
        users = User.query.all()
    else:
        users = User.query.filter_by(name=args.user).all()

    for user in users:
        if args.clean:
            # delete all gc_activities for user from database
            Activity.query.filter_by(user=user).delete()
            logging.info("clean import: deleted GC records for %s", user)

        client = stravalib.Client(
            access_token=user.strava_user_data["access_token"])

        limit = None if args.count == "all" else int(args.count)

        logging.info("importing {} records for {}".format(limit, user.name))

        # import GC activities for user
        for msg in import_activities(db, user, client, limit=limit,
                                     detailed=args.detailed):
            pass
