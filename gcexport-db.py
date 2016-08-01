#!/usr/bin/python
# -*- coding: utf-8

# Import Garmin Connect data into a PostreSQL database


from __future__ import unicode_literals
from datetime import datetime
from getpass import getpass
import sys
import requests
import logging
import json
import argparse
from sqlalchemy import create_engine
import os

# Local database url
# DATABASE_URL = "postgresql://heatmapp:heatmapp@localhost/heatmapp"

# This is the path of the folder that we put bad gpx files in
BAD_FILES_PATH = './bad_gpx_files'

SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]


CURRENT_DATE = datetime.now().strftime('%Y-%m-%d')

logging.basicConfig(  # filename="import_{}.log".format(CURRENT_DATE),
    format='%(levelname)s:%(message)s',
    level=logging.INFO)

# Turn on logging for SQLAlchemy too
# logging.getLogger('sqlalchemy.engine').setLevel(logging.INFO)


py2 = sys.version_info[0] < 3  # is this python 2?

parser = argparse.ArgumentParser()

parser.add_argument("--username",
                    help=("your Garmin Connect username "
                          "(otherwise, you will be prompted)"),
                    nargs='?')

parser.add_argument("--password",
                    help=("your Garmin Connect password "
                          "(otherwise, you will be prompted)"),
                    nargs='?')

parser.add_argument('-c', '--count', nargs='?', default="1",
                    help=("number of recent activities to download, or 'all'"
                          " (default: 1)"))

parser.add_argument('--clean', action='store_true', default=False)

args = parser.parse_args()

logging.info('Welcome to Garmin Connect Exporter!')


if args.username:
    username = args.username
else:
    username = raw_input('Username: ') if py2 else input('Username: ')

password = args.password if args.password else getpass()

# Maximum number of activities you can request at once.  Set and enforced
# by Garmin.
limit_maximum = 100

# URLs for various services.
url_gc_login = ("https://sso.garmin.com/sso/login?"
                "service=https://connect.garmin.com/post-auth/login"
                "&webhost=olaxpw-connect04"
                "&source=https://connect.garmin.com/en-US/signin"
                "&redirectAfterAccountLoginUrl=https://connect.garmin.com/post-auth/login"
                "&redirectAfterAccountCreationUrl=https://connect.garmin.com/post-auth/login"
                "&gauthHost=https://sso.garmin.com/sso"
                "&locale=en_US"
                "&id=gauth-widget"
                "&cssUrl=https://staticonn.garmincdn.com/com.garmin.connect/ui/css/gauth-custom-v1.1-min.css"
                "&clientId=GarminConnect"
                "&rememberMeShown=true"
                "&rememberMeChecked=false"
                "&createAccountShown=true"
                "&openCreateAccount=false"
                "&usernameShown=false"
                "&displayNameShown=false"
                "&consumeServiceTicket=false"
                "&initialFocus=true"
                "&embedWidget=false"
                "&generateExtraServiceTicket=false")

url_gc_post_auth = 'https://connect.garmin.com/post-auth/login?'

url_gc_search = 'http://connect.garmin.com/proxy/activity-search-service-1.0/json/activities?'
url_gc_activity_details = "https://connect.garmin.com/modern/proxy/activity-service-1.3/json/activityDetails/"


def logged_in_session(username, password):
    # Create a session that will persist throughout this script
    sesh = requests.Session()

    sesh.headers['User-Agent'] = ("Mozilla/5.0 (X11; Linux x86_64) "
                                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                                  "Chrome/29.0.1547.62 Safari/537.36")

    # Initially, we need to get a valid session cookie,
    # so we pull the login page.
    r1 = sesh.get(url_gc_login)

    # Now we'll actually login, using
    # fields that are passed in a typical Garmin login.
    post_data = {
        'username': username,
        'password': password,
        'embed': 'true',
        'lt': 'e1s1',
        '_eventId': 'submit',
        'displayNameRequired': 'false'
    }

    r2 = sesh.post(url_gc_login, data=post_data)

    if "CASTGC" in r2.cookies:
        # Construct login ticket from the  cookie with "CASTCG" key
        login_ticket = "ST-0" + r2.cookies["CASTGC"][4:]

    else:
        raise Exception(
            "Did not get a ticket cookie. Cannot log in."
            " Did you enter the correct username and password?"
        )

    r3 = sesh.post(url_gc_post_auth, params={"ticket": login_ticket})

    return sesh


sesh = logged_in_session(username, password)


