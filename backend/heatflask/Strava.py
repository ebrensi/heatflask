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

import Utility

log = getLogger(__name__)
log.propagate = True


STRAVA_DOMAIN = "https://www.strava.com"
STALE_TOKEN = 300
CONCURRENCY = 10

LIMITER = asyncio.Semaphore(CONCURRENCY)

# Client class takes care of refreshing access tokens
class AsyncClient:
    def __init__(self, name, **kwargs):
        self.name = name
        self.set_state(**kwargs)
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

    def new_session(self):
        return aiohttp.ClientSession(
            STRAVA_DOMAIN, headers=self.headers, raise_for_status=True
        )

    async def __aenter__(self):
        self.session = self.new_session()
        log.debug("opening new aiohttp session")
        await self.update_access_token()

    async def __aexit__(self, *args):
        await self.session.close()
        log.debug("closed session")
        self.session = None

    async def __run_with_session(self, func, *args, **kwargs):
        in_context = self.session is not None

        if not in_context:
            await self.__aenter__()

        try:
            result = await func(self.session, *args, **kwargs)
        except Exception:
            log.exception("%s, %s", self, func)

        if not in_context:
            await self.__aexit__()

        return result

    @staticmethod
    async def abort(async_iterator):
        try:
            await async_iterator.asend(1)
        except StopAsyncIteration:
            pass

    async def __iterate_with_session(self, func, *args, **kwargs):
        in_context = self.session is not None

        if not in_context:
            await self.__aenter__()

        aiterator = func(self.session, *args, **kwargs)
        async for item in aiterator:
            abort_signal = yield item
            if abort_signal:
                await self.__class__.abort(aiterator)
                break

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

AUTH_ENDPOINT = "/oauth/authorize"
AUTH_PARAMS = {
    "client_id": os.environ["STRAVA_CLIENT_ID"],
    "client_secret": os.environ["STRAVA_CLIENT_SECRET"],
}
AUTH_URL_PARAMS = {
    **AUTH_PARAMS,
    "client_secret": None,
    "response_type": "code",
    "approval_prompt": "auto",  # or "force"
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


def get_auth_url(redirect_uri="http://localhost/exchange_token", state=None):
    params = Utility.cleandict(
        {**AUTH_URL_PARAMS, "redirect_uri": redirect_uri, "state": state}
    )
    return (
        STRAVA_DOMAIN + AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params, safe=",:")
    )


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


def streams_endpoint(activity_id):
    return f"{API_SPEC}/activities/{activity_id}/streams"


async def get_streams(session, activity_id):
    t0 = time.perf_counter()
    async with LIMITER:
        async with session.get(
            streams_endpoint(activity_id), params=ACTIVITY_STREAM_PARAMS
        ) as response:
            rjson = await response.json()
            rstatus = response.status

    if not (rjson and ("time" in rjson)):
        log.info("problem with activity %d: %s", activity_id, (rstatus, rjson))
        return activity_id, None

    dt_fetch = (time.perf_counter() - t0) * 1000
    n = rjson["time"]["original_size"]
    log.debug("streams %d: n=%d, dt=%d", activity_id, n, dt_fetch)

    return activity_id, rjson


async def get_many_streams(
    session,
    activity_ids,
):
    request_tasks = [get_streams(session, aid) for aid in activity_ids]
    errors = 0
    for task in asyncio.as_completed(request_tasks):
        try:
            activity_id, result = await task
        except Exception as e:
            log.error(e)
            errors += 1
            if errors > MAX_STREAMS_ERRORS:
                abort_signal = True
        else:
            abort_signal = yield activity_id, result

        if abort_signal:
            log.info("get_many_streams aborted")
            return


#
# Index pages
#
PER_PAGE = 200
ACTIVITY_LIST_ENDPOINT = f"{API_SPEC}/athlete/activities"
params = {"per_page": PER_PAGE}


async def get_activity_index_page(session, p):
    t0 = time.perf_counter()
    async with LIMITER:
        log.debug("Page %d requested", p)
        async with session.get(
            ACTIVITY_LIST_ENDPOINT, params={**params, "page": p}
        ) as r:
            status = r.status
            result = await r.json()

    elapsed_ms = (time.perf_counter() - t0) * 1000
    log.debug("Page %d retrieved in %d", p, elapsed_ms)
    return status, p, result


def page_request(session, p):
    return asyncio.create_task(get_activity_index_page(session, p))


EMPTY_LIST = []

MAX_PAGE = 50


async def get_index(user_session):
    log.debug("getting user index")

    t0 = time.perf_counter()
    tasks = [page_request(user_session, p) for p in range(1, MAX_PAGE)]

    last_page = None
    for task in asyncio.as_completed(tasks):
        try:
            status, last_page, result = await task
        except Exception as e:
            log.exception("index page read error")
            return

        if not len(result):
            # If this page has no results then break out of this loop
            #  because we know page-1 is the last page
            elapsed = (time.perf_counter() - t0) * 1000
            log.debug("found last page (%d) in %d", last_page - 1, elapsed)
            break

    for task in tasks[last_page:]:
        task.cancel()

    for task in asyncio.as_completed(tasks[:last_page]):
        status, page, result = await task
        for A in result:
            abort_signal = yield A
            if abort_signal:
                for task in tasks[:last_page]:
                    task.cancel()
                await asyncio.wait(tasks)
                log.debug("indexing cancelled")
                return
        log.debug("done with page %d", page)


def activity_endpoint(activity_id):
    return f"{API_SPEC}/activities/{activity_id}?include_all_efforts=false"


async def get_activity(user_session, activity_id):
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
DELETE_SUBSCRIPTION_PARAMS = {
    **VIEW_SUBSCRIPTION_PARAMS,
    "id": None,
}


async def create_subscription(admin_session, callback_url):
    params = {**CREATE_SUBSCRIPTION_PARAMS, "callback_url": callback_url}
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


async def view_subscription(admin_session):
    async with admin_session.get(SUBSCRIPTION_ENDPOINT, params=params) as response:
        return await response.json()


async def delete_subscription(admin_session, subscription_id=None):
    params = {**DELETE_SUBSCRIPTION_PARAMS, "id": subscription_id}
    async with admin_session.delete(SUBSCRIPTION_ENDPOINT, params=params) as response:
        return response.status == 204
