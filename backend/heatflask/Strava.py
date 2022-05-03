"""
***  For Jupyter notebook ***
Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:
    %%cython --annotate     # Compile and run the cell
    %load Strava.py         # Load Strava.py file into this (empty) cell
    %%writefile Strava.py   # Write the contents of this cell to Strava.py
"""

import os
import time
import aiohttp
from logging import getLogger
import urllib
import asyncio
import datetime
import types
from typing import AsyncGenerator, TypedDict, Tuple, Literal, cast, get_args


from . import Utility

log = getLogger(__name__)
log.propagate = True
log.setLevel("INFO")

DOMAIN = "https://www.strava.com"
STALE_TOKEN = 300
CONCURRENCY = 10

myBox = types.SimpleNamespace(limiter=None)

# These activity types are ordered
ActivityType = Literal[
    "AlpineSki",
    "BackcountrySki",
    "Canoeing",
    "Crossfit",
    "EBikeRide",
    "Elliptical",
    "Golf",
    "Handcycle",
    "Hike",
    "IceSkate",
    "InlineSkate",
    "Kayaking",
    "Kitesurf",
    "NordicSki",
    "Ride",
    "RockClimbing",
    "RollerSki",
    "Rowing",
    "Run",
    "Sail",
    "Skateboard",
    "Snowboard",
    "Snowshoe",
    "Soccer",
    "StairStepper",
    "StandUpPaddling",
    "Surfing",
    "Swim",
    "Velomobile",
    "VirtualRide",
    "VirtualRun",
    "Walk",
    "WeightTraining",
    "Wheelchair",
    "Windsurf",
    "Workout",
    "Yoga",
]

ATYPES: Tuple[ActivityType, ...] = get_args(ActivityType)

ATYPES_LOOKUP: dict[ActivityType, int] = {atype: i for i, atype in enumerate(ATYPES)}


def streams_endpoint(activity_id: int) -> str:
    return f"{API_SPEC}/activities/{activity_id}/streams"


def get_limiter():
    if myBox.limiter is None:
        myBox.limiter = asyncio.Semaphore(CONCURRENCY)
    return myBox.limiter


