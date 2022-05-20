"""
***  For Jupyter notebook ***
Paste one of these Jupyter magic directives to the top of a cell
 and run it, to do these things:
    %load Strava.py         # Load Strava.py file into this (empty) cell
    %%writefile Strava.py   # Write the contents of this cell to Strava.py
"""

import os
import time
import aiohttp
from logging import getLogger
import urllib.parse
import asyncio
import datetime
import types
from typing import (
    AsyncGenerator,
    Awaitable,
    Optional,
    TypedDict,
    Tuple,
    Literal,
    Final,
    NamedTuple,
    cast,
    get_args,
    Any,
)


from .Types import epoch, urlstr

log = getLogger(__name__)
log.propagate = True
log.setLevel("INFO")

API_SPEC = "/api/v3"
DOMAIN = "https://www.strava.com"

STALE_TOKEN: Final = 300  # Refresh access token if only this many seconds left
CONCURRENCY: Final = 10

myBox = types.SimpleNamespace(limiter=None)


def get_limiter() -> asyncio.locks.Semaphore:
    """We use this to limit concurrency"""
    if myBox.limiter is None:
        myBox.limiter = asyncio.Semaphore(CONCURRENCY)
    return myBox.limiter


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
    async with session.get(ATHLETE_ENDPOINT) as response:
        return cast(Athlete, await response.json())


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
    session: aiohttp.ClientSession, activity_id: int
) -> StreamsFetchResult:
    t0 = time.perf_counter()

    request_params = StreamsRequestParams(
        id=activity_id, keys=KEYS_STR, key_by_type="true"
    )
    async with get_limiter():
        try:
            async with session.get(
                STREAMS_ENDPOINT(activity_id), params=request_params
            ) as response:
                rjson = await response.json()
                rstatus = response.status
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
) -> AsyncGenerator[StreamsResult, bool]:
    request_tasks = [get_streams(session, aid) for aid in activity_ids]
    errors = 0
    abort_signal = None
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
MAX_PAGE = 50

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


async def get_all_activities(
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


async def fetch_activity(
    user_session: aiohttp.ClientSession, activity_id: int
) -> Activity | None:
    log.debug("fetching activity %d", activity_id)
    async with user_session.get(activity_endpoint(activity_id)) as r:
        return await r.json()


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


class AuthInfo(NamedTuple):
    """A (named) Tuple of Access Token, Expire timestamp, and Refresh Token"""

    access_token: str
    expires_at: epoch
    refresh_token: str


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

    async with session.post(TOKEN_EXCHANGE_ENDPOINT, params=params) as response:
        rjson = await response.json()
    return cast(TokenExchangeResponse, rjson)


class DeauthResponse(TypedDict):
    access_token: str


DEAUTH_ENDPOINT = "/oauth/deauthorize"


async def deauth(session):
    log.debug("  deauthenticating")
    async with session.post(DEAUTH_ENDPOINT) as response:
        return cast(DeauthResponse, await response.json())


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


SUBSCRIPTION_VERIFY_TOKEN = "heatflask_yay!"
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
    if validation_dict.get("hub.verify_token") != SUBSCRIPTION_VERIFY_TOKEN:
        return {"hub.challenge": validation_dict["hub.challenge"]}


async def view_subscription(
    admin_session: aiohttp.ClientSession,
) -> dict:
    params = Credentials(client_id=CLIENT_ID, client_secret=CLIENT_SECRET)
    async with admin_session.get(SUBSCRIPTION_ENDPOINT, params=params) as response:
        return await response.json()


class DeleteSubscriptionParams(Credentials):
    id: int


async def delete_subscription(
    admin_session: aiohttp.ClientSession, subscription_id: int
) -> dict:
    params = DeleteSubscriptionParams(
        client_id=CLIENT_ID, client_secret=CLIENT_SECRET, id=subscription_id
    )
    async with admin_session.delete(SUBSCRIPTION_ENDPOINT, params=params) as response:
        return response.status == 204


# ---------------------------------------------------------------------------- #
#                               The Strava Client                              #
# ---------------------------------------------------------------------------- #
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

    def __init__(self, name: str | int, auth: Optional[AuthInfo] = None):
        self.name = name
        if auth:
            self.set_credentials(auth)

    def set_credentials(self, auth: AuthInfo):
        self.access_token = auth.access_token
        self.expires_at = auth.expires_at
        self.refresh_token = auth.refresh_token

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
        """Abort an async_iterator returned by this class"""
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

    async def update_access_token(
        self, code: str = ""
    ) -> Optional[TokenExchangeResponse]:
        """Update the access_token with a new auth-code or stored refresh-token"""
        if not (code or (self.refresh_token and (self.expires_in < STALE_TOKEN))):
            log.debug("access token is current")
            return None

        t0 = time.perf_counter()

        session = self.session or self.new_session()

        try:
            response = await get_access_token(
                session, code=code, refresh_token=self.refresh_token
            )
        except Exception:
            return None

        finally:
            if self.session:
                await session.close()

        if not response.get("refresh_token"):
            log.info("No refresh token in response?!")
            return None

        self.set_credentials(
            AuthInfo(
                access_token=response["access_token"],
                expires_at=response["expires_at"],
                refresh_token=response["refresh_token"],
            )
        )

        # If we are inside a session-context
        if self.session:
            self.session = self.new_session()

        elapsed = (time.perf_counter() - t0) * 1000
        log.info("%s token refresh took %d", self.name, elapsed)

        return response

    # Wrapped functions
    def deauthenticate(self, **kwargs: Any) -> Awaitable[DeauthResponse]:
        """Revoke this client's Credentials"""
        return self.__run_with_session(deauth, **kwargs)

    def get_athlete(self, **kwargs: Any) -> Awaitable[Athlete]:
        """Return the current Athlete, whose credentials we are using"""
        return self.__run_with_session(get_athlete, **kwargs)

    def get_streams(
        self, activity_id: int, **kwargs: Any
    ) -> Awaitable[StreamsFetchResult]:
        """Return streams for an Activity"""
        return self.__run_with_session(get_streams, **kwargs)

    def get_many_streams(
        self, activity_ids: list[int], max_errors=MAX_STREAMS_ERRORS, **kwargs: Any
    ) -> AsyncGenerator[StreamsResult, bool]:
        """An async generatory of streams for a list of given IDs"""
        return self.__iterate_with_session(
            get_many_streams, activity_ids, max_errors=max_errors, **kwargs
        )

    def get_activity(
        self, activity_id: int, **kwargs: Any
    ) -> Awaitable[Activity | None]:
        """Get an Activity (summary) from Strava"""
        return self.__run_with_session(fetch_activity, activity_id, **kwargs)

    def get_all_activities(self, **kwargs: Any) -> AsyncGenerator[Activity, bool]:
        """async generator of all Activities (summaries)"""
        return self.__iterate_with_session(get_all_activities, **kwargs)

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
