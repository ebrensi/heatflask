import os
import time
import aiohttp
from logging import getLogger
import urllib

log = getLogger(__name__)
log.propagate = True

STRAVA_DOMAIN = "https://www.strava.com"
API_SPEC = "/api/v3"

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
    "grant_type": "authorization_code"
}


def auth_url(redirect_uri=None, state=None):

    params = {**AUTH_PARAMS, "redirect_uri": redirect_uri, "state": state}

    return STRAVA_DOMAIN + AUTH_ENDPOINT + "?" + urllib.parse.urlencode(params)


def StravaSession(headers=None):
    return aiohttp.ClientSession(STRAVA_DOMAIN, headers=headers)


async def exchange_code_for_token(code):
    t0 = time.perf_counter()
    params = {**TOKEN_EXCHANGE_PARAMS, "code": code}
    sesh = StravaSession()
    async with sesh.get(TOKEN_EXCHANGE_ENDPOINT, params=params) as response:
        if response.staus == 200:
            log.info("token exchange failed")

        rjson = await response.json()
    elapsed = time.perf_counter() - t0
    log.info(f"token exchange took {elapsed:2f}")
    return rjson


"""
class StravaClient(object):
    # Stravalib includes a lot of unnecessary overhead
    #  so we have our own in-house client
    PAGE_REQUEST_CONCURRENCY = app.config["PAGE_REQUEST_CONCURRENCY"]
    PAGE_SIZE = app.config.get("PAGE_SIZE", 200)
    MAX_PAGE = 100

    STREAMS_TO_IMPORT = app.config["STREAMS_TO_IMPORT"]
    # MAX_PAGE = 3  # for testing

    BASE_URL = "https://www.strava.com/api/v3"

    GET_ACTIVITIES_ENDPOINT = "/athlete/activities?per_page={page_size}"
    GET_ACTIVITIES_URL = BASE_URL + GET_ACTIVITIES_ENDPOINT.format(page_size=PAGE_SIZE)

    GET_STREAMS_ENDPOINT = "/activities/{id}/streams?keys={keys}&key_by_type=true&series_type=time&resolution=high"
    GET_STREAMS_URL = BASE_URL + GET_STREAMS_ENDPOINT.format(
        id="{id}", keys=",".join(STREAMS_TO_IMPORT)
    )

    GET_ACTIVITY_ENDPOINT = "/activities/{id}?include_all_efforts=false"
    GET_ACTIVITY_URL = BASE_URL + GET_ACTIVITY_ENDPOINT.format(id="{id}")

    def __init__(self, access_token=None, user=None):
        self.user = user
        self.id = str(user)
        self.cancel_stream_import = False
        self.cancel_index_import = False

        if access_token:
            self.access_token = access_toke
        elif user:
            stravalib_client = user.client()
            if not stravalib_client:
                return
            self.access_token = stravalib_client.access_token

    def __repr__(self):
        return "C:{}".format(self.id)

    @classmethod
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

    def headers(self):
        return {"Authorization": "Bearer {}".format(self.access_token)}

    def get_raw_activity(self, _id, streams=True):
        cls = self.__class__
        # get one activity summary object from strava
        url = cls.GET_ACTIVITY_URL.format(id=_id)
        # log.debug("sent request %s", url)
        try:
            response = requests.get(url, headers=self.headers())
            response.raise_for_status()

            raw = response.json()
            if "id" not in raw:
                raise UserWarning(raw)
        except HTTPError as e:
            log.error(e)
            return False
        except Exception:
            log.exception("%s import-by-id %s failed", self, _id)
            return False

        if streams:
            raw = Activities.import_streams(self, raw)
        return raw

    def get_activity(self, _id):
        cls = self.__class__
        # get one activity summary object from strava
        raw = self.get_raw_activity(_id)
        try:
            return cls.strava2doc(raw)
        except Exception:
            log.exception("%s import-by-id %s failed", self, _id)
            return False

    def get_activities(self, ordered=False, **query):
        cls = self.__class__
        self.cancel_index_import = False

        query_base_url = cls.GET_ACTIVITIES_URL

        #  handle parameters
        try:
            if "limit" in query:
                limit = int(query["limit"])
            else:
                limit = None

            if "before" in query:
                before = Utility.to_epoch(query["before"])
                query_base_url += "&before={}".format(before)

            if "after" in query:
                after = Utility.to_epoch(query["after"])
                query_base_url += "&after={}".format(after)

        except Exception:
            log.exception("%s get_activities: parameter error", self)
            return

        page_stats = dict(pages=0, dt=0, emp=0)

        def page_iterator():
            page = 1
            while page <= self.final_index_page:
                yield page
                page += 1

        def request_page(pagenum):

            if pagenum > self.final_index_page:
                log.debug("%s index page %s cancelled", self, pagenum)
                return pagenum, None

            url = query_base_url + "&page={}".format(pagenum)

            log.debug("%s request index page %s", self, pagenum)
            page_timer = Timer()

            try:
                response = requests.get(url, headers=self.headers())
                response.raise_for_status()
                activities = response.json()

            except Exception:
                log.exception("%s failed index page request", self)
                activities = "error"

            elapsed = page_timer.elapsed()
            size = len(activities)

            #  if this page has fewer than PAGE_SIZE entries
            #  then there cannot be any further pages
            if size < cls.PAGE_SIZE:
                self.final_index_page = min(self.final_index_page, pagenum)

            # record stats
            if size:
                page_stats["dt"] += elapsed
                page_stats["pages"] += 1
            else:
                page_stats["emp"] += 1

            log.debug("%s index page %s %s", self, pagenum, dict(dt=elapsed, n=size))

            return pagenum, activities

        tot_timer = Timer()
        pool = gevent.pool.Pool(cls.PAGE_REQUEST_CONCURRENCY)

        num_activities_retrieved = 0
        num_pages_processed = 0

        self.final_index_page = cls.MAX_PAGE

        # imap_unordered gives a little better performance if order
        #   of results doesn't matter, which is the case if we aren't
        #   limited to the first n elements.
        mapper = pool.imap if (limit or ordered) else pool.imap_unordered

        jobs = mapper(
            request_page, page_iterator(), maxsize=cls.PAGE_REQUEST_CONCURRENCY + 2
        )

        try:
            while num_pages_processed <= self.final_index_page:

                pagenum, activities = next(jobs)

                if activities == "error":
                    raise UserWarning("Strava error")

                num = len(activities)
                if num < cls.PAGE_SIZE:
                    total_num_activities = (pagenum - 1) * cls.PAGE_SIZE + num
                    yield {"count": total_num_activities}

                if limit and (num + num_activities_retrieved > limit):
                    # make sure no more requests are made
                    # log.debug("no more pages after this")
                    self.final_index_page = pagenum

                for a in activities:
                    doc = cls.strava2doc(a)
                    if not doc:
                        continue

                    abort_signal = yield doc

                    if abort_signal:
                        log.info("%s get_activities aborted", self)
                        raise StopIteration("cancelled by user")

                    num_activities_retrieved += 1
                    if limit and (num_activities_retrieved >= limit):
                        break

                num_pages_processed += 1

        except StopIteration:
            pass
        except UserWarning:
            # TODO: find a more graceful way to do this
            log.exception("%s", activities)
            self.user.delete()
        except Exception as e:
            log.exception(e)

        try:
            pages = page_stats["pages"]
            if pages:
                page_stats["resp"] = round(page_stats.pop("dt") / pages, 2)
                page_stats["rate"] = round(pages / tot_timer.elapsed(), 2)
            log.info("%s index %s", self, page_stats)
        except Exception:
            log.exception("page stats error")

        self.final_index_page = min(pagenum, self.final_index_page)
        pool.kill()

    def get_activity_streams(self, _id):
        if self.cancel_stream_import:
            log.debug("%s import %s canceled", self, _id)
            return False

        cls = self.__class__

        url = cls.GET_STREAMS_URL.format(id=_id)

        def extract_stream(stream_dict, s):
            if s not in stream_dict:
                raise UserWarning("stream {} absent".format(s))
            stream = stream_dict[s]["data"]
            if len(stream) < 3:
                raise UserWarning("stream {} insufficient".format(s))
            return stream

        try:
            response = requests.get(url, headers=self.headers())
            response.raise_for_status()

            stream_dict = response.json()

            if not stream_dict:
                raise UserWarning("no streams")

            streams = {s: extract_stream(stream_dict, s) for s in cls.STREAMS_TO_IMPORT}
        except HTTPError as e:
            code = e.response.status_code
            log.info("%s A:%s http error %s", self, _id, code)
            return None if code == 404 else False

        except UserWarning as e:
            log.info("%s A:%s %s", self, _id, e)
            return

        except Exception:
            log.exception("%s A:%s failed get streams", self, _id)
            return False

        return streams
"""