# Client class takes care of refreshing access tokens
class AsyncClient:
    name: str
    session: aiohttp.ClientSession
    access_token: str
    refresh_token: str
    expires_at: int

    def __init__(self, name, **auth_data):
        self.name = name
        self.set_state(**auth_data)
        self.session = None

    def set_state(
        self, access_token=None, expires_at=None, refresh_token=None, **extra
    ):
        self.access_token = access_token
        self.expires_at = expires_at
        self.refresh_token = refresh_token

    def __repr__(self):
        s = f"<AsyncClient '{self.name}'"
        if self.expires_at:
            expires_at_str = datetime.datetime.fromtimestamp(self.expires_at)
            s += f" expires-{expires_at_str}>"
        return s

    @property
    def expires_in(self):
        if self.expires_at:
            return self.expires_at - round(time.time())

    @property
    def headers(self):
        if self.access_token:
            return {"Authorization": f"Bearer {self.access_token}"}

    def new_session(self) -> aiohttp.ClientSession:
        return aiohttp.ClientSession(
            DOMAIN, headers=self.headers, raise_for_status=True
        )

    async def __aenter__(self):
        self.session = self.new_session()
        log.debug("opening new aiohttp session")
        await self.update_access_token()

    async def __aexit__(self, *args):
        await self.session.close()
        log.debug("closed session")
        self.session = None

    async def __run_with_session(self, func, *args, raise_exception=False, **kwargs):
        in_context = self.session is not None

        if not in_context:
            await self.__aenter__()

        try:
            result = await func(self.session, *args, **kwargs)
        except Exception:
            if raise_exception:
                await self.__aexit__()
                raise
            log.exception("%s, %s", self, func)
            return

        if not in_context:
            await self.__aexit__()

        return result

    @staticmethod
    async def abort(async_iterator):
        try:
            await async_iterator.asend(1)
        except StopAsyncIteration:
            pass

    async def __iterate_with_session(
        self, func, *args, raise_exception=False, **kwargs
    ):
        in_context = self.session is not None

        if not in_context:
            await self.__aenter__()

        aiterator = func(self.session, *args, **kwargs)
        try:
            async for item in aiterator:
                abort_signal = yield item
                if abort_signal:
                    await self.__class__.abort(aiterator)
                    break
        except Exception:
            if raise_exception:
                await self.__aexit__()
                raise
            else:
                log.exception("%s, %s", self, func)

        if not in_context:
            await self.__aexit__()

    async def update_access_token(self, stale_ttl=STALE_TOKEN, code=None):
        if not (code or (self.refresh_token and (self.expires_in < stale_ttl))):
            log.debug("access token is current")
            return

        t0 = time.perf_counter()

        session = self.session or self.new_session()

        try:
            new_auth_info = await get_access_token(
                session, code=code, refresh_token=self.refresh_token
            )
        except Exception:
            new_auth_info = None

        if not self.session:
            await session.close()

        if not (new_auth_info and new_auth_info.get("refresh_token")):
            return

        del new_auth_info["expires_in"]
        del new_auth_info["token_type"]

        self.set_state(**new_auth_info)

        # If we are inside a session-context
        if self.session:
            await self.session.close()
            self.session = self.new_session()

        elapsed = (time.perf_counter() - t0) * 1000
        log.info("%s token refresh took %d", self.name, elapsed)

        return new_auth_info

    def deauthenticate(self, *args, **kwargs):
        return self.__run_with_session(deauth, *args, **kwargs)

    def get_athlete(self, *args, **kwargs):
        return self.__run_with_session(get_athlete, *args, **kwargs)

    def get_streams(self, *args, **kwargs):
        return self.__run_with_session(get_streams, *args, **kwargs)

    def get_activity(self, *args, **kwargs):
        return self.__run_with_session(get_activity, *args, **kwargs)

    def get_index(self, *args, **kwargs):
        return self.__iterate_with_session(get_index, *args, **kwargs)

    def get_many_streams(self, *args, **kwargs):
        return self.__iterate_with_session(get_many_streams, *args, **kwargs)

    def create_subscription(self, *args, **kwargs):
        return self.__run_with_session(create_subscription, *args, **kwargs)

    def view_subscription(self, *args, **kwargs):
        return self.__run_with_session(view_subscription, *args, **kwargs)

    def delete_subscription(self, *args, **kwargs):
        return self.__run_with_session(delete_subscription, *args, **kwargs)


# *********************************************************************************************
API_SPEC = "/api/v3"

#
# Authentication
#
SpecsDict = dict[str, str | None]

AUTH_ENDPOINT = "/oauth/authorize"
AUTH_PARAMS: SpecsDict = {
    "client_id": os.environ["STRAVA_CLIENT_ID"],
    "client_secret": os.environ["STRAVA_CLIENT_SECRET"],
}
AUTH_URL_PARAMS = {
    **AUTH_PARAMS,
    "client_secret": None,
    "response_type": "code",
    "approval_prompt": "force",  # or "force"
    "scope": "read,activity:read,activity:read_all",
    "redirect_uri": None,
    "state": None,
}

TOKEN_EXCHANGE_ENDPOINT = "/oauth/token"
TOKEN_EXCHANGE_PARAMS = {
    **AUTH_PARAMS,
    "code": None,
    "grant_type": "authorization_code",
}


DEAUTH_ENDPOINT = "/oauth/deauthorize"
CLOSE_SESSION_ENDPOINT = "/logout"

LOGOUT_URL = f"{DOMAIN}{CLOSE_SESSION_ENDPOINT}"


def auth_url(redirect_uri="http://localhost/exchange_token", **kwargs):
    params = Utility.cleandict(
        {**AUTH_URL_PARAMS, "redirect_uri": redirect_uri, **kwargs}
    )
    paramstr = urllib.parse.urlencode(params, safe=",:")
    return DOMAIN + AUTH_ENDPOINT + "?" + paramstr


