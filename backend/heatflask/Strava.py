# Heatflask -- Copyright (C) 2016-2026 Efrem Rensi
# SPDX-License-Identifier: AGPL-3.0-or-later
# This file is part of Heatflask. See /LICENSE for terms.
import os
import time
import aiohttp
from logging import getLogger
import urllib.parse
import asyncio
import datetime
import weakref
from typing import (
    AsyncGenerator,
    Callable,
    Awaitable,
    Optional,
    TypedDict,
    Tuple,
    Literal,
    Protocol,
    Final,
    cast,
    get_args,
    Any,
)


from .Types import epoch, urlstr
from .RateLimit import limiter, Priority, RateLimitExceeded

log = getLogger(__name__)
log.propagate = True
log.setLevel("INFO")

API_SPEC = "/api/v3"
DOMAIN = "https://www.strava.com"

STALE_TOKEN: Final = 300  # Refresh access token if only this many seconds left


def log_failure(client, func, e: Exception) -> None:
    """
    Log a failed call without its URL. An aiohttp ClientResponseError's text
    includes the request URL, and the subscription endpoints take
    client_secret in the query string.
    """
    if isinstance(e, aiohttp.ClientResponseError):
        log.warning(
            "%s, %s: %s %s (%s)",
            client,
            getattr(func, "__name__", func),
            e.status,
            e.message,
            e.request_info.url.path if e.request_info else "",
        )
    else:
        log.exception("%s, %s", client, func)


async def api_request(
    session: aiohttp.ClientSession,
    method: str,
    url: str,
    *,
    bulk: bool = False,
    owner: Optional[int] = None,
    priority: Priority = Priority.TRACKS,
    on_sent: Optional[Callable[[], None]] = None,
    **kwargs: Any,
) -> tuple[int, Any]:
    """
    Make one Strava API request inside the rate limit. Returns (status, json).

    `bulk` marks work that can wait for the budget -- stream and index
    imports -- as opposed to a request someone is waiting on. See RateLimit.
    `owner` is the athlete bulk work is for, so the window can be shared
    fairly between athletes. `priority` says which bulk work goes first.

    `on_sent` is called once the request has cleared the rate limit and is
    going out, which is the point from which it costs a request whether or
    not anyone reads the answer.

    Sessions are made with raise_for_status=True, so a 429 arrives as a
    ClientResponseError. Its headers still carry Strava's usage counts. Bulk
    requests refused that way wait for the window to reset and try once more;
    anything else raises RateLimitExceeded.
    """
    for attempt in range(2):
        async with limiter.slot(
            method, bulk=bulk, owner=owner, priority=priority
        ) as sent:
            if on_sent:
                on_sent()
            try:
                async with session.request(method, url, **kwargs) as response:
                    limiter.report(method, response.headers, sent)
                    return response.status, await response.json()
            except aiohttp.ClientResponseError as e:
                if e.status != 429:
                    limiter.report(method, e.headers, sent)
                    raise
                limiter.refused(method, e.headers, sent)
                if not bulk or attempt:
                    # check() raises the right RateLimitExceeded, daily or not
                    limiter.check(method, bulk=False, now=time.time())
                    raise RateLimitExceeded(time.time())
    raise AssertionError("unreachable: the second attempt returns or raises")


# ---------------------------------------------------------------------------- #
#                                    Athlete                                   #
#   https://developers.strava.com/docs/reference/#api-models-DetailedAthlete   #
# ---------------------------------------------------------------------------- #


class Athlete(TypedDict):
    id: int
    firstname: str
    lastname: str
    profile_medium: urlstr
    profile: urlstr
    city: str
    state: str
    country: str


ATHLETE_ENDPOINT = f"{API_SPEC}/athlete"


async def get_athlete(session: aiohttp.ClientSession):
    log.debug("  getting Athlete")
    status, athlete = await api_request(session, "GET", ATHLETE_ENDPOINT)
    return cast(Athlete, athlete)


# ---------------------------------------------------------------------------- #
#                                    Streams                                   #
#      https://developers.strava.com/docs/reference/#api-Streams               #
# ---------------------------------------------------------------------------- #


MAX_STREAMS_ERRORS = 10  # We quit a streams import if this many fetches fail