# We should be logged in now.
db = create_engine(SQLALCHEMY_DATABASE_URI)
with db.connect() as conn:

    if args.clean:
        logging.info("Clean import")
        conn.execute("DROP TABLE IF EXISTS activities;")
        args.count = "all"

    conn.execute("CREATE TABLE IF NOT EXISTS activities("
                 "id               INTEGER       PRIMARY KEY,"
                 "beginTimestamp   TIMESTAMP,"
                 "summary          JSON,"
                 "elapsed          INTEGER ARRAY,"
                 "latitudes        DOUBLE PRECISION ARRAY,"
                 "longitudes       DOUBLE PRECISION ARRAY"
                 ");")

    # Now we populate a set with the ids of activities that already exist
    #  in our database.
    result = conn.execute("SELECT id FROM activities;")

    already_got = set(tupp[0] for tupp in result.fetchall())

    download_all = False

    if args.count == 'all':
        # If the user wants to download all activities, first download one,
        # then the result of that request will tell us how many are available
        # so we will modify the variables then.
        total_to_download = 1
        download_all = True
    else:
        total_to_download = int(args.count)

    total_downloaded = 0

    # This while loop will download data from the server in multiple chunks,
    # if necessary.
    while total_downloaded < total_to_download:
        # Maximum of 100... 400 return status if over 100.  So download 100 or
        # whatever remains if less than 100.
        if total_to_download - total_downloaded > 100:
            num_to_download = 100
        else:
            num_to_download = total_to_download - total_downloaded

        search_params = {'start': total_downloaded, 'limit': num_to_download}

        # Query Garmin Connect
        # TODO: Catch possible exceptions here.
        json_results = sesh.get(url_gc_search, params=search_params).json()

        search = json_results['results']['search']

        if download_all:
            # Modify total_to_download based on how many activities the server
            # reports.
            total_to_download = int(search['totalFound'])
            # Do it only once.
            download_all = False

        # Pull out just the list of activities.
        activities = json_results['results']['activities']

        # Process each activity.
        for a in activities:
            A = a['activity']

            id = int(A['activityId'])

            # Increase the count now, since we want to count skipped files.
            total_downloaded += 1

            if id in already_got:
                logging.info("activity %s already in database.", id)
            else:
                beginTimestamp = A['beginTimestamp']['display']
                # Display which entry we're working on.
                info = {
                    "id": id,
                    "name": A['activityName']['value'],
                    "starting": A['beginTimestamp']['display'],
                    "dur": (A["sumElapsedDuration"]["display"]
                            if "sumElapsedDuration" in A else "??:??:??"),
                    "dist": (A["sumDistance"]["withUnit"]
                             if "sumElapsedDuration" in A else "0.00 Miles")
                }

                logging.info("[{id}] {name}: {starting}, {dur}, {dist}"
                             .format(**info))

                download_url = (url_gc_activity_details +
                                str(info["id"]) +
                                "?maxSize=999999999")

                logging.info('Attempting download of activity track...')

                try:
                    response = sesh.get(download_url)
                except:
                    logging.info("...failed. Skipping download.")

                else:
                    try:
                        dj = response.json()[
                            "com.garmin.activity.details.json.ActivityDetails"]

                        activity = {}

                        for m in dj.setdefault("measurements", {}):
                            name = m["key"]
                            idx = m["metricsIndex"]

                            activity[name] = [metric["metrics"][idx]
                                              for metric in dj["metrics"]]

                    except Exception as e:
                        logging.info("Problem with activity %s:%s", id, e)
                        if not os.path.isdir(BAD_FILES_PATH):
                            os.mkdir(BAD_FILES_PATH)

                        fname = "{}_bad".format(id)
                        file_path = os.path.join(BAD_FILES_PATH, fname)
                        with open(file_path, "wb") as save_file:
                            save_file.write(response.content)

                    else:
                        lats = activity.setdefault("directLatitude", [])
                        lngs = activity.setdefault("directLongitude", [])
                        time = activity.setdefault("sumElapsedDuration", [])

                        if lats:
                            values = (id, beginTimestamp, json.dumps(A),
                                      time, lats, lngs)

                            conn.execute("INSERT INTO activities "
                                         "(id, beginTimestamp, summary, "
                                         "elapsed, latitudes, longitudes) "
                                         "VALUES (%s,%s,%s,%s,%s,%s);", values)

                            logging.info('Done. time series data saved.')
                        else:
                            logging.info('Activity %s has no GIS points.')

        logging.info("Chunk done!")
logging.info('Done!')
