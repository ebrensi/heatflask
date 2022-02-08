import requests
import dateutil
import uuid
import time
from datetime import datetime
from itertools import islice, repeat, starmap, takewhile
from operator import truth


def cleandict(d: dict) -> dict:
    return {k: v for k, v in d.items() if v}


def href(url, text):
    return "<a href='{}' target='_blank'>{}</a>".format(url, text)


def ip_lookup_url(ip):
    return "http://freegeoip.net/json/{}".format(ip) if ip else "#"


def ip_lookup(cls, ip_address):
    r = requests.get(cls.ip_lookup_url(ip_address))
    return r.json()


def ip_timezone(cls, ip_address):
    tz = ip_lookup(ip_address)["time_zone"]
    return tz if tz else "America/Los_Angeles"


def utc_to_timezone(dt, timezone="America/Los_Angeles"):
    from_zone = dateutil.tz.gettz("UTC")
    to_zone = dateutil.tz.gettz(timezone)
    utc = dt.replace(tzinfo=from_zone)
    return utc.astimezone(to_zone)


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


EPOCH = datetime.utcfromtimestamp(0)


def to_epoch(dt):
    return int((to_datetime(dt) - EPOCH).total_seconds())


def chunks(iterable, size=10):
    return takewhile(truth, map(tuple, starmap(islice, repeat((iter(iterable), size)))))