StreamName = Literal[
    "time",
    "distance",
    "latlng",
    "altitude",
    "velocity_smooth",
    "heartrate",
    "cadence",
    "watts",
    "temp",
    "moving",
    "grade_smooth",
]


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


class StreamsRequestParams(TypedDict):
    id: int
    keys: str
    key_by_type: Literal["true"]


KEYS: list[StreamName] = ["latlng", "altitude", "time"]
KEYS_STR = ",".join(KEYS)


def STREAMS_ENDPOINT(activity_id: int) -> str:
    return f"{API_SPEC}/activities/{activity_id}/streams"


async def get_streams(
    session: aiohttp.ClientSession,
    activity_id: int,
    on_sent: Optional[Callable[[], None]] = None,
    owner: Optional[int] = None,
) -> StreamsFetchResult:
    t0 = time.perf_counter()

    request_params = StreamsRequestParams(
        id=activity_id, keys=KEYS_STR, key_by_type="true"
    )
    try:
        rstatus, rjson = await api_request(
            session,
            "GET",
            STREAMS_ENDPOINT(activity_id),
            bulk=True,
            owner=owner,
            on_sent=on_sent,
            params=request_params,
        )
    except RateLimitExceeded:
        # Not a problem with this activity, so not counted as one
        raise
    except Exception as e:
        log.error("Error fetching streams for %s: %s", activity_id, e)
        return activity_id, None

    if not (rjson and ("time" in rjson)):
        log.info("problem with activity %d: %s", activity_id, (rstatus, rjson))
        return activity_id, None

    streams = cast(Streams, rjson)

    dt_fetch = (time.perf_counter() - t0) * 1000
    n = streams["time"]["original_size"]
    log.debug("streams %d: n=%d, dt=%d", activity_id, n, dt_fetch)

    return activity_id, streams


async def get_many_streams(
    session: aiohttp.ClientSession,
    activity_ids: list[int],
    max_errors=MAX_STREAMS_ERRORS,
    leftovers: Optional[list[StreamsResult]] = None,
    owner: Optional[int] = None,
    on_sent: Optional[Callable[[], None]] = None,
) -> AsyncGenerator[StreamsResult, None]:
    """
    Yield streams for these activities in whatever order they arrive.

    Stop early with aclose(). Requests run as tasks, at most STREAMS_WINDOW
    of them at a time counting the ones finished but not yet taken, and a
    new one starts only as a result is taken. Each result is let go once it
    has been yielded.

    All of them used to be started up front and kept until the import ended,
    and each finished task held on to its parsed streams -- a couple of MB of
    Python lists for a long ride. An import of a few hundred activities held
    every one of them at once, which took the 512MB dyno past 1GB and got it
    killed, over and over, on 2026-09-16.

    Tasks do not stop just because nobody is reading their results, so the
    finally clause deals with the ones still in the window:

      * Requests still waiting on the rate limit are cancelled. They have cost
        nothing yet, and now never will.

      * Requests already sent have cost a request whatever happens, so they
        are given up to IN_FLIGHT_GRACE seconds to finish rather than thrown
        away.

      * Streams that arrived but were never yielded -- finished while the
        consumer was busy, or in that grace period -- are appended to
        `leftovers`, if given, so the caller can still keep them.

    `on_sent` is called once for every request that goes out, as in
    api_request.

    Raises RateLimitExceeded when Strava's daily budget is spent.
    """
    sent: set[int] = set()

    def request(aid: int):
        def was_sent():
            sent.add(aid)
            if on_sent:
                on_sent()

        return get_streams(session, aid, on_sent=was_sent, owner=owner)

    remaining = iter(activity_ids)
    # started and not yet taken, whether finished or not
    window: dict[asyncio.Task, int] = {}

    def fill_window():
        while len(window) < STREAMS_WINDOW:
            aid = next(remaining, None)
            if aid is None:
                return
            window[asyncio.create_task(request(aid))] = aid

    errors = 0
    try:
        fill_window()
        while window:
            done, _ = await asyncio.wait(window, return_when=asyncio.FIRST_COMPLETED)
            task = next(iter(done))
            del window[task]
            item = task.result()
            fill_window()
            if item[1]:
                yield cast(StreamsResult, item)
            else:
                errors += 1
                if errors > max_errors:
                    log.info("get_many_streams: too many errors, stopping")
                    return
            del item
    finally:
        await see_through(settle(window, sent))

        if leftovers is not None:
            for task in window:
                if task.cancelled() or task.exception():
                    continue
                result = task.result()
                if result[1]:
                    leftovers.append(cast(StreamsResult, result))