# We can get the access_token for a user either with
# a code obtained via authentication, or with a refresh token
async def get_access_token(session=None, code=None, refresh_token=None):
    log.debug("refreshing access token from %s", "code" if code else "refresh_token")

    params = {**TOKEN_EXCHANGE_PARAMS}
    params.update(
        {"grant_type": "authorization_code", "code": code}
        if code
        else {"grant_type": "refresh_token", "refresh_token": refresh_token}
    )
    params = Utility.cleandict(params)
    async with session.post(TOKEN_EXCHANGE_ENDPOINT, params=params) as response:
        rjson = await response.json()
    return rjson


async def deauth(session):
    log.debug("  deauthenticating")
    async with session.post(DEAUTH_ENDPOINT) as response:
        return await response.json()


#
# Athlete
#
ATHLETE_ENDPOINT = f"{API_SPEC}/athlete"


async def get_athlete(session):
    log.debug("  getting Athlete")
    async with session.get(ATHLETE_ENDPOINT) as response:
        return await response.json()


#
# Streams
#
MAX_STREAMS_ERRORS = 10
ACTIVITY_STREAM_PARAMS = {
    "keys": "latlng,altitude,time",
    "key_by_type": "true",
    "series_type": "time",
    "resolution": "high",
}


class Stream(TypedDict):
    """A single stream object as it comes from Strava's API"""

    original_size: int
    resolution: str
    series_type: str


class TimeStream(Stream):
    data: list[int]


class AltitudeStream(Stream):
    data: list[float]


class LatLngStream(Stream):
    data: list[tuple[float, float]]


class Streams(TypedDict):
    """A Streams object as it comes from Strava's API"""

    time: TimeStream
    altitude: AltitudeStream
    latlng: LatLngStream


StreamsFetchResult = tuple[int, Streams | None]
StreamsResult = tuple[int, Streams]


async def get_streams(
    session: aiohttp.ClientSession, activity_id: int
) -> StreamsFetchResult:
    t0 = time.perf_counter()
    async with get_limiter():
        try:
            async with session.get(
                streams_endpoint(activity_id), params=ACTIVITY_STREAM_PARAMS
            ) as response:
                rjson = await response.json()
                rstatus = response.status
        except Exception as e:
            log.error("Error fetching streams for %s: %s", activity_id, e)
            return activity_id, None

    if not (rjson and ("time" in rjson)):
        log.info("problem with activity %d: %s", activity_id, (rstatus, rjson))
        return activity_id, None

    dt_fetch = (time.perf_counter() - t0) * 1000
    n = rjson["time"]["original_size"]
    log.debug("streams %d: n=%d, dt=%d", activity_id, n, dt_fetch)

    return activity_id, cast(Streams, rjson)


async def get_many_streams(
    session: aiohttp.ClientSession,
    activity_ids: list[int],
    max_errors=MAX_STREAMS_ERRORS,
) -> AsyncGenerator[StreamsResult, bool]:
    request_tasks = [get_streams(session, aid) for aid in activity_ids]
    errors = 0
    for task in asyncio.as_completed(request_tasks):
        item = await task
        if item[1]:
            abort_signal = yield cast(StreamsResult, item)
        else:
            errors += 1
            if errors > max_errors:
                abort_signal = True
        if abort_signal:
            log.info("get_many_streams aborted")
            return


#
# Index pages
#
class MetaAthlete(TypedDict):
    id: int


class PolylineMap(TypedDict):
    summary_polyline: str


Visibility = Literal["everyone", "followers", "only_me"]


class Activity(TypedDict):
    id: int
    athlete: MetaAthlete
    name: str
    distance: float
    moving_time: int
    elapsed_time: int
    total_elevation_gain: float
    type: ActivityType
    start_date: int
    utc_offset: int
    athlete_count: int
    total_photo_count: int
    map: PolylineMap
    commute: bool
    private: bool
    visibility: Visibility


PER_PAGE = 200
ACTIVITY_LIST_ENDPOINT = f"{API_SPEC}/athlete/activities"
params = {"per_page": PER_PAGE}


async def get_activity_index_page(
    session: aiohttp.ClientSession, p: int
) -> tuple[int, int, list[str]]:
    t0 = time.perf_counter()
    async with get_limiter():
        log.debug("Page %d requested", p)
        async with session.get(
            ACTIVITY_LIST_ENDPOINT, params={**params, "page": p}
        ) as r:
            status = r.status
            result = await r.json()

    elapsed_ms = (time.perf_counter() - t0) * 1000
    log.debug("Page %d retrieved in %d", p, elapsed_ms)
    return status, p, result


