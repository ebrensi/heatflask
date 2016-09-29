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
            activity_data = {
                "id": a.id,
                "name": a.name,
                "type": a.type,
                "summary_polyline": a.map.summary_polyline,
                "beginTimestamp": a.start_date_local,
                "distance": a.distance,
                "elapsed_time": a.elapsed_time,
                "user": user
            }

            if detailed:
                stream_names = ['time', 'latlng', 'distance', 'altitude', 'velocity_smooth',
                                'cadence', 'watts', 'grade_smooth']

                streams = client.get_activity_streams(a.id,
                                                      types=stream_names)

                # Here we eliminate any data-points from the streams where
                #  latlng is [0,0], which is invalid.  I am not sure if any [0,0] points
                #  actually exist in Strava data but some where there in the original
                #  Garmin data.
                idx = stream_names.index('latlng')
                zipped = zip(
                    *[streams[t].data for t in stream_names if t in streams])
                stream_data = {
                    t: tl for t, tl in
                    zip(stream_names,
                        zip(*[d for d in zipped if d[idx] != [0, 0]])
                        )
                }

                activity_data["polyline"] = (
                    polyline.encode(stream_data.pop('latlng'))
                )
                activity_data.update(stream_data)

            A = Activity(**activity_data)
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