# How many stream requests are alive at once, counting those that have
# finished but not been taken. Twice the limiter's concurrency, so a slow
# consumer does not starve the requests of work.
STREAMS_WINDOW = 20

# How long an abandoned import waits for requests that are already out
IN_FLIGHT_GRACE = 10


async def see_through(coro) -> None:
    """
    Run coro to the end even if this task is cancelled meanwhile.

    A browser that goes away gets its handler cancelled, and that can land in
    the middle of an import's clean-up, which already has an exception on its
    way out. Interrupted, the clean-up never collects the leftovers and the
    streams already paid for are never saved. settle() is bounded by
    IN_FLIGHT_GRACE, so it is waited for, and the cancellation dropped.
    """
    task = asyncio.ensure_future(coro)
    while True:
        try:
            await asyncio.shield(task)
            return
        except asyncio.CancelledError:
            if task.done():
                raise
            current = asyncio.current_task()
            if current:
                current.uncancel()


async def settle(tasks: dict[asyncio.Task, int], sent: set[int]) -> None:
    """Cancel the requests not yet sent, and let the sent ones finish"""
    unsent = [t for t, aid in tasks.items() if not t.done() and aid not in sent]
    for task in unsent:
        task.cancel()

    in_flight = [t for t in tasks if not t.done() and t not in unsent]
    if in_flight:
        done, late = await asyncio.wait(in_flight, timeout=IN_FLIGHT_GRACE)
        for task in late:
            task.cancel()

    # Wait until every task has really stopped, while the session they use is
    # still open, and collect exceptions so none is reported as unretrieved
    await asyncio.gather(*tasks, return_exceptions=True)
    if unsent:
        log.info("get_many_streams: cancelled %d unsent requests", len(unsent))


# ---------------------------------------------------------------------------- #
#                          Activity Summaries (Index)                          #
#    see https://developers.strava.com/docs/reference/#api-Activities          #
# ---------------------------------------------------------------------------- #

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

# Strava's finer-grained replacement for ActivityType: it tells a trail run from
# a road run, and a gravel ride from a mountain bike ride. The query filter is
# by these. See https://developers.strava.com/swagger/sport_type.json
SportType = Literal[
    "AlpineSki",
    "BackcountrySki",
    "Badminton",
    "Basketball",
    "Canoeing",
    "Cricket",
    "Crossfit",
    "Dance",
    "EBikeRide",
    "Elliptical",
    "EMountainBikeRide",
    "Golf",
    "GravelRide",
    "Handcycle",
    "HighIntensityIntervalTraining",
    "Hike",
    "IceSkate",
    "InlineSkate",
    "Kayaking",
    "Kitesurf",
    "MountainBikeRide",
    "NordicSki",
    "Padel",
    "PhysicalTherapy",
    "Pickleball",
    "Pilates",
    "Racquetball",
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
    "Squash",
    "StairStepper",
    "StandUpPaddling",
    "Surfing",
    "Swim",
    "TableTennis",
    "Tennis",
    "TrailRun",
    "Velomobile",
    "VirtualRide",
    "VirtualRow",
    "VirtualRun",
    "Volleyball",
    "Walk",
    "WeightTraining",
    "Wheelchair",
    "Windsurf",
    "Workout",
    "Yoga",
]

SPORT_TYPES: Tuple[SportType, ...] = get_args(SportType)


def legacy_type(sport_type: str) -> str:
    """
    The ActivityType Strava gives an activity of this sport_type. Index
    entries made before we stored sport_type have only this, so it is the
    closest a filter can come for them: a TrailRun filter matches every one
    of their Runs. The sport types newer than ActivityType are all Workouts.
    """
    if sport_type in ATYPES:
        return sport_type
    return {
        "MountainBikeRide": "Ride",
        "GravelRide": "Ride",
        "EMountainBikeRide": "EBikeRide",
        "TrailRun": "Run",
        "VirtualRow": "Rowing",
    }.get(sport_type, "Workout")