def page_request(session: aiohttp.ClientSession, p: int):
    return asyncio.create_task(get_activity_index_page(session, p), name=str(p))


def cancel_all(tasks):
    for task in tasks:
        task.cancel()
    return asyncio.wait(tasks)


MAX_PAGE = 50


async def get_index(
    user_session: aiohttp.ClientSession,
) -> AsyncGenerator[Activity, bool]:
    log.debug("getting user index")

    t0 = time.perf_counter()
    tasks = [page_request(user_session, p) for p in range(1, MAX_PAGE)]
    last_page = MAX_PAGE

    while tasks:
        done, not_done = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            try:
                status, page, result = task.result()
            except asyncio.CancelledError:
                continue
            except Exception:
                log.exception("error fetching index page. aborting.")
                await cancel_all(tasks)
                raise

            if result and len(result):
                for A in result:
                    abort_signal = yield cast(Activity, A)
                    if abort_signal:
                        await cancel_all(tasks)
                        log.debug("index fetch aborted")
                        return
                log.debug("done with page %d", page)
            else:
                # If this page has no results then any further pages will
                # also be empty so we cancel them
                elapsed = (time.perf_counter() - t0) * 1000
                if page < last_page:
                    log.debug("found last page (%d) in %d", page - 1, elapsed)
                    log.debug("cancelling page %d - %d requests", page + 1, last_page)
                    for task in tasks:
                        p = int(task.get_name())
                        if (page < p) and (p <= last_page):
                            task.cancel()
                    last_page = page
        tasks = not_done


def activity_endpoint(activity_id: int) -> str:
    return f"{API_SPEC}/activities/{activity_id}?include_all_efforts=false"


async def get_activity(
    user_session: aiohttp.ClientSession, activity_id: int
) -> Activity | None:
    log.debug("fetching activity %d", activity_id)
    async with user_session.get(activity_endpoint(activity_id)) as r:
        return await r.json()


#
# Updates (Webhook subscription)
#
SUBSCRIPTION_VERIFY_TOKEN = "heatflask_yay!"
SUBSCRIPTION_ENDPOINT = f"{API_SPEC}/push_subscriptions"
CREATE_SUBSCRIPTION_PARAMS = {
    **AUTH_PARAMS,
    "verify_token": SUBSCRIPTION_VERIFY_TOKEN,
    "callback_url": None,
}
VIEW_SUBSCRIPTION_PARAMS = AUTH_PARAMS
DELETE_SUBSCRIPTION_PARAMS: SpecsDict = {
    **VIEW_SUBSCRIPTION_PARAMS,
    "id": None,
}


async def create_subscription(admin_session: aiohttp.ClientSession, callback_url: str):
    params: SpecsDict = {**CREATE_SUBSCRIPTION_PARAMS, "callback_url": callback_url}
    async with admin_session.post(SUBSCRIPTION_ENDPOINT, params=params) as response:
        return await response.json()


# After calling create_subscription, you will receive a GET request at your
# supplied callback_url, whose json body is validation_dict.
#
# Your response must have HTTP code 200 and be of application/json content type.
# and be the return value of this function.
def subscription_verification(validation_dict):
    if validation_dict.get("hub.verify_token") != SUBSCRIPTION_VERIFY_TOKEN:
        return {"hub.challenge": validation_dict["hub.challenge"]}


async def view_subscription(admin_session: aiohttp.ClientSession):
    params = VIEW_SUBSCRIPTION_PARAMS
    async with admin_session.get(SUBSCRIPTION_ENDPOINT, params=params) as response:
        return await response.json()


async def delete_subscription(
    admin_session: aiohttp.ClientSession, subscription_id=None
):
    params = {**DELETE_SUBSCRIPTION_PARAMS, "id": subscription_id}
    async with admin_session.delete(SUBSCRIPTION_ENDPOINT, params=params) as response:
        return response.status == 204
