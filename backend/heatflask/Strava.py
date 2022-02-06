"""
***  For Jupyter notebook ***

Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:

  * %%cython --annotate
      Compile and run the cell

  * %load Strava.py
     Load Strava.py file into this (empty) cell

  * %%writefile Strava.py
      Write the contents of this cell to Strava.py

"""

import os
import time
import aiohttp
from logging import getLogger
import urllib
import msgpack
import polyline
import asyncio

from . import StreamCodecs

log = getLogger(__name__)
log.propagate = True

STRAVA_DOMAIN = "https://www.strava.com"
API_SPEC = "/api/v3"


#
# Authentication
#

AUTH_ENDPOINT = "/oauth/authorize"
AUTH_PARAMS = {
    "client_id": os.environ["STRAVA_CLIENT_ID"],
    "response_type": "code",
    "approval_prompt": "auto",  # or "force"
    "scope": "read,activity:read,activity:read_all",
    "redirect_uri": None,
    "state": None,
}

TOKEN_EXCHANGE_ENDPOINT = "/oauth/token"
TOKEN_EXCHANGE_PARAMS = {
    "client_id": os.environ["STRAVA_CLIENT_ID"],
    "client_secret": os.environ["STRAVA_CLIENT_SECRET"],
    "code": None,
    "grant_type": "authorization_code",
}


def auth_url(redirect_uri=None, state=None):

    params = {**AUTH_PARAMS, "redirect_uri": redirect_uri, "state": state}

    return STRAVA_DOMAIN + AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params)


def StravaSession(headers=None):
    return aiohttp.ClientSession(STRAVA_DOMAIN, headers=headers)


# We can get the access_token for a user either with
# a code obtained via authentication, or with a refresh token
async def get_access_token(code=None, refresh_token=None):
    t0 = time.perf_counter()
    params = {**TOKEN_EXCHANGE_PARAMS}
    params.update(
        {"grant_type": "authorization_code", "code": code}
        if code
        else {"grant_type": "refresh_token", "refresh_token": refresh_token}
    )

    async with StravaSession() as sesh:
        async with sesh.post(TOKEN_EXCHANGE_ENDPOINT, params=params) as response:
            if response.staus == 200:
                log.info("token exchange failed")

        rjson = await response.json()
    elapsed = time.perf_counter() - t0
    method = "authorization code" if code else "refresh token"
    log.info("%s exchange took %.2f", method, elapsed)
    return rjson


#
# Streams
#
POLYLINE_PRECISION = 6
ACTIVITY_STREAM_PARAMS = {
    "keys": "latlng,altitude,time",
    "key_by_type": "true",
    "series_type": "time",
    "resolution": "high",
}


def streams_endpoint(activity_id):
    return f"{API_SPEC}/activities/{activity_id}/streams"


async def get_streams(session, activity_id):
    status = None
    result = None

    t0 = time.perf_counter()
    try:
        async with session.get(
            streams_endpoint(activity_id), params=ACTIVITY_STREAM_PARAMS
        ) as response:
            status = response.status
            rjson = await response.json()

            if (status == 200) and rjson:
                result = msgpack.packb(
                    {
                        "t": StreamCodecs.rlld_encode(rjson["time"]["data"]),
                        "a": StreamCodecs.rlld_encode(rjson["altitude"]["data"]),
                        "p": polyline.encode(
                            rjson["latlng"]["data"], POLYLINE_PRECISION
                        ),
                    }
                )
            elapsed = time.perf_counter() - t0
        log.info("fetching streams for %d took %.1f", activity_id, elapsed)
    except aiohttp.ClientConnectorError:
        pass
    return activity_id, status, result


def unpack_streams(packed_streams):
    streams = msgpack.unpackb(packed_streams)
    return {
        "time": StreamCodecs.rlld_decode(streams["t"], dtype="u2"),
        "altitude": StreamCodecs.rlld_decode(streams["a"], dtype="i2"),
        "latlng": polyline.decode(streams["p"], POLYLINE_PRECISION),
    }


async def get_many_streams(session, activity_ids):
    request_tasks = [
        asyncio.create_task(get_streams(session, aid)) for aid in activity_ids
    ]
    for task in asyncio.as_completed(request_tasks):
        activity_id, status, streams = await task
        if status == 200:
            abort_signal = yield activity_id, streams

        if abort_signal or (status is None):
            log.info("get_many_streams aborted")
            for other_task in request_tasks:
                other_task.cancel()
            await asyncio.wait(request_tasks)
            break


#
# Index pages
#
PER_PAGE = 200
REQUEST_DELAY = 0.2
ACTIVITY_LIST_ENDPOINT = f"{API_SPEC}/athlete/activities"
params = {"per_page": PER_PAGE}


async def get_activity_index_page(session, p):
    t0 = time.perf_counter()
    result = None
    status = None
    try:
        async with session.get(
            ACTIVITY_LIST_ENDPOINT, params={**params, "page": p}
        ) as r:
            status = r.status
            result = await r.json()
    except Exception:
        log.debug("error fetching page %d", p)
    else:
        elapsed_ms = round((time.perf_counter() - t0) * 1000)
        log.debug("retrieved page %d in %d", p, elapsed_ms)
    return p, status, result


def page_request(session, p):
    return asyncio.create_task(get_activity_index_page(session, p))


# sess = aiohttp.ClientSession(STRAVA_DOMAIN, headers=HEADERS)
async def get_index(user_session):

    done_adding_pages = False
    tasks = set([page_request(user_session, 1)])
    next_page = 2
    while tasks:

        if not done_adding_pages:
            # Add a page request task
            tasks.add(page_request(user_session, next_page))
            log.debug("requesting page %d", next_page)
            next_page += 1

        # wait for a moment to check for any completed requests
        finished, unfinished = await asyncio.wait(
            tasks, return_when=asyncio.FIRST_COMPLETED, timeout=REQUEST_DELAY
        )

        for task in finished:
            p, status, entries = task.result()

            if (status == 200) and len(entries):
                for A in entries:
                    yield A
                log.debug("processed %d entries from page %d", len(entries), p)
            elif not done_adding_pages:
                done_adding_pages = True
                log.debug("Done requesting pages (status %d)", status)
        tasks = unfinished


def activity_endpoint(activity_id):
    return f"{API_SPEC}/activities/{activity_id}?include_all_efforts=false"


async def get_activity(user_session, activity_id):
    status = None
    result = None
    try:
        async with user_session.get(activity_endpoint(activity_id)) as r:
            status = r.status
            result = await r.json()
    except Exception:
        log.exception("error fetching activity %d", activity_id)

    return activity_id, status, result


#
# Updates (Webhook subscription)
#
async def create_subscription(session):
    pass


async def delete_subscription(session):
    pass


async def handle_subscription_callback(session):
    pass


"""
    def strava2doc(cls, a):
        if ("id" not in a) or not a["start_latlng"]:
            return

        try:
            polyline = a["map"]["summary_polyline"]
            bounds = Activities.bounds(polyline)
            d = dict(
                _id=a["id"],
                user_id=a["athlete"]["id"],
                name=a["name"],
                type=a["type"],
                # group=a["athlete_count"],
                ts_UTC=a["start_date"],
                ts_local=a["start_date_local"],
                total_distance=float(a["distance"]),
                elapsed_time=int(a["elapsed_time"]),
                average_speed=float(a["average_speed"]),
                start_latlng=a["start_latlng"],
                bounds=bounds,
            )
        except KeyError:
            return
        except Exception:
            log.exception("strava2doc error")
            return
        return d
"""