class MetaAthlete(TypedDict):
    id: int


class PolylineMap(TypedDict):
    summary_polyline: str


Visibility = Literal["everyone", "followers", "only_me"]


class Activity(TypedDict):
    """selected fields from SummaryActivity
    https://developers.strava.com/docs/reference/#api-models-SummaryActivity
    """

    id: int
    athlete: MetaAthlete
    name: str
    distance: float
    moving_time: int
    elapsed_time: int
    total_elevation_gain: float
    type: ActivityType
    sport_type: SportType
    start_date: int
    utc_offset: int
    athlete_count: int
    total_photo_count: int
    map: PolylineMap
    commute: bool
    private: bool
    visibility: Visibility


class ActivitiesPageRequestParams(TypedDict):
    before: epoch
    after: epoch
    page: int
    per_page: int


PER_PAGE = 200

# How many index pages to request at once after the first. Nobody knows how
# many pages there are until one comes back short, so every page fetched past
# that one is a wasted request: at most PAGE_BATCH - 1 per import.
#
# This used to request pages 1-49 at once and cancel the rest when one came
# back empty, which with ten in flight spent up to ten requests to learn what
# two would tell it -- and quietly stopped at 49 x 200 = 9,800 activities.
PAGE_BATCH = 4

# Not a real limit, just a guard against paging forever if Strava misbehaves:
# 200,000 activities
MAX_PAGE = 1000

ACTIVITY_LIST_ENDPOINT = f"{API_SPEC}/athlete/activities"
params = {"per_page": PER_PAGE}


async def get_activity_index_page(
    session: aiohttp.ClientSession,
    page: int,
    bulk: bool = True,
    on_sent: Optional[Callable[[], None]] = None,
    **extra: Any,
) -> list[Activity]:
    t0 = time.perf_counter()
    status, result = await api_request(
        session,
        "GET",
        ACTIVITY_LIST_ENDPOINT,
        bulk=bulk,
        # an athlete's index goes ahead of everyone's track imports
        priority=Priority.INDEX,
        on_sent=on_sent,
        params={**params, **extra, "page": page},
    )
    elapsed_ms = (time.perf_counter() - t0) * 1000
    log.debug("Page %d retrieved in %d", page, elapsed_ms)
    return result or []


async def get_all_activities(
    user_session: aiohttp.ClientSession,
    on_sent: Optional[Callable[[], None]] = None,
) -> AsyncGenerator[Activity, None]:
    """
    Yield every one of the athlete's activities, newest first.

    Page 1 goes alone, since most of the time it is also the last; after that
    pages go PAGE_BATCH at a time and are yielded in order, stopping at the
    first page that is not full.

    `on_sent` is called once for every request that goes out, as in
    api_request.
    """
    log.debug("getting user index")
    t0 = time.perf_counter()

    page = 1
    batch = 1
    while page <= MAX_PAGE:
        pages = range(page, page + batch)
        results = await asyncio.gather(
            *(get_activity_index_page(user_session, p, on_sent=on_sent) for p in pages)
        )
        for p, result in zip(pages, results):
            for A in result:
                yield A
            if len(result) < PER_PAGE:
                elapsed = (time.perf_counter() - t0) * 1000
                log.debug("last page is %d, found in %d", p, elapsed)
                return
        page += batch
        batch = PAGE_BATCH


async def get_activities_since(
    user_session: aiohttp.ClientSession, after: int
) -> AsyncGenerator[Activity, None]:
    """
    Yield the athlete's activities that started after the given epoch second.

    This tops up an index that already exists, where the answer is nearly
    always "one page, and usually an empty one", so it pages one at a time.
    That keeps a freshness check down to a single Strava request. It is not
    bulk work: someone is waiting on the query it is part of.
    """
    log.debug("getting activities after %d", after)

    for page in range(1, MAX_PAGE + 1):
        result = await get_activity_index_page(
            user_session, page, bulk=False, after=after
        )
        for A in result:
            yield A

        # a page that is not full is the last one
        if len(result) < PER_PAGE:
            return


def activity_endpoint(activity_id: int) -> str:
    return f"{API_SPEC}/activities/{activity_id}?include_all_efforts=false"


