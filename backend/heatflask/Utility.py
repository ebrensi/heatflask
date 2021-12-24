import requests
import dateutil
import uuid
import time
from datetime import datetime
from itertools import islice, repeat, starmap, takewhile
from operator import truth

from . import EPOCH, redis


class Utility:
    @staticmethod
    def cleandict(d):
        return {k: v for k, v in d.items() if v}

    @staticmethod
    def href(url, text):
        return "<a href='{}' target='_blank'>{}</a>".format(url, text)

    @staticmethod
    def ip_lookup_url(ip):
        return "http://freegeoip.net/json/{}".format(ip) if ip else "#"

    @staticmethod
    def ip_address(flask_request_object):
        return flask_request_object.access_route[-1]

    @classmethod
    def ip_lookup(cls, ip_address):
        r = requests.get(cls.ip_lookup_url(ip_address))
        return r.json()

    @classmethod
    def ip_timezone(cls, ip_address):
        tz = cls.ip_lookup(ip_address)["time_zone"]
        return tz if tz else "America/Los_Angeles"

    @staticmethod
    def utc_to_timezone(dt, timezone="America/Los_Angeles"):
        from_zone = dateutil.tz.gettz("UTC")
        to_zone = dateutil.tz.gettz(timezone)
        utc = dt.replace(tzinfo=from_zone)
        return utc.astimezone(to_zone)

    @staticmethod
    def to_datetime(obj):
        if not obj:
            return
        if isinstance(obj, datetime):
            return obj
        elif isinstance(obj, int):
            return datetime.utcfromtimestamp(obj)
        try:
            dt = dateutil.parser.parse(obj, ignoretz=True)
        except ValueError:
            return
        else:
            return dt

    @staticmethod
    def to_epoch(dt):
        return int((dt - EPOCH).total_seconds())

    @staticmethod
    def set_genID(ttl=600):
        genID = "G:{}".format(uuid.uuid4().get_hex())
        redis.setex(genID, ttl, 1)
        return genID

    @staticmethod
    def del_genID(genID):
        content = redis.get(genID)
        if content:
            redis.delete(genID)

    @staticmethod
    def chunks(iterable, size=10):
        return takewhile(
            truth, map(tuple, starmap(islice, repeat((iter(iterable), size))))
        )


# FakeQueue is a a queue that does nothing.  We use this for import queue if
#  the user is offline or does not have a valid access token
class FakeQueue(object):
    def put(self, x):
        return


class Timer(object):
    def __init__(self):
        self.start = time.time()

    def elapsed(self):
        return round(time.time() - self.start, 2)