async def fetch_activity(
    user_session: aiohttp.ClientSession, activity_id: int
) -> Activity | None:
    log.debug("fetching activity %d", activity_id)
    status, activity = await api_request(
        user_session, "GET", activity_endpoint(activity_id)
    )
    return activity


# ---------------------------------------------------------------------------- #
#                                Authentication                                #
#            See https://developers.strava.com/docs/authentication             #
# ---------------------------------------------------------------------------- #


AUTH_ENDPOINT = "/oauth/authorize"

CLIENT_ID = int(os.environ["STRAVA_CLIENT_ID"])
CLIENT_SECRET = os.environ["STRAVA_CLIENT_SECRET"]


class Credentials(TypedDict):
    client_id: int
    client_secret: str


Scope = Literal[
    "read",
    "read_all",
    "profile:read_all",
    "profile:write",
    "activity:read",
    "activity:read_all",
    "activity:write",
]


class AuthUrlParams(TypedDict):
    """The arguments we send to request Strava authorization for a user"""

    client_id: int
    redirect_uri: str
    state: Optional[str]
    response_type: Literal["code"]
    approval_prompt: Literal["force", "auto"]
    scope: str  # comma separated elements of Scopes


class AuthResponse(TypedDict, total=False):
    error: str
    code: str
    scope: str
    state: str


def auth_url(
    state: str = "",
    scope: list[Scope] = [],
    approval_prompt: str = "auto",
    redirect_uri: str = "http://localhost/exchange_token",
) -> urlstr:
    params = AuthUrlParams(
        client_id=CLIENT_ID,
        response_type="code",
        approval_prompt="force",
        scope=",".join(scope),
        redirect_uri=redirect_uri,
        state=state,
    )
    paramstr = urllib.parse.urlencode(params, safe=",:")
    return cast(urlstr, DOMAIN + AUTH_ENDPOINT + "?" + paramstr)


class TokenExchangeParams(Credentials, total=False):
    """The paramters required to fetch an access token (via code or refresh token)"""

    code: str
    refresh_token: str
    grant_type: Literal["authorization_code", "refresh_token"]


class TokenExchangeResponse(TypedDict):
    """The respose Strava sends us after user authenticates"""

    token_type: str
    access_token: str
    expires_at: epoch
    expires_in: int
    refresh_token: str
    athlete: Athlete


TOKEN_EXCHANGE_ENDPOINT = "/oauth/token"


# We can get the access_token for a user either with
# a code obtained via authentication, or with a refresh token
async def get_access_token(
    session=None, code=None, refresh_token=None
) -> TokenExchangeResponse:
    log.debug("refreshing access token from %s", "code" if code else "refresh_token")

    params = (
        TokenExchangeParams(
            client_id=CLIENT_ID,
            client_secret=CLIENT_SECRET,
            grant_type="authorization_code",
            code=code,
        )
        if code
        else TokenExchangeParams(
            client_id=CLIENT_ID,
            client_secret=CLIENT_SECRET,
            grant_type="refresh_token",
            refresh_token=refresh_token,
        )
    )

    # In the form body, not the query string, where client_secret and the
    # token or code would land in every URL that gets logged
    async with session.post(TOKEN_EXCHANGE_ENDPOINT, data=params) as response:
        rjson = await response.json()
    return cast(TokenExchangeResponse, rjson)


REVOKE_ENDPOINT = "/oauth/revoke"


async def revoke(
    session: aiohttp.ClientSession,
    token: str,
    token_type_hint: Literal["refresh_token", "access_token"] = "refresh_token",
) -> None:
    """
    Revoke an athlete's grant to us. Revoking either of their tokens revokes
    the other, and Strava answers 200 whether or not it knew the token, so a
    token that is already dead comes back as revoked too.

    This replaces POST /oauth/deauthorize, which Strava retires on 1 June 2027.
    That one authenticated with the athlete's access token, so a stale token
    had to be refreshed first. This one authenticates as the application
    (HTTP Basic, client_id:client_secret) and takes the refresh token, which
    does not expire. The header here replaces any Bearer header the session
    sends by default.
    """
    auth = aiohttp.encode_basic_auth(str(CLIENT_ID), CLIENT_SECRET)
    data = {"token": token, "token_type_hint": token_type_hint}
    async with session.post(
        REVOKE_ENDPOINT, data=data, headers={"Authorization": auth}
    ) as response:
        response.raise_for_status()


# ---------------------------------------------------------------------------- #
#                        Updates (Webhook subscription)                        #
#              see https://developers.strava.com/docs/webhooks/                #
# ---------------------------------------------------------------------------- #


class Updates(TypedDict, total=False):
    """The kinds of updates we might get"""

    title: str
    type: ActivityType
    private: bool
    authorized: bool


class WebhookUpdate(TypedDict):
    object_type: Literal["activity", "athlete"]
    object_id: int
    aspect_type: Literal["create", "update", "delete"]
    updates: Updates
    owner_id: int
    subscription_id: int
    event_time: epoch


class CreateSubscriptionParams(Credentials):
    callback_url: urlstr
    verify_token: str


CallbackValidation = TypedDict(
    "CallbackValidation",
    {"hub.mode": Literal["subscribe"], "hub.challenge": str, "hub.verify_token": str},
)


class CreateSubscriptionresponse(TypedDict):
    """subscription id"""

    id: int


# The shared secret Strava echoes back during the subscription handshake, so
# we can tell a real callback from anyone who guessed the URL. Overridable from
# the environment; the literal is the long-standing default.
SUBSCRIPTION_VERIFY_TOKEN = os.environ.get(
    "STRAVA_SUBSCRIPTION_VERIFY_TOKEN", "heatflask_yay!"
)
SUBSCRIPTION_ENDPOINT = f"{API_SPEC}/push_subscriptions"


async def create_subscription(
    admin_session: aiohttp.ClientSession, callback_url: urlstr
) -> CallbackValidation:
    params = CreateSubscriptionParams(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        verify_token=SUBSCRIPTION_VERIFY_TOKEN,
        callback_url=callback_url,
    )
    async with admin_session.post(SUBSCRIPTION_ENDPOINT, params=params) as response:
        return cast(CallbackValidation, await response.json())


# After calling create_subscription, you will receive a GET request at your
# supplied callback_url, whose json body is validation_dict.
#
# Your response must have HTTP code 200 and be of application/json content type.
# and be the return value of this function.
def subscription_verification(validation_dict: CallbackValidation):
    """
    Echo Strava's challenge back, but only if it presented our verify token.

    The comparison here was inverted -- `!=` -- so the challenge was echoed
    exactly when the token did *not* match. That fails both ways: Strava sends
    the right token and gets nothing back, so no subscription can ever be
    created; and anyone who guessed the callback URL and sent a wrong token
    got a valid handshake.

    master does not have this bug because it never hand-rolled the check: it
    hands the args to stravalib's client.handle_subscription_callback. This is
    a regression in the port that replaced stravalib with this module.
    """
    if validation_dict.get("hub.verify_token") == SUBSCRIPTION_VERIFY_TOKEN:
        return {"hub.challenge": validation_dict["hub.challenge"]}

    log.warning("subscription callback with a bad verify token")
    return None


async def view_subscription(
    admin_session: aiohttp.ClientSession,
) -> dict:
    params = Credentials(client_id=CLIENT_ID, client_secret=CLIENT_SECRET)
    async with admin_session.get(SUBSCRIPTION_ENDPOINT, params=params) as response:
        return await response.json()


async def delete_subscription(
    admin_session: aiohttp.ClientSession, subscription_id: int
) -> bool:
    """
    Delete our webhook subscription. True if Strava confirmed it (204).

    The id goes in the path, per Strava's docs. It was sent as a query
    parameter to /push_subscriptions itself, which cannot have worked -- and
    this is the call that moving hosts needs, since an application may have
    only one subscription and the old one points at the old callback URL.
    """
    params = Credentials(client_id=CLIENT_ID, client_secret=CLIENT_SECRET)
    url = f"{SUBSCRIPTION_ENDPOINT}/{int(subscription_id)}"
    async with admin_session.delete(url, params=params) as response:
        return response.status == 204


# ---------------------------------------------------------------------------- #
#                               The Strava Client                              #
# ---------------------------------------------------------------------------- #
class TokenStore(Protocol):
    """Where an athlete's Strava credentials are kept between requests"""

    async def load(self) -> Optional[TokenExchangeResponse]: ...

    async def save(self, auth: TokenExchangeResponse) -> None: ...


# One lock per client name (an athlete id), so an athlete's token refreshes
# take turns. Weak values: a lock lives only while someone holds or waits on it.
_refresh_locks: "weakref.WeakValueDictionary[Any, asyncio.Lock]" = (
    weakref.WeakValueDictionary()
)


def refresh_lock(name: str | int) -> asyncio.Lock:
    key = (id(asyncio.get_running_loop()), name)
    lock = _refresh_locks.get(key)
    if lock is None:
        lock = _refresh_locks[key] = asyncio.Lock()
    return lock


class AsyncClient:
    """
    Access Strava via this client, which takes care of refreshing access tokens for you,
    as well as batch Activity and Streams imports
    """

    name: str | int
    session: Optional[aiohttp.ClientSession] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    expires_at: Optional[epoch] = None
    token_store: Optional[TokenStore] = None

    def __init__(
        self,
        name: str | int,
        auth: Optional[TokenExchangeResponse] = None,
        token_store: Optional[TokenStore] = None,
    ):
        self.name = name
        self.token_store = token_store
        if auth:
            self.set_credentials(auth)

    def set_credentials(self, auth: TokenExchangeResponse):
        self.access_token = auth["access_token"]
        self.expires_at = auth["expires_at"]
        self.refresh_token = auth["refresh_token"]

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
            return await func(self.session, *args, **kwargs)
        except RateLimitExceeded:
            # always raised: the caller has to know why there is no answer
            raise
        except Exception as e:
            if raise_exception:
                raise
            log_failure(self, func, e)
            return None
        finally:
            if not in_context:
                await self.__aexit__()

    async def __iterate_with_session(
        self, func, *args, raise_exception=False, **kwargs
    ):
        """
        Iterate func's async generator inside a session.

        Stop early with aclose(). The finally clause closes the inner
        generator too, which is what cancels any requests it still has in
        flight, and only then closes the session they were using.
        """
        in_context = self.session is not None

        if not in_context:
            await self.__aenter__()

        aiterator = func(self.session, *args, **kwargs)
        try:
            async for item in aiterator:
                yield item
        except RateLimitExceeded:
            raise
        except Exception as e:
            if raise_exception:
                raise
            log_failure(self, func, e)
        finally:
            await aiterator.aclose()
            if not in_context:
                await self.__aexit__()

    async def update_access_token(
        self, code: str = ""
    ) -> Optional[TokenExchangeResponse]:
        """
        Get a new access token, with a login's auth code or the refresh token.

        Without a code this does nothing unless the token is about to expire.

        Strava hands back a new refresh token with every refresh and
        invalidates the old one at once. Nothing here used to keep the new
        one, so the first refresh after a login -- any time more than six hours
        later -- left the stored refresh token dead, the next refresh failed
        silently, and that athlete's Strava access stopped working until they
        logged in again. Two refreshes racing with the same token did the same.

        So refreshes for one athlete take turns (a lock per client name), each
        first reloads the credentials from `token_store` in case another request
        already refreshed, and a new token is saved back before anyone else can
        use the old one.
        """
        if code:
            return await self._exchange(code=code)

        if not self.token_is_stale:
            log.debug("access token is current")
            return None

        async with refresh_lock(self.name):
            if self.token_store:
                latest = await self.token_store.load()
                if latest and latest.get("refresh_token") != self.refresh_token:
                    await self._adopt(latest)
                if not self.token_is_stale:
                    log.debug("%s: token was refreshed elsewhere", self.name)
                    return None

            new_auth = await self._exchange(refresh_token=self.refresh_token)
            if new_auth and self.token_store:
                await self.token_store.save(new_auth)
            return new_auth

    @property
    def token_is_stale(self) -> bool:
        return bool(self.refresh_token) and (self.expires_in or 0) < STALE_TOKEN

    async def _adopt(self, auth: TokenExchangeResponse) -> None:
        self.set_credentials(auth)
        # Inside a session context, the session's headers carry the old token
        if self.session:
            await self.session.close()
            self.session = self.new_session()

    async def _exchange(
        self, code: str = "", refresh_token: Optional[str] = None
    ) -> Optional[TokenExchangeResponse]:
        t0 = time.perf_counter()
        session = self.session or self.new_session()
        try:
            response = await get_access_token(
                session, code=code, refresh_token=refresh_token
            )
        except Exception as e:
            # Not %r of the exception: a ClientResponseError's repr carries the
            # request URL, and the credentials used to ride in its query string
            detail = (
                f"{e.status} {e.message}"
                if isinstance(e, aiohttp.ClientResponseError)
                else type(e).__name__
            )
            log.warning(
                "%s token %s failed: %s",
                self.name,
                "exchange" if code else "refresh",
                detail,
            )
            return None
        finally:
            # This was `if self.session`, which closed the context's own
            # session and leaked the temporary one made just above
            if session is not self.session:
                await session.close()

        if not response.get("refresh_token"):
            log.info("No refresh token in response?!")
            return None

        new_auth_info = cast(TokenExchangeResponse, response)
        await self._adopt(new_auth_info)

        elapsed = (time.perf_counter() - t0) * 1000
        log.info("%s token refresh took %d", self.name, elapsed)
        return new_auth_info

    async def deauthenticate(self, raise_exception: bool = False) -> bool:
        """
        Revoke this athlete's grant to us. True if Strava confirmed it.

        No refresh first: revoke takes the refresh token as it is. It does
        take the refresh lock, and the latest stored credentials, so that it
        cannot revoke a refresh token that a refresh in flight is replacing.
        """
        async with refresh_lock(self.name):
            if self.token_store:
                latest = await self.token_store.load()
                if latest:
                    self.set_credentials(latest)
            token = self.refresh_token or self.access_token
            if not token:
                return False
            hint: Literal["refresh_token", "access_token"] = (
                "refresh_token" if self.refresh_token else "access_token"
            )
            try:
                async with aiohttp.ClientSession(
                    DOMAIN, raise_for_status=True
                ) as session:
                    await revoke(session, token, hint)
            except Exception as e:
                if raise_exception:
                    raise
                log_failure(self, revoke, e)
                return False
        return True

    # Wrapped functions

    def get_athlete(self, **kwargs: Any) -> Awaitable[Athlete]:
        """Return the current Athlete, whose credentials we are using"""
        return self.__run_with_session(get_athlete, **kwargs)

    def get_streams(
        self, activity_id: int, **kwargs: Any
    ) -> Awaitable[StreamsFetchResult]:
        """Return streams for an Activity"""
        return self.__run_with_session(get_streams, activity_id, **kwargs)

    def get_many_streams(
        self, activity_ids: list[int], max_errors=MAX_STREAMS_ERRORS, **kwargs: Any
    ) -> AsyncGenerator[StreamsResult, None]:
        """An async generatory of streams for a list of given IDs"""
        return self.__iterate_with_session(
            get_many_streams, activity_ids, max_errors=max_errors, **kwargs
        )

    def get_activity(
        self, activity_id: int, **kwargs: Any
    ) -> Awaitable[Activity | None]:
        """Get an Activity (summary) from Strava"""
        return self.__run_with_session(fetch_activity, activity_id, **kwargs)

    def get_all_activities(self, **kwargs: Any) -> AsyncGenerator[Activity, None]:
        """async generator of all Activities (summaries)"""
        return self.__iterate_with_session(get_all_activities, **kwargs)

    def get_activities_since(
        self, after: int, **kwargs: Any
    ) -> AsyncGenerator[Activity, None]:
        """async generator of Activities that started after `after` (epoch)"""
        return self.__iterate_with_session(get_activities_since, after, **kwargs)

    def create_subscription(
        self, callback_url: str, **kwargs: Any
    ) -> Awaitable[CallbackValidation]:
        """Create a new Webhook subscription"""
        return self.__run_with_session(create_subscription, callback_url, **kwargs)

    def view_subscription(self, **kwargs: Any) -> dict:
        """View current Webhook subscriptions"""
        return self.__run_with_session(view_subscription, **kwargs)

    def delete_subscription(self, subscription_id: int, **kwargs: Any):
        """Delete Webhook subscription"""
        return self.__run_with_session(delete_subscription, subscription_id, **kwargs)
